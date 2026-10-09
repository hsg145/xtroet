-- RanksBot :: 003 - rank markers
--
-- Markers are grouped by SHAPE FAMILY, so the glyph alone shows the block:
--   cadets (1-2)        light squares
--   officers (3-5)      🔹 blue
--   seniors (6-7)       🔸 blue, one shade lighter
--   sergeant (8)        💠 one diamond shape
--   first + staff (9-10) 🔺 red triangles
--   the top four        medals
--
-- Idempotent: safe to run more than once.

update public.ranks set emoji = '▪️' where key = 'cadet';
update public.ranks set emoji = '▫️' where key = 'solo_cadet';
update public.ranks set emoji = '🔹' where key = 'officer_1';
update public.ranks set emoji = '🔹' where key = 'officer_2';
update public.ranks set emoji = '🔹' where key = 'officer_3';
update public.ranks set emoji = '🔸' where key = 'senior_officer';
update public.ranks set emoji = '🔸' where key = 'senior_lead_officer';
update public.ranks set emoji = '💠' where key = 'sergeant';
update public.ranks set emoji = '🔺' where key = 'first_sergeant';
update public.ranks set emoji = '🔺' where key = 'staff_sergeant';
update public.ranks set emoji = '🥉' where key = 'lieutenant';
update public.ranks set emoji = '🥈' where key = 'captain';
update public.ranks set emoji = '🥇' where key = 'chief_of_police';
update public.ranks set emoji = '🎖️' where key = 'minister';
