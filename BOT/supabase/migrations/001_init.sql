-- RanksBot :: initial schema
-- Target: Supabase / Postgres
-- Run from: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
-- Idempotent: safe to run more than once.

-- ============================================================
-- ranks  (single source of truth for rank definitions)
-- ============================================================
create table if not exists public.ranks (
  idx        int  primary key,
  key        text not null unique,
  name_ar    text not null,
  name_en    text not null,
  emoji      text not null,
  min_points int  not null
);

-- Seed the 14 ranks. Edit thresholds with one-line updates, e.g.:
--   update public.ranks set min_points = 120 where key = 'solo_cadet';
insert into public.ranks (idx, key, name_ar, name_en, emoji, min_points) values
  (1,  'cadet',               'كاديت',              'Cadet',               '🔰',     0),
  (2,  'solo_cadet',          'سولو كاديت',         'Solo Cadet',          '🔰',     100),
  (3,  'officer_1',           'أوفيسر 1',           'Officer 1',           '⭐',     250),
  (4,  'officer_2',           'أوفيسر 2',           'Officer 2',           '⭐⭐',   500),
  (5,  'officer_3',           'أوفيسر 3',           'Officer 3',           '⭐⭐⭐', 900),
  (6,  'senior_officer',      'سينيور أوفيسر',      'Senior Officer',      '🎖️',  1500),
  (7,  'senior_lead_officer', 'سينيور ليد أوفيسر',  'Senior Lead Officer', '🎖️',  2300),
  (8,  'sergeant',            'سارجنت',             'Sergeant',            '🪖',   3400),
  (9,  'first_sergeant',      'فيرست سارجنت',       'First Sergeant',      '🪖',   5000),
  (10, 'staff_sergeant',      'ستاف سارجنت',        'Staff Sergeant',      '🪖',   7000),
  (11, 'lieutenant',          'لوتينت',             'Lieutenant',          '🏅',  10000),
  (12, 'captain',             'كابتن',              'Captain',             '🥇',  14000),
  (13, 'chief_of_police',     'رئيس الشرطة',        'Chief of Police',     '🛡️',  20000),
  (14, 'minister',            'الوزير',             'Minister',            '👑',  30000)
on conflict (idx) do update
  set key        = excluded.key,
      name_ar    = excluded.name_ar,
      name_en    = excluded.name_en,
      emoji      = excluded.emoji,
      min_points = excluded.min_points;

