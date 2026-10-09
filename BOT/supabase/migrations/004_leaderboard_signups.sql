-- Police Ranks Counter :: public signups
-- Target: the BOT Supabase project (xtemzq…)
-- Run from: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Idempotent: safe to run more than once.
--
-- This table backs the on-site "Police Ranks Counter" leaderboard, where any
-- visitor can put their name in and appear with a rank. Written through the
-- site's /api/leaderboard endpoint using the service key, so no anon write
-- grant is needed here.

create table if not exists public.leaderboard_signups (
  id          bigserial primary key,
  name        text        not null,
  display     text        not null,
  points      int         not null default 0,
  rank_idx    int         not null default 1,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per name (case-insensitive) so re-joining updates instead of duplicating.
create unique index if not exists leaderboard_signups_name_key
  on public.leaderboard_signups (lower(name));

create index if not exists leaderboard_signups_points_idx
  on public.leaderboard_signups (points desc, created_at asc);

create or replace function public.touch_leaderboard_signups()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leaderboard_signups_touch on public.leaderboard_signups;
create trigger leaderboard_signups_touch
  before update on public.leaderboard_signups
  for each row execute function public.touch_leaderboard_signups();

-- Public read so the site can render the board with the anon key too.
alter table public.leaderboard_signups enable row level security;

drop policy if exists leaderboard_signups_select_public on public.leaderboard_signups;
create policy leaderboard_signups_select_public on public.leaderboard_signups
  for select to anon, authenticated
  using (true);

-- Writes stay service-role only: never grant insert/update/delete to anon.
revoke insert, update, delete on public.leaderboard_signups from anon, authenticated;