-- RanksBot :: 005 - double all thresholds (+ fixed top ranks)
--
-- المطلوب:
--   * تدبيل كل النقاط (100→200، 250→500، وهكذا)
--   * Minister (الوزير) → 100,000 (مثبتة)
--   * Chief of Police (رئيس الشرطة) → 70,000 (مثبتة)
--   * Captain (كابتن) → 30,000 (مثبتة)
--   * First Lieutenant → 20,000 (مثبتة)
--   * Lieutenant → 15,000 (تدبيلها 20,000 يطابق الفيرست لوتينت تماماً،
--     فرتبتين بنفس العتبة مستحيل — وُضعت 15,000 ليبقى السلم مرتباً)
--
-- السلم النهائي (15 رتبة):
--   1  Cadet               ▪️  0
--   2  Solo Cadet          ▫️  200
--   3  Officer 1           🔹  500
--   4  Officer 2           🔹  1,000
--   5  Officer 3           🔹  1,800
--   6  Senior Officer      🔸  3,000
--   7  Senior Lead Officer 🔸  4,600
--   8  Sergeant            💠  6,800
--   9  First Sergeant      🔺  10,000
--   10 Staff Sergeant      🔺  14,000
--   11 Lieutenant          ✨  15,000
--   12 First Lieutenant    ⚜️  20,000
--   13 Captain             🥈  30,000
--   14 Chief of Police     🥇  70,000
--   15 Minister            🎖️  100,000
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق هذا الملف -> Run
-- آمن للتكرار: تقدر تشغّله أكثر من مرة بدون ضرر.
-- ملاحظة: نقاط الأعضاء لا تتغير — فقط العتبات، فينزل بعضهم رتباً للخلف.

-- ── 1) التدبيل + المثبتات ─────────────────────────────────────
update public.ranks set min_points = 200    where key = 'solo_cadet';
update public.ranks set min_points = 500    where key = 'officer_1';
update public.ranks set min_points = 1000   where key = 'officer_2';
update public.ranks set min_points = 1800   where key = 'officer_3';
update public.ranks set min_points = 3000   where key = 'senior_officer';
update public.ranks set min_points = 4600   where key = 'senior_lead_officer';
update public.ranks set min_points = 6800   where key = 'sergeant';
update public.ranks set min_points = 10000  where key = 'first_sergeant';
update public.ranks set min_points = 14000  where key = 'staff_sergeant';
update public.ranks set min_points = 15000  where key = 'lieutenant';
update public.ranks set min_points = 20000  where key = 'first_lieutenant';
update public.ranks set min_points = 30000  where key = 'captain';
update public.ranks set min_points = 70000  where key = 'chief_of_police';
update public.ranks set min_points = 100000 where key = 'minister';

-- ── 2) تثبيت السلم كامل (idempotent — يصلّح أي قاعدة قديمة) ──
insert into public.ranks (idx, key, name_ar, name_en, emoji, min_points) values
  (1,  'cadet',               'كاديت',              'Cadet',               '▪️',     0),
  (2,  'solo_cadet',          'سولو كاديت',         'Solo Cadet',          '▫️',     200),
  (3,  'officer_1',           'أوفيسر 1',           'Officer 1',           '🔹',     500),
  (4,  'officer_2',           'أوفيسر 2',           'Officer 2',           '🔹',     1000),
  (5,  'officer_3',           'أوفيسر 3',           'Officer 3',           '🔹',     1800),
  (6,  'senior_officer',      'سينيور أوفيسر',      'Senior Officer',      '🔸',  3000),
  (7,  'senior_lead_officer', 'سينيور ليد أوفيسر',  'Senior Lead Officer', '🔸',  4600),
  (8,  'sergeant',            'سارجنت',             'Sergeant',            '💠',   6800),
  (9,  'first_sergeant',      'فيرست سارجنت',       'First Sergeant',      '🔺',   10000),
  (10, 'staff_sergeant',      'ستاف سارجنت',        'Staff Sergeant',      '🔺',   14000),
  (11, 'lieutenant',          'لوتينت',             'Lieutenant',          '✨',  15000),
  (12, 'first_lieutenant',    'فيرست لوتينت',       'First Lieutenant',    '⚜️',  20000),
  (13, 'captain',             'كابتن',              'Captain',             '🥈',  30000),
  (14, 'chief_of_police',     'رئيس الشرطة',        'Chief of Police',     '🥇',  70000),
  (15, 'minister',            'الوزير',             'Minister',            '🎖️',  100000)
on conflict (idx) do update
  set key        = excluded.key,
      name_ar    = excluded.name_ar,
      name_en    = excluded.name_en,
      emoji      = excluded.emoji,
      min_points = excluded.min_points;

-- ── 3) إعادة حساب رتب الأعضاء على السلم الجديد ───────────────
-- (النقاط محفوظة — بس العتبات ارتفعت، فالبعض ينزل رتباً)
update public.members m
set rank_idx = public.rank_for_points(m.points);

-- ── 4) تحقق سريع (كلها لازم تطابق التعليقات) ─────────────────
-- select idx, key, min_points from public.ranks order by idx;
-- select public.rank_for_points(199);    -- 1
-- select public.rank_for_points(200);    -- 2
-- select public.rank_for_points(14999);  -- 10
-- select public.rank_for_points(15000);  -- 11
-- select public.rank_for_points(19999);  -- 11
-- select public.rank_for_points(20000);  -- 12
-- select public.rank_for_points(29999);  -- 12
-- select public.rank_for_points(30000);  -- 13
-- select public.rank_for_points(69999);  -- 13
-- select public.rank_for_points(70000);  -- 14
-- select public.rank_for_points(99999);  -- 14
-- select public.rank_for_points(100000); -- 15
