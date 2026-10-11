-- RanksBot :: 007 — تحدي رايس (Raees Challenge)
--
-- تحدي: شخص واحد (ناصر / رايس / الأدمن) ضد الشات كله.
--   1. الأدمن ينشئ التحدي من الموقع → البوت يعلنه أول ما ينشأ.
--   2. النقود تعدّ وقت البث المجرّ�� (شوف بوابة البث في src/core/livestate.ts).
--   3. الأدمن يوقفه يدوي ويقرر الفائز من الموقع.
--   4. البوت يختار كلمة عشوائية من (!MT / !ناصر / !PM / !دخول) ويعلنها.
--   5. الناس تكتب الكلمة في الشات → البوت يجمع كل من كتبها.
--   6. الأدمن يضغط "إيقاف" من الموقع → تُوزّع النقاط وتُطبّق المكافأة/العقاب.
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق -> Run
-- آمن للتكرار: تقدر تشغّله أكثر من مرة بدون ضرر.
--
-- الجداول:
--   challenges        حالة التحدي (متحدي، حالة، فائز، كلمة، نوع المكافأة)
--   challenge_entries من كتب الكلمة — والمفتاح الأساسي يمنع التكرار نهائياً
--
-- الأمان: جداول للسيرفر فقط (service-role key). RLS مفعّل بدون أي policy
-- فيرفض PostgREST كل شي من anon/authenticated.

-- ============================================================
-- challenges
--   status:
--     'running'    — التحدي شغّال، البوت يعلنه
--     'collecting' — انتهى، البوت يعلن كلمة عشوائية والناس تكتبها
--     'done'       — انتهى كل شي والمكافأة اتطبقت
--     'cancelled'  — ألغاه الأدمن
--   winner: 'challenger' أو 'chat' أو null
--   reward_kind:
--     'none'       — ما في شيء
--     'distribute' — توزيع N نقطة لكل واحد كتب الكلمة
--     'double'     — تربل: مضاعفة النقاط (multiplier 2)
--     'sabotage'   — تخريب: نص نقطة على الرسالة (multiplier 0.5)
-- ============================================================
create table if not exists public.challenges (
  id             bigserial    primary key,
  channel_id     bigint       not null references public.channels (id) on delete cascade,
  challenger     text         not null,
  status         text         not null default 'running',
  winner         text         null,
  keyword        text         null,
  reward_kind    text         not null default 'none',
  reward_amount  int          not null default 0,
  reward_minutes int          not null default 0,
  note           text         not null default '',
  started_at     timestamptz  not null default now(),
  ended_at       timestamptz  null,
  collected_at   timestamptz  null,
  applied_at     timestamptz  null
);

-- نشط واحد فقط لكل قناة: تحدي جارٍ (running أو collecting).
-- الفهرس الجزئي يضمن هذا على مستوى قاعدة البيانات، مو بس من الواجهة.
create unique index if not exists challenges_one_active
  on public.challenges (channel_id)
  where status in ('running', 'collecting');

create index if not exists challenges_recent
  on public.challenges (channel_id, started_at desc);

-- ============================================================
-- challenge_entries — من كتب الكلمة
--
--  primary key (challenge_id, kick_user_id) هو الضمانة الحقيقية لمنع
--  التكرار: لو كتب واحد الكلمة عشر مرات، INSERT يتجاهل التكرار محلياً
--  في القاعدة. ما نعتمد على كود البوت لوحده أبداً.
-- ============================================================
create table if not exists public.challenge_entries (
  challenge_id bigint      not null references public.challenges (id) on delete cascade,
  kick_user_id bigint      not null,
  username     text        not null,
  collected_at timestamptz not null default now(),
  primary key (challenge_id, kick_user_id)
);

create index if not exists challenge_entries_time
  on public.challenge_entries (challenge_id, collected_at);

-- ============================================================
-- RLS — service-role فقط
-- ============================================================
alter table public.challenges        enable row level security;
alter table public.challenge_entries enable row level security;

revoke insert, update, delete, select on public.challenges        from anon, authenticated;
revoke insert, update, delete, select on public.challenge_entries from anon, authenticated;

-- ============================================================
-- apply_challenge_reward(challenge_id)
--
-- ينفّذ المكافأة/العقاب على كل من كتب الكلمة، مرة واحدة فقط:
--   distribute → +N نقطة لكل واحد (نستعمل apply_points نفسها، فترتقي الرتب
--                وترسل إعلاناتها عادي بدون ما نكتب SQL ثاني)
--   double     → multiplier 2  لحد انتهاء المدة
--   sabotage   → multiplier 0.5 لحد انتهاء المدة
--
-- مؤمن بعدة طرق:
--   - القفل على الصف بـ FOR UPDATE يمنع التنفيذ مرتين لو ضغط الأدمن مرتين
--   - لو applied_at ليس null نخرج فوراً
--   - entrées بـ ON CONFLICT DO NOTHING ⇒ شخص واحد = صف واحد دائماً
--
-- يرجع ملخصاً للتسجيل في الداشبورد.
-- ============================================================
create or replace function public.apply_challenge_reward(p_challenge_id bigint)
returns jsonb
language plpgsql
as $$
declare
  ch        public.challenges%rowtype;
  v_until   timestamptz;
  v_batch   jsonb;
  v_count   int;
  v_mult    numeric;
begin
  -- قفل الصف: الضغط المتكرر ما يكرر التوزيع.
  select * into ch from public.challenges c where c.id = p_challenge_id for update;
  if not found then
    raise exception 'challenge % not found', p_challenge_id;
  end if;

  -- اتطبّق قبل؟ طلع فوراً.
  if ch.applied_at is not null then
    return jsonb_build_object('ok', true, 'already_applied', true, 'recipients', 0);
  end if;

  select count(*) into v_count from public.challenge_entries e where e.challenge_id = p_challenge_id;
  if v_count = 0 then
    update public.challenges set applied_at = now(), status = 'done' where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'already_applied', false, 'recipients', 0);
  end if;

  v_until := case
    when ch.reward_minutes > 0 then now() + make_interval(mins => ch.reward_minutes)
    else null
  end;

  -- ── توزيع نقاط: نستعمل apply_points نفسها، فترتقي الرتبة صح.
--    ملاحظة: إعلان ترقية الرتبة يجي من البوت أثناء الكتابة العادية، وما
--    ينرسل هنا — التوزيع ما يبي 100 إعلان بالشات.
  if ch.reward_kind = 'distribute' and ch.reward_amount > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', e.kick_user_id,
             'username', e.username,
             'delta', ch.reward_amount,
             'messages', 0
           )), '[]'::jsonb)
      into v_batch
      from public.challenge_entries e
     where e.challenge_id = p_challenge_id;

    perform * from public.apply_points(ch.channel_id, v_batch);
  end if;

  -- ── تربل / تخريب: نكتب في member_modifiers، والبوت يقراها بعد ثواني
  --    (admin-state يحدّث كل 15 ثانية) فيبدأ التأثير لحاله.
  if ch.reward_kind in ('double', 'sabotage') then
    v_mult := case ch.reward_kind when 'double' then 2 else 0.5 end;

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

  update public.challenges
     set applied_at = now(),
         status     = 'done'
   where id = p_challenge_id;

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'recipients', v_count,
    'reward_kind', ch.reward_kind,
    'reward_amount', ch.reward_amount,
    'reward_until', v_until
  );
end;
$$;

-- ============================================================
-- verify (بعد التشغيل كل الأرقام لازم تكون 0)
-- ============================================================
-- select count(*) from public.challenges;
-- select count(*) from public.challenge_entries;