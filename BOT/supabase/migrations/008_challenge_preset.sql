-- RanksBot :: 008 — اسم الفعالية + اختيار الجائزة والعقاب قبل البدء
--
-- المطلوب الجديد: الأدمن يكتب اسم الفعالية ويختار الجائزة والعقاب لحظة
-- الإنشاء، مو وقت النهاية. فالتحدي صار يحمل خطتين:
--
--   إذا الشات كسب  →  الجائزة (chat_reward_*)
--   إذا ناصر كسب    →  العقاب  (penalty_*)
--
-- والبوت ما يختار: لما الأدمن يضغط "إيقاف وتطبيق"، الدالة تشوف winner
-- المتخزّن في الصف وتنفّذ الخط المناسب تلقائياً.
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق -> Run
-- آمن للتكرار.
--
-- ملاحظة: الأعمدة القديمة (reward_kind / reward_amount / reward_minutes) من
-- 007 ما ننحذفها — الدالة الجديدة تتجاهلها، و007_ فقط ينشئها.

-- ============================================================
-- 1. الأعمدة الجديدة
-- ============================================================
alter table public.challenges
  add column if not exists title              text not null default '',
  add column if not exists chat_reward_kind   text not null default 'none',
  add column if not exists chat_reward_amount int    not null default 0,
  add column if not exists chat_reward_minutes int   not null default 0,
  add column if not exists penalty_kind       text not null default 'none',
  add column if not exists penalty_minutes    int    not null default 0;

comment on column public.challenges.title is 'اسم الفعالية — يكتبه الأدمن ويطلع في إعلان الشات';
comment on column public.challenges.chat_reward_kind is 'لو الشات كسب: none | distribute | double';
comment on column public.challenges.penalty_kind is 'لو ناصر كسب: none | sabotage (x0.5)';

-- ============================================================
-- 2. الدالة الجديدة: تختار الفرع من winner بدل ما يمرّرها الأدمن
--
--    الأمان كما هو:
--      - قفل FOR UPDATE يمنع التنفيذ مرتين
--      - applied_at ليس null ⇒ نطلع فوراً
--      - challenge_entries بـ primary key ⇒ شخص واحد = صف واحد
--
--    عند distribute نكتب reward_kind/amount من جديد (الخطوط القديمة) عشان
--    السجل يبان صحيح في لوق التشغيل ولوحة الإدارة.
-- ============================================================
create or replace function public.apply_challenge_reward(p_challenge_id bigint)
returns jsonb
language plpgsql
as $$
declare
  ch        public.challenges%rowtype;
  v_kind    text;
  v_amount  int;
  v_minutes int;
  v_until   timestamptz;
  v_batch   jsonb;
  v_count   int;
  v_mult    numeric;
begin
  select * into ch from public.challenges c where c.id = p_challenge_id for update;
  if not found then
    raise exception 'challenge % not found', p_challenge_id;
  end if;

  if ch.applied_at is not null then
    return jsonb_build_object('ok', true, 'already_applied', true, 'recipients', 0);
  end if;

  select count(*) into v_count from public.challenge_entries e where e.challenge_id = p_challenge_id;
  if v_count = 0 then
    update public.challenges set applied_at = now(), status = 'done' where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'already_applied', false, 'recipients', 0);
  end if;

  -- ── أي خط ينفّذ؟ الفائز المخزّن يقرر.
  if ch.winner = 'chat' then
    v_kind    := ch.chat_reward_kind;
    v_amount  := ch.chat_reward_amount;
    v_minutes := ch.chat_reward_minutes;
  else
    v_kind    := ch.penalty_kind;
    v_amount  := 0;
    v_minutes := ch.penalty_minutes;
  end if;

  if v_kind = 'none' then
    update public.challenges set applied_at = now(), status = 'done' where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'already_applied', false, 'recipients', 0,
                              'reward_kind', 'none', 'recipients_count', v_count);
  end if;

  v_until := case
    when v_minutes > 0 then now() + make_interval(mins => v_minutes)
    else null
  end;

  if v_kind = 'distribute' and v_amount > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', e.kick_user_id,
             'username', e.username,
             'delta', v_amount,
             'messages', 0
           )), '[]'::jsonb)
      into v_batch
      from public.challenge_entries e
     where e.challenge_id = p_challenge_id;

    perform * from public.apply_points(ch.channel_id, v_batch);
  end if;

  if v_kind in ('double', 'sabotage') then
    v_mult := case v_kind when 'double' then 2 else 0.5 end;

    insert into public.member_modifiers
      (channel_id, kick_user_id, multiplier, multiplier_until, mute_until, updated_at)
    select ch.channel_id, e.kick_user_id, v_mult, v_until, null, now()
      from public.challenge_entries e
     where e.challenge_id = p_challenge_id
    on conflict on constraint member_modifiers_pkey do update
      set multiplier       = excluded.multiplier,
          multiplier_until = excluded.multiplier_until,
          updated_at       = now()
      -- العقاب الجديد ما يلغي تايم آوت لسّا ساري
      where public.member_modifiers.mute_until is null
         or public.member_modifiers.mute_until <= now();
  end if;

  -- نحدّث الخطوط القديمة بس حتى يبقى السجل مفهوماً.
  update public.challenges
     set applied_at      = now(),
         status          = 'done',
         reward_kind     = v_kind,
         reward_amount   = case when v_kind = 'distribute' then v_amount else 0 end,
         reward_minutes  = v_minutes
   where id = p_challenge_id;

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'recipients', v_count,
    'winner', ch.winner,
    'reward_kind', v_kind,
    'reward_amount', v_amount,
    'reward_until', v_until
  );
end;
$$;

-- ============================================================
-- verify
-- ============================================================
-- select column_name from information_schema.columns
--  where table_name = 'challenges' order by ordinal_position;