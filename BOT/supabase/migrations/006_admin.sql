-- RanksBot :: 006 - admin dashboard backend
--
-- لوحة إدارة البوت: كل ما تحتاجه من جداول.
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق هذا الملف -> Run
-- آمن للتكرار: تقدر تشغّله أكثر من مرة بدون ضرر.
--
-- الجداول:
--   bot_settings      مفاتيح عامة (الفعالية الجارية، كود النقاط المخفي)
--   member_modifiers  عقوبات/تعزيزات لكل شخص (كتم، تجميد، دبل، نصف نقطة) مع مدة
--   drop_claims       من استلم كود النقاط وكم مرة (لحد الاستلام لكل شخص)
--   bot_outbox        رسائل معلقة يرسلها البوت في الشات (إعلانات الفعاليات...)
--   admin_attempts    عدّاد محاولات كلمة السر + القفل (10 محاولات لكل جهاز)
--   admin_audit       سجل كل عمليات الإدارة (شفافية ومحاسبة)
--
-- الأمان: كل هذه الجداول للسيرفر فقط (service-role key).
-- لا يوجد أي وصول عام — anon/authenticated ممنوعون تماماً.

-- ============================================================
-- bot_settings  (key -> value)
--   'event' : {"kind":"double"|"triple"|"sabotage"|"custom",
--              "mult": 2, "label": "🔥 دبل النقاط", "ends_at": "2030-01-01T00:00:00Z"}
--   'drop'  : {"word": "دبل", "amount": 10, "per_max": 1,
--              "ends_at": "2030-01-01T00:00:00Z"}
-- ============================================================
create table if not exists public.bot_settings (
  key        text  primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- member_modifiers  (one row per member, only when punished/boosted)
--   multiplier: NULL = طبيعي | 0 = تجميد النقاط | 0.5 = نصف نقطة
--               | 2 = دبل | 3 = تربل (أو أي رقم مخصص)
--   multiplier_until: متى ينتهي التعزيز/العقوبة (NULL = لا يوجد)
--   mute_until: تايم آوت — صفر نقاط تماماً حتى هذا الوقت (NULL = لا يوجد)
--   يعمل حتى على المشرفين: البوت يطبقه قبل أي صلاحية Kick.
-- ============================================================
create table if not exists public.member_modifiers (
  channel_id       bigint        not null references public.channels (id) on delete cascade,
  kick_user_id     bigint        not null,
  multiplier       numeric       null,
  multiplier_until timestamptz  null,
  mute_until       timestamptz  null,
  updated_at       timestamptz  not null default now(),
  primary key (channel_id, kick_user_id)
);

create index if not exists member_modifiers_mute_idx
  on public.member_modifiers (channel_id, mute_until)
  where mute_until is not null;

-- ============================================================
-- drop_claims  (who claimed a drop code, how many times)
-- ============================================================
create table if not exists public.drop_claims (
  channel_id   bigint not null references public.channels (id) on delete cascade,
  word         text   not null,
  kick_user_id bigint not null,
  count        int    not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (channel_id, word, kick_user_id)
);

-- ============================================================
-- bot_outbox  (chat announcements queued by the dashboard,
--              drained and sent by the bot every few seconds)
-- ============================================================
create table if not exists public.bot_outbox (
  id         bigserial primary key,
  channel_id bigint not null references public.channels (id) on delete cascade,
  text       text   not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz null
);

create index if not exists bot_outbox_pending_idx
  on public.bot_outbox (channel_id, sent_at)
  where sent_at is null;

-- ============================================================
-- admin_attempts  (password brute-force shield)
--   key: 'd:<device-id>' أو 'ip:<address>'
--   10 محاولات فاشلة = قفل 24 ساعة. يُصفَّر عند الدخول الصحيح.
-- ============================================================
create table if not exists public.admin_attempts (
  key          text        primary key,
  fails        int         not null default 0,
  locked_until timestamptz null,
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- admin_audit  (every dashboard action, who/when/what)
-- ============================================================
create table if not exists public.admin_audit (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  device_id  text,
  ip         text
);

create index if not exists admin_audit_time_idx
  on public.admin_audit (created_at desc);

-- ============================================================
-- RLS — service-role only. No public policies = fully private.
-- (PostgREST refuses everything for anon/authenticated when RLS is
-- enabled with zero policies on the table.)
-- ============================================================
alter table public.bot_settings     enable row level security;
alter table public.member_modifiers enable row level security;
alter table public.drop_claims      enable row level security;
alter table public.bot_outbox       enable row level security;
alter table public.admin_attempts   enable row level security;
alter table public.admin_audit      enable row level security;

revoke insert, update, delete, select on public.bot_settings     from anon, authenticated;
revoke insert, update, delete, select on public.member_modifiers from anon, authenticated;
revoke insert, update, delete, select on public.drop_claims      from anon, authenticated;
revoke insert, update, delete, select on public.bot_outbox       from anon, authenticated;
revoke insert, update, delete, select on public.admin_attempts   from anon, authenticated;
revoke insert, update, delete, select on public.admin_audit      from anon, authenticated;

-- ============================================================
-- recompute_all_ranks() — after rank prices change, every member's
-- rank_idx is recomputed from their points (dashboard calls this).
-- ============================================================
create or replace function public.recompute_all_ranks()
returns void
language sql
as $$
  update public.members m
  set rank_idx = public.rank_for_points(m.points);
$$;

-- ============================================================
-- verify (after running, all counts must be 0 except settings>=0)
-- ============================================================
-- select count(*) from public.bot_settings;
-- select count(*) from public.member_modifiers;
-- select count(*) from public.bot_outbox where sent_at is null;
