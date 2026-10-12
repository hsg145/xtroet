-- RanksBot :: 009 — معركة الفرق (Team Battle)
--
-- الشات ينقسم لفرق تتنافس ضد بعض (مو ناصر ضد الشات مثل التحدي).
--
--   1. ناصر ينشئ المعركة من الموقع: الاسم + فريقان أو أكثر + جائزة الفائز
--      + عقاب الخاسر. كلها تتحدد قبل البدء.
--   2. مرحلة التصويت: البوت يعلن الفرق، والناس تكتب اسم فريقها في الشات.
--      كل واحد له صوت واحد فقط — يغيّر رأيه؟ لا. أول صوت يُحسب والباقي
--      يُتجاهل. (primary key يضمنها، مو كود البوت.)
--   3. ناصر يضغط "ابدأ الفعالية" → النقاط تعدّ وقت البث.
--   4. ناصر يختار الفريق الفائز → التوزيع فوري، والدبل/التربل على أعضاء
--      الفريق الفائز فقط، والتخريب على الخاسرين فقط.
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق -> Run
-- آمن للتكرار.

-- ============================================================
-- team_battles
--   status: voting | running | done | cancelled
-- ============================================================
create table if not exists public.team_battles (
  id               bigserial   primary key,
  channel_id       bigint      not null references public.channels (id) on delete cascade,
  title            text        not null default '',
  status           text        not null default 'voting',
  winning_option_id bigint     null,
  win_reward_kind  text        not null default 'none',
  win_reward_amount int        not null default 0,
  win_reward_minutes int       not null default 0,
  lose_penalty_kind text       not null default 'none',
  lose_penalty_minutes int     not null default 0,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz null,
  applied_at       timestamptz null
);

-- معركة نشطة واحدة فقط لكل قناة.
create unique index if not exists team_battles_one_active
  on public.team_battles (channel_id)
  where status in ('voting', 'running');

create index if not exists team_battles_recent
  on public.team_battles (channel_id, started_at desc);

-- ============================================================
-- team_options — الفرق (2 أو 4 أو أي عدد)
-- ============================================================
create table if not exists public.team_options (
  id         bigserial primary key,
  battle_id  bigint    not null references public.team_battles (id) on delete cascade,
  label      text      not null,
  position   int       not null default 0
);

create index if not exists team_options_battle
  on public.team_options (battle_id, position);

-- ============================================================
-- team_votes — من صوّت لمين
--  primary key (battle_id, kick_user_id) = صوت واحد فقط لكل شخص،
--  مهما كتب. أول صوت يُحسب (ON CONFLICT DO NOTHING).
-- ============================================================
create table if not exists public.team_votes (
  battle_id    bigint      not null references public.team_battles (id) on delete cascade,
  kick_user_id bigint      not null,
  option_id    bigint      not null references public.team_options (id) on delete cascade,
  username     text        not null,
  voted_at     timestamptz not null default now(),
  primary key (battle_id, kick_user_id)
);

create index if not exists team_votes_option
  on public.team_votes (battle_id, option_id);

-- ============================================================
-- RLS — service-role فقط
-- ============================================================
alter table public.team_battles enable row level security;
alter table public.team_options enable row level security;
alter table public.team_votes   enable row level security;

revoke insert, update, delete, select on public.team_battles from anon, authenticated;
revoke insert, update, delete, select on public.team_options  from anon, authenticated;
revoke insert, update, delete, select on public.team_votes   from anon, authenticated;

-- ============================================================
-- apply_team_reward(battle_id)
--
-- ينفّذ على أعضاء الفرق فقط — مو على الشات كله:
--   الفائزون → توزيع (فوري عبر apply_points) أو دبل (multiplier 2)
--   الخاسرون → تخريب (multiplier 0.5) أو لا شيء
--
-- مؤمن: قفل FOR UPDATE + خروج فوري لو applied_at مضبوط.
-- ============================================================
create or replace function public.apply_team_reward(p_battle_id bigint)
returns jsonb
language plpgsql
as $$
declare
  b          public.team_battles%rowtype;
  v_until_w  timestamptz;
  v_until_l  timestamptz;
  v_batch    jsonb;
  v_winners  int;
  v_losers   int;
