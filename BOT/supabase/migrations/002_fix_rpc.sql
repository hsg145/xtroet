-- RanksBot :: 002 — fix apply_points / set_points
-- Run in the Supabase SQL Editor after 001_init.sql.
-- Idempotent: safe to run more than once.
--
-- Bug 1 (blocking): both functions declare RETURNS TABLE (kick_user_id ...),
-- which makes those names plpgsql variables. The upsert's
-- `on conflict (channel_id, kick_user_id)` index-inference list then resolved
-- the name to BOTH a variable and a column, so every call failed with:
--   ERROR: 42702 column reference "kick_user_id" is ambiguous
-- The bot could not store a single point. Fixed by naming the constraint
-- instead of inferring an index: ON CONFLICT ON CONSTRAINT members_pkey.
--
-- Bug 2: apply_points returned an empty username, because the fallback branch
-- was identical to the taken branch:
--   username := case when v_name <> '' then v_name else v_name end
-- The rank-up announcement then printed the raw user id instead of the handle.

-- ============================================================
-- apply_points(channel, batch) -> rank-up rows
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

    insert into public.members (channel_id, kick_user_id, username)
    values (p_channel_id, v_uid, v_name)
    on conflict on constraint members_pkey do nothing;

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
-- set_points (admin commands)
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
-- verify (all three must return the values in the comments)
-- ============================================================
-- select public.rank_for_points(1500);                    -- 6
-- select * from public.apply_points(1, '[]'::jsonb);      -- no rows
-- select * from public.set_points(1, 1, 'a', 900, false); -- rank_idx 5, prev_rank 1