-- ============================================================
-- channels  (one row per Kick broadcaster)
-- ============================================================
create table if not exists public.channels (
  id         bigint primary key,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- members  (points per viewer per channel)
-- ============================================================
create table if not exists public.members (
  channel_id      bigint      not null references public.channels (id) on delete cascade,
  kick_user_id    bigint      not null,
  username        text        not null default '',
  points          int         not null default 0,
  message_count   int         not null default 0,
  rank_idx        int         not null default 1,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (channel_id, kick_user_id)
);

create index if not exists members_leaderboard_idx
  on public.members (channel_id, points desc);

create index if not exists members_username_idx
  on public.members (channel_id, lower(username));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();

-- ============================================================
-- rank_events  (rank-up history)
-- ============================================================
create table if not exists public.rank_events (
  id            bigserial primary key,
  channel_id    bigint      not null references public.channels (id) on delete cascade,
  kick_user_id  bigint      not null,
  from_rank     int         not null,
  to_rank       int         not null,
  points        int         not null,
  created_at    timestamptz not null default now()
);

create index if not exists rank_events_member_idx
  on public.rank_events (channel_id, kick_user_id, created_at desc);

-- ============================================================
-- kick_tokens  (one row per channel; server key only)
-- ============================================================
create table if not exists public.kick_tokens (
  channel_id         bigint primary key references public.channels (id) on delete cascade,
  broadcaster_user_id bigint not null,
  access_token       text   not null,
  refresh_token      text   not null,
  expires_at         timestamptz not null,
  scope              text,
  updated_at         timestamptz not null default now()
);

-- ============================================================
-- rank_for_points(p) -> idx  (highest rank whose min_points <= p)
-- ============================================================
create or replace function public.rank_for_points(p int)
returns int
language sql
stable
as $$
  select idx
  from public.ranks
  where min_points <= p
  order by min_points desc
  limit 1;
$$;

-- ============================================================
-- apply_points(channel, batch) -> rank-up rows
--
-- p_batch is a jsonb array of objects:
--   { "user_id": 123, "username": "foo", "delta": 1, "messages": 1 }
--
-- Atomic per row, safe under concurrent calls:
--   * row lock taken before the update, so two concurrent batches
--     never overwrite each other's points
--   * points are incremented (never assigned), message_count too
--   * rank_idx is recomputed from the DB ranks table
--   * a row is returned only when the rank actually changed
-- ============================================================
create or replace function public.apply_points(p_channel_id bigint, p_batch jsonb)
returns table (
  kick_user_id  bigint,
  username      text,
  points        int,
  message_count int,
  rank_idx      int,
  prev_rank     int
)
language plpgsql
as $$
declare
  item      jsonb;
  v_uid     bigint;
  v_name    text;
  v_delta   int;
  v_msgs    int;
  v_prev    int;
  v_rank    int;
  v_points  int;
  v_count   int;
  v_stored  text;
begin
  if p_batch is null or jsonb_array_length(p_batch) = 0 then
    return;
  end if;

  for item in select * from jsonb_array_elements(p_batch)
  loop
    v_uid   := (item ->> 'user_id')::bigint;
    v_name  := coalesce(item ->> 'username', '');
    v_delta := coalesce((item ->> 'delta')::int, 0);
    v_msgs  := coalesce((item ->> 'messages')::int, 0);

    if v_uid is null then
      continue;
    end if;

    -- Create the member row if this is the first time we see them.
    -- ON CONSTRAINT (not ON CONFLICT (cols)): the RETURNS TABLE output
    -- columns share their names with these table columns, so an index
    -- inference list would be an ambiguous plpgsql reference (SQLSTATE 42702).
    insert into public.members (channel_id, kick_user_id, username)
    values (p_channel_id, v_uid, v_name)
    on conflict on constraint members_pkey do nothing;

    -- Serialize concurrent batches for the same member.
    select m.rank_idx into v_prev
    from public.members m
    where m.channel_id = p_channel_id and m.kick_user_id = v_uid
    for update;

    update public.members m
    set points        = greatest(m.points + v_delta, 0),
        message_count = m.message_count + v_msgs,
        username      = case when v_name <> '' then v_name else m.username end,
        rank_idx      = public.rank_for_points(greatest(m.points + v_delta, 0)),
        last_message_at = now(),
        updated_at    = now()
    where m.channel_id = p_channel_id and m.kick_user_id = v_uid
    returning m.rank_idx, m.points, m.message_count, m.username
    into v_rank, v_points, v_count, v_stored;

    if v_rank <> v_prev then
      insert into public.rank_events (channel_id, kick_user_id, from_rank, to_rank, points)
      values (p_channel_id, v_uid, v_prev, v_rank, v_points);

      kick_user_id := v_uid;
      username     := v_stored;
      points       := v_points;
      message_count := v_count;
      rank_idx     := v_rank;
      prev_rank    := v_prev;
      return next;
    end if;
  end loop;
end;
$$;

-- ============================================================
-- set_points / reset_user  (admin commands)
-- ============================================================
create or replace function public.set_points(
  p_channel_id bigint,
  p_user_id    bigint,
  p_username   text,
  p_points     int,
  p_reset_messages boolean default false
)
returns table (kick_user_id bigint, username text, points int, message_count int, rank_idx int, prev_rank int)
language plpgsql
as $$
declare
  v_prev int;
  v_rank int;
  v_msgs int;
begin
  insert into public.members (channel_id, kick_user_id, username)
  values (p_channel_id, p_user_id, coalesce(p_username, ''))
  on conflict on constraint members_pkey do nothing;

  select m.rank_idx into v_prev
  from public.members m
  where m.channel_id = p_channel_id and m.kick_user_id = p_user_id
  for update;

  update public.members m
  set points        = greatest(p_points, 0),
      username      = case when coalesce(p_username, '') <> '' then p_username else m.username end,
      message_count = case when p_reset_messages then 0 else m.message_count end,
      rank_idx      = public.rank_for_points(greatest(p_points, 0)),
      updated_at    = now()
  where m.channel_id = p_channel_id and m.kick_user_id = p_user_id
  returning m.rank_idx, m.message_count into v_rank, v_msgs;

  if v_rank <> v_prev then
    insert into public.rank_events (channel_id, kick_user_id, from_rank, to_rank, points)
    values (p_channel_id, p_user_id, v_prev, v_rank, greatest(p_points, 0));
  end if;

  kick_user_id := p_user_id;
  username     := coalesce(p_username, '');
  points       := greatest(p_points, 0);
  message_count := v_msgs;
  rank_idx     := v_rank;
  prev_rank    := v_prev;
  return next;
end;
$$;

-- ============================================================
-- leaderboard view  (read-only, safe for the future website)
-- ============================================================
drop view if exists public.leaderboard;
create view public.leaderboard as
select
  m.channel_id,
  m.kick_user_id,
  m.username,
  m.points,
  m.message_count,
  m.rank_idx,
  r.name_ar as rank_name_ar,
  r.name_en as rank_name_en,
  r.emoji   as rank_emoji,
  rank() over (partition by m.channel_id order by m.points desc) as position
from public.members m
left join public.ranks r on r.idx = m.rank_idx;

-- ============================================================
-- RLS
-- Public read: ranks + leaderboard only (anon & authenticated).
-- Everything else: service-role key only.
-- ============================================================
alter table public.ranks       enable row level security;
alter table public.channels    enable row level security;
alter table public.members     enable row level security;
alter table public.rank_events enable row level security;
alter table public.kick_tokens enable row level security;  -- no policies => fully private

drop policy if exists ranks_select_public on public.ranks;
create policy ranks_select_public on public.ranks
  for select to anon, authenticated
  using (true);

-- leaderboard is a VIEW: CREATE POLICY is not allowed on views
-- (SQLSTATE 42809 "leaderboard" is not a table). Views are secured
-- with privileges instead of row level security.
grant select on public.leaderboard to anon, authenticated;
grant select on public.ranks       to anon, authenticated;
revoke insert, update, delete on public.leaderboard from anon, authenticated;

-- Belt and braces: no public write grants anywhere.
revoke insert, update, delete on public.ranks       from anon, authenticated;
revoke insert, update, delete on public.channels    from anon, authenticated;
revoke insert, update, delete on public.members     from anon, authenticated;
revoke insert, update, delete on public.rank_events from anon, authenticated;
revoke all                       on public.kick_tokens from anon, authenticated;