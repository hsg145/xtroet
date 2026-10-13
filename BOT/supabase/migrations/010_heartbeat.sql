-- RanksBot :: 010 — نبض البوت (heartbeat)
--
-- البوت يكتب نبضة كل 30 ثانية. اللوحة تقرأها وتعرض "حي / ميت + آخر ظهور".
-- بدونها، موت البوت صامت تماماً — الشات يتحرك والقاعدة ساكتة ولا أحد يدري.
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق -> Run
-- آمن للتكرار.

create table if not exists public.bot_heartbeat (
  id         int         primary key default 1,
  updated_at timestamptz not null default now(),
  version    text        not null default '',
  stats      jsonb       not null default '{}'::jsonb,
  constraint bot_heartbeat_singleton check (id = 1)
);

alter table public.bot_heartbeat enable row level security;

revoke insert, update, delete, select on public.bot_heartbeat from anon, authenticated;