begin
  select * into b from public.team_battles t where t.id = p_battle_id for update;
  if not found then
    raise exception 'team battle % not found', p_battle_id;
  end if;

  if b.applied_at is not null then
    return jsonb_build_object('ok', true, 'already_applied', true);
  end if;

  if b.winning_option_id is null then
    raise exception 'team battle % has no winner yet', p_battle_id;
  end if;

  select count(*) into v_winners
    from public.team_votes v where v.battle_id = p_battle_id and v.option_id = b.winning_option_id;
  select count(*) into v_losers
    from public.team_votes v where v.battle_id = p_battle_id and v.option_id <> b.winning_option_id;

  if v_winners = 0 and v_losers = 0 then
    update public.team_battles set applied_at = now(), status = 'done' where id = p_battle_id;
    return jsonb_build_object('ok', true, 'already_applied', false, 'winners', 0, 'losers', 0);
  end if;

  v_until_w := case
    when b.win_reward_minutes > 0 then now() + make_interval(mins => b.win_reward_minutes)
    else null
  end;
  v_until_l := case
    when b.lose_penalty_minutes > 0 then now() + make_interval(mins => b.lose_penalty_minutes)
    else null
  end;

  -- ── الفائزون: توزيع فوري ──
  if b.win_reward_kind = 'distribute' and b.win_reward_amount > 0 and v_winners > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', v.kick_user_id,
             'username', v.username,
             'delta', b.win_reward_amount,
             'messages', 0
           )), '[]'::jsonb)
      into v_batch
      from public.team_votes v
     where v.battle_id = p_battle_id and v.option_id = b.winning_option_id;

    perform * from public.apply_points(b.channel_id, v_batch);
  end if;

  -- ── الفائزون: دبل (على أعضائهم فقط) ──
  if b.win_reward_kind = 'double' and v_winners > 0 then
    insert into public.member_modifiers
      (channel_id, kick_user_id, multiplier, multiplier_until, mute_until, updated_at)
    select b.channel_id, v.kick_user_id, 2, v_until_w, null, now()
      from public.team_votes v
     where v.battle_id = p_battle_id and v.option_id = b.winning_option_id
    on conflict on constraint member_modifiers_pkey do update
      set multiplier       = excluded.multiplier,
          multiplier_until = excluded.multiplier_until,
          updated_at       = now()
      where public.member_modifiers.mute_until is null
         or public.member_modifiers.mute_until <= now();
  end if;

  -- ── الخاسرون: تخريب (على أعضائهم فقط) ──
  if b.lose_penalty_kind = 'sabotage' and v_losers > 0 then
    insert into public.member_modifiers
      (channel_id, kick_user_id, multiplier, multiplier_until, mute_until, updated_at)
    select b.channel_id, v.kick_user_id, 0.5, v_until_l, null, now()
      from public.team_votes v
     where v.battle_id = p_battle_id and v.option_id <> b.winning_option_id
    on conflict on constraint member_modifiers_pkey do update
      set multiplier       = excluded.multiplier,
          multiplier_until = excluded.multiplier_until,
          updated_at       = now()
      where public.member_modifiers.mute_until is null
         or public.member_modifiers.mute_until <= now();
  end if;

  update public.team_battles
     set applied_at = now(),
         status     = 'done'
   where id = p_battle_id;

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'winners', v_winners,
    'losers', v_losers,
    'win_reward_kind', b.win_reward_kind,
    'lose_penalty_kind', b.lose_penalty_kind,
    'win_until', v_until_w,
    'lose_until', v_until_l
  );
end;
$$;

-- ============================================================
-- verify
-- ============================================================
-- select count(*) from public.team_battles;
-- select count(*) from public.team_options;
-- select count(*) from public.team_votes;