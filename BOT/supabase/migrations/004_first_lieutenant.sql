-- RanksBot :: 004 - First Lieutenant + new thresholds
--
-- المطلوب:
--   * رتبة جديدة: First Lieutenant بعد Lieutenant على 14,000 — إيموجي ⚜️
--   * Lieutenant إيموجي ✨ (بدل 🥉)
--   * Captain  → 20,000 (🥈)
--   * Chief of Police (رئيس الشرطة) → 50,000 (🥇)
--   * Minister (الوزير) → 70,000 (🎖️ وسام الشرف — أجمل للرتبة العليا)
--
-- السلم النهائي (15 رتبة):
--   11 Lieutenant        ✨  10,000
--   12 First Lieutenant  ⚜️  14,000  ← جديدة
--   13 Captain           🥈  20,000
--   14 Chief of Police   🥇  50,000
--   15 Minister          🎖️  70,000
--
-- التشغيل: Supabase Dashboard -> SQL Editor -> New query -> الصق هذا الملف -> Run
-- آمن للتكرار: تقدر تشغّله أكثر من مرة بدون ضرر.
--
-- ملاحظة: rank_for_points و apply_points و set_points يقرأون جدول ranks
-- مباشرة، فما يحتاجون تعديل — يتحدثون تلقائياً بعد هذا الملف.

-- ── 1) إفساح مكان للرتبة الجديدة: نزيح 12/13/14 للأعلى (بالترتيب العكسي
-- عشان ما يتصادم الـ PRIMARY KEY) ─────────────────────────────
update public.ranks set idx = 15 where idx = 14; -- minister 14 -> 15
update public.ranks set idx = 14 where idx = 13; -- chief    13 -> 14
update public.ranks set idx = 13 where idx = 12; -- captain  12 -> 13

-- ── 2) الرتبة الجديدة في مكانها ───────────────────────────────
insert into public.ranks (idx, key, name_ar, name_en, emoji, min_points)
values (12, 'first_lieutenant', 'فيرست لوتينت', 'First Lieutenant', '⚜️', 14000)
on conflict (idx) do update
  set key        = excluded.key,
      name_ar    = excluded.name_ar,
      name_en    = excluded.name_en,
      emoji      = excluded.emoji,
      min_points = excluded.min_points;

-- ── 3) تحديث النقاط والإيموجيات والأسماء للرتب العليا ─────────
update public.ranks set
  name_ar = 'لوتينت', name_en = 'Lieutenant',
  emoji = '✨', min_points = 10000
where key = 'lieutenant';

update public.ranks set
  name_ar = 'فيرست لوتينت', name_en = 'First Lieutenant',
  emoji = '⚜️', min_points = 14000
where key = 'first_lieutenant';

update public.ranks set
  name_ar = 'كابتن', name_en = 'Captain',
  emoji = '🥈', min_points = 20000
where key = 'captain';

update public.ranks set
  name_ar = 'رئيس الشرطة', name_en = 'Chief of Police',
  emoji = '🥇', min_points = 50000
where key = 'chief_of_police';

update public.ranks set
  name_ar = 'الوزير', name_en = 'Minister',
  emoji = '🎖️', min_points = 70000
where key = 'minister';

-- ── 4) تثبيت السلم كامل (idempotent — يصلّح أي قاعدة قديمة) ──
insert into public.ranks (idx, key, name_ar, name_en, emoji, min_points) values
  (1,  'cadet',               'كاديت',              'Cadet',               '▪️',     0),
  (2,  'solo_cadet',          'سولو كاديت',         'Solo Cadet',          '▫️',     100),
  (3,  'officer_1',           'أوفيسر 1',           'Officer 1',           '🔹',     250),
  (4,  'officer_2',           'أوفيسر 2',           'Officer 2',           '🔹',     500),
  (5,  'officer_3',           'أوفيسر 3',           'Officer 3',           '🔹',     900),
  (6,  'senior_officer',      'سينيور أوفيسر',      'Senior Officer',      '🔸',  1500),
  (7,  'senior_lead_officer', 'سينيور ليد أوفيسر',  'Senior Lead Officer', '🔸',  2300),
  (8,  'sergeant',            'سارجنت',             'Sergeant',            '💠',   3400),
  (9,  'first_sergeant',      'فيرست سارجنت',       'First Sergeant',      '🔺',   5000),
  (10, 'staff_sergeant',      'ستاف سارجنت',        'Staff Sergeant',      '🔺',   7000),
  (11, 'lieutenant',          'لوتينت',             'Lieutenant',          '✨',  10000),
  (12, 'first_lieutenant',    'فيرست لوتينت',       'First Lieutenant',    '⚜️',  14000),
  (13, 'captain',             'كابتن',              'Captain',             '🥈',  20000),
  (14, 'chief_of_police',     'رئيس الشرطة',        'Chief of Police',     '🥇',  50000),
  (15, 'minister',            'الوزير',             'Minister',            '🎖️',  70000)
on conflict (idx) do update
  set key        = excluded.key,
      name_ar    = excluded.name_ar,
      name_en    = excluded.name_en,
      emoji      = excluded.emoji,
      min_points = excluded.min_points;

-- ── 5) إعادة حساب رتب الأعضاء الحاليين على السلم الجديد ──────
-- (اللي كان كابتن على 15 ألف يصير فيرست لوتينت، واللي على 25 ألف
-- يصير كابتن، وهكذا — بدون تصفير نقاط أحد)
update public.members m
set rank_idx = public.rank_for_points(m.points);

-- ── 6) تحقق سريع (كلها لازم تطابق التعليقات) ─────────────────
-- select idx, key, emoji, min_points from public.ranks order by idx;
--   11 lieutenant       ✨ 10000
--   12 first_lieutenant ⚜️ 14000
--   13 captain          🥈 20000
--   14 chief_of_police  🥇 50000
--   15 minister         🎖️ 70000
-- select public.rank_for_points(0);     -- 1
-- select public.rank_for_points(13999); -- 11
-- select public.rank_for_points(14000); -- 12
-- select public.rank_for_points(19999); -- 12
-- select public.rank_for_points(20000); -- 13
-- select public.rank_for_points(49999); -- 13
-- select public.rank_for_points(50000); -- 14
-- select public.rank_for_points(69999); -- 14
-- select public.rank_for_points(70000); -- 15
