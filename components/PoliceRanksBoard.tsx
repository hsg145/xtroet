import React, { useEffect, useState, useCallback } from 'react';

/**
 * Police Ranks Counter — لوحة الرتب على الموقع.
 * أي زائر يكتب اسمه فينزل على اللوحة مباشرة (يتسجل بـ /api/leaderboard).
 * الهوية البصرية: أزرق Tavern/الشرطة — بانر + لوقو + تدرّجات سماوية.
 *
 * الأقسام: البحث ← سلم الرتب (بادج + اسم + نقاط لكل رتبة) ← منصة التوب 3 ← باقي اللوحة.
 */

type RankDef = {
    idx: number;
    name_ar: string;
    name_en: string;
    emoji: string;
    min_points: number;
};

type Entry = {
    rank: number;
    name: string;
    points: number;
    messages?: number;
    rank_idx: number;
    rank_ar?: string;
    rank_en?: string;
    emoji?: string;
    next_at?: { points: number } | null;
    avatar?: string;
    verified?: boolean;
};

/** نتيجة البحث عن شخص واحد */
type Profile = {
    found: boolean;
    display: string;
    avatar: string;
    verified: boolean;
    followers: number | null;
    messages: number;
    points: number;
    position: number | null;
    totalMembers: number;
    rank_idx: number;
    rank_ar: string;
    rank_en: string;
    emoji: string;
    next_at: { points: number } | null;
    error?: string;
};

const BLUE = '#1E6FFF';
const BLUE_HI = '#5AA9FF';
const NAVY = '#040C1C';

const nf = (n: number) => n.toLocaleString('en-US');

/* ── صور البادجات الحقيقية (من فولدر BADG، محسّنة WebP) ─────────
 * الوزير (15) ما له صورة بعد — يظهر بالإيموجي كبديل. إذا أضفت
 * صورته بنفس التسمية اشتغلت تلقائياً. */
const RANK_BADGE_IMG: Record<number, string> = {
    1: '/badges/cadet.webp',
    2: '/badges/solo_cadet.webp',
    3: '/badges/officer_1.webp',
    4: '/badges/officer_2.webp',
    5: '/badges/officer_3.webp',
    6: '/badges/senior_officer.webp',
    7: '/badges/senior_lead_officer.webp',
    8: '/badges/sergeant.webp',
    9: '/badges/first_sergeant.webp',
    10: '/badges/staff_sergeant.webp',
    11: '/badges/lieutenant.webp',
    12: '/badges/first_lieutenant.webp',
    13: '/badges/captain.webp',
    14: '/badges/chief_of_police.webp',
};

const badgeImg = (idx: number): string | null => RANK_BADGE_IMG[idx] ?? null;

/* ── هوية كل طبقة: لون + حلقة + توهج ─────────────────────────── */
type Tier = { color: string; ring: string; glow: string; bar: string };

function tier(idx: number): Tier {
    if (idx >= 14)
        return {
            color: '#FFD166',
            ring: 'conic-gradient(from 200deg,#FFE9A8,#FFD166,#B97A0B,#FFE9A8,#FFD166)',
            glow: 'rgba(255,209,102,0.55)',
            bar: 'linear-gradient(to right,#FFE9A8,#FFD166,#B97A0B)',
        };
    if (idx === 13)
        return {
            color: '#E8EEF7',
            ring: 'conic-gradient(from 200deg,#FFFFFF,#C9D4E8,#7E8CA3,#FFFFFF,#C9D4E8)',
            glow: 'rgba(232,238,247,0.45)',
            bar: 'linear-gradient(to right,#FFFFFF,#C9D4E8,#7E8CA3)',
        };
    if (idx >= 11)
        return {
            color: '#9BE7FF',
            ring: 'conic-gradient(from 200deg,#D9F6FF,#9BE7FF,#1E6FFF,#D9F6FF,#9BE7FF)',
            glow: 'rgba(155,231,255,0.5)',
            bar: 'linear-gradient(to right,#9BE7FF,#1E6FFF,#0B4FBF)',
        };
    if (idx >= 9)
        return {
            color: '#FF9AA0',
            ring: 'conic-gradient(from 200deg,#FFC9CD,#FF8A8A,#B33A3A,#FFC9CD,#FF8A8A)',
            glow: 'rgba(255,138,138,0.45)',
            bar: 'linear-gradient(to right,#FF8A8A,#B33A3A)',
        };
    if (idx === 8)
        return {
            color: '#7AD9FF',
            ring: 'conic-gradient(from 200deg,#D9F6FF,#7AD9FF,#0B7FBF,#D9F6FF,#7AD9FF)',
            glow: 'rgba(122,217,255,0.45)',
            bar: 'linear-gradient(to right,#7AD9FF,#0B7FBF)',
        };
    if (idx >= 6)
        return {
            color: '#FFB86B',
            ring: 'conic-gradient(from 200deg,#FFE0B3,#FFB86B,#B35A0B,#FFE0B3,#FFB86B)',
            glow: 'rgba(255,184,107,0.45)',
            bar: 'linear-gradient(to right,#FFB86B,#B35A0B)',
        };
    if (idx >= 3)
        return {
            color: BLUE_HI,
            ring: `conic-gradient(from 200deg,#CFE4FF,${BLUE_HI},#0B4FBF,#CFE4FF,${BLUE_HI})`,
            glow: 'rgba(90,169,255,0.5)',
            bar: `linear-gradient(to right,${BLUE_HI},${BLUE},#0B4FBF)`,
        };
    return {
        color: '#9AA7BD',
        ring: 'conic-gradient(from 200deg,#E2E8F0,#9AA7BD,#4A5568,#E2E8F0,#9AA7BD)',
        glow: 'rgba(154,167,189,0.4)',
        bar: 'linear-gradient(to right,#9AA7BD,#4A5568)',
    };
}

/** لون الرتبة حسب المستوى — للشارات الصغيرة. */
function rankColor(idx: number) {
    return tier(idx).color;
}

/* ── بادج الرتبة: صورة الشارة الحقيقية + اسم بألوان الطبقة ───
 * الصورة على خلفية فاتحة صغيرة حتى لو كانت غامقة تبقى واضحة */
const RankBadge: React.FC<{ emoji?: string; name: string; idx: number; big?: boolean }> = ({ emoji, name, idx, big }) => {
    const t = tier(idx);
    const img = badgeImg(idx);
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border font-black ${big ? 'px-3.5 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]'}`}
            style={{ borderColor: `${t.color}66`, background: `${t.color}1F`, color: t.color, boxShadow: `0 0 14px -4px ${t.glow}` }}
        >
            {img
                ? <img src={img} alt="" aria-hidden="true" loading="lazy" className={big ? 'h-7 w-auto object-contain' : 'h-6 w-auto object-contain'} />
                : <span aria-hidden="true">{emoji}</span>}
            <span dir="auto">{name}</span>
        </span>
    );
};

/* ── الصورة الشخصية بحلقة متدرجة حسب الطبقة ──────────────────── */
const Avatar: React.FC<{ src?: string; name: string; idx: number; size: string; glow?: boolean }> = ({ src, name, idx, size, glow }) => {
    const t = tier(idx);
    return (
        <span className="relative block shrink-0">
            {glow && <span className="absolute -inset-2 rounded-full blur-xl animate-pulse" style={{ background: t.glow }} aria-hidden="true" />}
            <span className={`relative block rounded-full p-[3px] ${size}`} style={{ background: t.ring, boxShadow: `0 0 26px -4px ${t.glow}` }}>
                {src
                    ? <img src={src} alt={name} loading="lazy" className="w-full h-full rounded-full object-cover bg-black" />
                    : <span className="w-full h-full rounded-full bg-[#0A1A38] flex items-center justify-center font-black text-[#5AA9FF]">{(name || '?').charAt(0).toUpperCase()}</span>}
            </span>
        </span>
    );
};

/* ── سلم الرتب: بطاقة لكل رتبة بالترتيب ──────────────────────── */
const RankLadder: React.FC<{ ranks: RankDef[]; ar: boolean; title: string; sub: string; pts: string }> = ({ ranks, ar, title, sub, pts }) => {
    if (ranks.length === 0) return null;
    const ordered = [...ranks].sort((a, b) => a.min_points - b.min_points);
    return (
        <div className="mt-7">
            <div className="flex items-center justify-center gap-2">
                <span aria-hidden="true">🎖️</span>
                <h4 className="text-base sm:text-lg font-black text-white">{title}</h4>
                <span className="rounded-full border border-[#1E6FFF]/30 bg-[#1E6FFF]/10 px-2 py-0.5 text-[10px] font-black text-[#CFE4FF]" dir="ltr">
                    {ordered.length}
                </span>
            </div>
            <p className="mt-1 text-center text-[11px] text-white/40 font-medium">{sub}</p>
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-3 pt-1 px-1 snap-x" dir="ltr" style={{ scrollbarWidth: 'thin' }}>
                {ordered.map((r) => {
                    const t = tier(r.idx);
                    const img = badgeImg(r.idx);
                    return (
                        <div
                            key={r.idx}
                            className="snap-start shrink-0 w-[128px] rounded-2xl border bg-white/[0.03] p-3 text-center transition-transform duration-300 hover:-translate-y-1"
                            style={{ borderColor: `${t.color}44`, boxShadow: `0 8px 24px -12px ${t.glow}` }}
                        >
                            <div className="h-1 w-10 mx-auto rounded-full" style={{ background: t.bar }} />
                            <div className="mt-2 h-20 flex items-center justify-center">
                                {img
                                    ? <img src={img} alt={ar ? r.name_ar : r.name_en} loading="lazy" className="h-20 w-auto object-contain" style={{ filter: `drop-shadow(0 0 10px ${t.glow})` }} />
                                    : <p className="text-4xl leading-none" aria-hidden="true">{r.emoji}</p>}
                            </div>
                            <p className="mt-2 truncate text-[12px] font-black text-white" dir="auto" title={ar ? r.name_ar : r.name_en}>
                                {ar ? r.name_ar : r.name_en}
                            </p>
                            <p className="mt-1.5 inline-block rounded-lg px-2 py-0.5 text-[10px] font-black" dir="ltr"
                                style={{ background: `${t.color}1A`, color: t.color }}>
                                {nf(r.min_points)} {pts}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/* ── عمود واحد في منصة التتويج ──────────────────────────────── */
const PodiumPlace: React.FC<{
    entry: Entry; place: 1 | 2 | 3; ar: boolean; pts: string;
}> = ({ entry, place, ar, pts }) => {
    const t = tier(entry.rank_idx);
    const first = place === 1;
    const medal = place === 1 ? '👑' : place === 2 ? '🥈' : '🥉';
    const baseH = first ? 'h-16 sm:h-20' : place === 2 ? 'h-10 sm:h-12' : 'h-6 sm:h-8';
    return (
        <div className="flex flex-col items-center min-w-0 flex-1 max-w-[190px]">
            {first && <span className="text-2xl sm:text-3xl animate-bounce" aria-hidden="true">👑</span>}
            <div className={first ? '-mt-1' : 'mt-7 sm:mt-8'}>
                <Avatar src={entry.avatar} name={entry.name} idx={entry.rank_idx} glow={first}
                    size={first ? 'w-20 h-20 sm:w-28 sm:h-28 text-3xl' : 'w-14 h-14 sm:w-20 sm:h-20 text-xl'} />
            </div>
            <p className="mt-1 text-sm" aria-hidden="true">{medal}</p>
            <p className={`mt-0.5 w-full truncate text-center font-black text-white ${first ? 'text-base sm:text-xl' : 'text-xs sm:text-sm'}`}
                dir="auto" title={entry.name}>
                {entry.name}
            </p>
            <div className="mt-1.5">
                <RankBadge emoji={entry.emoji} name={ar ? (entry.rank_ar ?? '') : (entry.rank_en ?? '')} idx={entry.rank_idx} big={first} />
            </div>
            <p className={`mt-1.5 font-black ${first ? 'text-sm sm:text-base text-[#FFD166]' : 'text-[11px] sm:text-xs text-[#CFE4FF]'}`} dir="ltr">
                {nf(entry.points)} {pts}
            </p>
            <div className={`mt-2 w-full rounded-t-xl border-x border-t ${baseH} flex items-start justify-center pt-1`}
                style={{ borderColor: `${t.color}55`, background: `linear-gradient(to bottom, ${t.color}55, ${t.color}11)` }}>
                <span className="text-[11px] sm:text-xs font-black" style={{ color: t.color }} dir="ltr">#{place}</span>
            </div>
        </div>
    );
};

export const PoliceRanksBoard: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => {
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [ranks, setRanks] = useState<RankDef[]>([]);
    const [name, setName] = useState('');
    const [searching, setSearching] = useState(false);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const ar = lang === 'ar';

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/leaderboard');
            const j = await r.json();
            setEntries(Array.isArray(j.entries) ? j.entries : []);
            setRanks(Array.isArray(j.ranks) ? j.ranks : []);
        } catch {
            setEntries([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const search = async (e: React.FormEvent) => {
        e.preventDefault();
        const handle = name.trim().replace(/^@/, '');
        setErr(null);
        setProfile(null);

        // اسم Kick إنجليزي فقط — نتحقق قبل الطلب
        if (!/^[A-Za-z0-9_.]{3,24}$/.test(handle)) {
            setErr(ar
                ? 'الاسم لازم يكون إنجليزي فقط (حروف إنجليزية + أرقام + _ و .) — من 3 لـ 24 حرف'
                : 'Kick usernames are English only (letters, numbers, _ and .) — 3 to 24 chars');
            return;
        }

        setSearching(true);
        try {
            const r = await fetch(`/api/leaderboard?name=${encodeURIComponent(handle)}`);
            const j = await r.json();
            if (!r.ok) {
                setErr(j.error || (ar ? 'ما قدرنا نلاقي الاسم' : 'Could not search that name'));
                return;
            }
            setProfile(j);
        } catch {
            setErr(ar ? 'خطأ شبكة' : 'Network error');
        } finally {
            setSearching(false);
        }
    };

    // اللوحة تعرض أول 20 فقط — المنصة (3) + 17 في إطار التمرير
    const capped = entries ? entries.slice(0, 20) : null;
    const [first, second, third] = [capped?.[0], capped?.[1], capped?.[2]];
    const rest = capped?.slice(3) ?? [];
    const maxPoints = Math.max(1, ...(capped ?? []).map((e) => e.points));

    const t = {
        title: ar ? 'عدّاد الرتب' : 'Ranks Counter',
        sub: ar ? 'POLICE RANKS COUNTER' : 'POLICE RANKS COUNTER',
        tagline: ar ? 'اكتب اسمك على كيك وشوف رتبتك' : 'Type your Kick name and see your rank',
        join: ar ? 'اكتب اسمك بالإنجليزي' : 'Enter your Kick username',
        joinBtn: ar ? 'ابحث' : 'Search',
        joining: ar ? 'جارٍ البحث…' : 'Searching…',
        members: ar ? 'عضو' : 'members',
        pts: ar ? 'نقطة' : 'PTS',
        noData: ar ? 'اللوحة فاضية — البوت لسّه ما سجّل أحد' : 'Board is empty — no points recorded yet',
        top3: ar ? 'منصة الأبطال' : 'Top 3',
        ladder: ar ? 'سلم الرتب' : 'Rank Ladder',
        ladderSub: ar ? 'كل رتبة وبادجها وعدد نقاطها — من كاديت إلى الوزير' : 'Every rank, its badge and required points — from Cadet to Minister',
        toNext: ar ? 'للرتبة الجاية' : 'to next rank',
        emptyName: ar ? 'مافي اسم' : 'No name',
        msgs: ar ? 'رسالة' : 'msgs',
        followers: ar ? 'متابع' : 'followers',
        yourRank: ar ? 'ترتيبك' : 'Your rank',
        nextRank: ar ? 'نقاطك للرتبة الجاية' : 'points to next rank',
        noMember: ar ? 'ما لقيت رتبة باسمك — بس ملفك موجود' : 'No rank under that name yet — profile found',
        searchAnother: ar ? 'ابحث عن اسم ثاني' : 'Search another name',
    };

    return (
        <div className="relative w-full rounded-[28px] overflow-hidden border border-[#1E6FFF]/25 bg-[#040C1C]/85 backdrop-blur-2xl">
            {/* توهج أزرق خلفي */}
            <div className="pointer-events-none absolute -top-28 start-1/4 h-80 w-80 rounded-full bg-[#1E6FFF]/20 blur-[110px]" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-28 end-0 h-80 w-80 rounded-full bg-[#0B4FBF]/20 blur-[110px]" aria-hidden="true" />
            {/* طبقة سوداء خفيفة تعمّق الكارت كله وتخلي الأزرق يبرز */}
            <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{ background: 'linear-gradient(to bottom, rgba(1,4,12,0.45) 0%, rgba(2,6,16,0.30) 45%, rgba(1,4,12,0.55) 100%)' }}
                aria-hidden="true"
            />

            {/* خط علوي متحرك */}
            <div className="relative h-[2px] overflow-hidden" aria-hidden="true">
                <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#1E6FFF] to-transparent" />
                <div className="absolute inset-y-0 w-24 animate-pulse bg-gradient-to-r from-transparent via-white to-transparent" />
            </div>

            {/* ── الهيدر بالبانر + اللوقو ── */}
            <div className="relative z-[2]">
                <img
                    src="/rank-banner.webp"
                    alt="Police Ranks Counter"
                    width={1200}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-[104px] sm:h-[124px] md:h-[144px] object-cover object-center opacity-100"
                />
                {/*—in overlays: vignette أسود يجمّع البانر + ذوبان أسود للحافة السفلية */}
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            'radial-gradient(ellipse 80% 70% at 50% 40%, transparent 30%, rgba(2,6,16,0.55) 100%),' +
                            'linear-gradient(to bottom, rgba(2,6,16,0.30) 0%, rgba(2,6,16,0.10) 42%, rgba(4,12,28,0.85) 82%, #040C1C 100%)',
                    }}
                    aria-hidden="true"
                />

                {/* اللوقو — نازل شوي تحت، ومقطّع داخل الإطار بالكامل */}
                <div className="absolute inset-x-0 bottom-0 flex justify-center">
                    <div className="relative translate-y-[26%]">
                        {/* الهالة الزرقاء */}
                        <span className="pointer-events-none absolute -inset-1.5 rounded-full bg-[#1E6FFF]/45 blur-2xl" aria-hidden="true" />

                        {/* الإطار الخارجي */}
                        <span
                            className="relative block rounded-full p-[5px] sm:p-[6px]"
                            style={{
                                background: 'conic-gradient(from 210deg,#5AA9FF 0deg,#1E6FFF 90deg,#0B4FBF 180deg,#5AA9FF 270deg,#1E6FFF 360deg)',
                                boxShadow: '0 0 0 1px rgba(207,228,255,0.4), 0 0 26px rgba(30,111,255,0.65), 0 12px 30px -10px rgba(0,0,0,0.85)',
                            }}
                        >
                            {/* الإطار الداخلي الكحلي */}
                            <span className="block overflow-hidden rounded-full bg-[#04091A] p-[7px] sm:p-[8px] shadow-[inset_0_3px_10px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(207,228,255,0.22)]">
                                {/* اللوقو — أطرافه تذوب داخل الدائرة، ما تبيّن خالص */}
                                <img
                                    src="/rank-logo.webp"
                                    alt="Police Ranks"
                                    width={320}
                                    height={320}
                                    loading="lazy"
                                    decoding="async"
                                    className="block w-[62px] h-[62px] sm:w-[72px] sm:h-[72px] md:w-[82px] md:h-[82px] object-cover scale-[1.06]"
                                    style={{
                                        maskImage: 'radial-gradient(circle at 50% 50%, black 58%, transparent 82%)',
                                        WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 58%, transparent 82%)',
                                        filter: 'drop-shadow(0 0 8px rgba(30,111,255,0.5)) brightness(1.06) contrast(1.04)',
                                    }}
                                />
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <div className="relative z-10 px-5 pb-6 md:px-8 md:pb-8 pt-[50px] sm:pt-[56px] md:pt-[64px]">
                {/* العنوان */}
                <div className="text-center">
                    <h3 className="text-2xl sm:text-3xl md:text-4xl font-black leading-none police-title">
                        {t.title}
                    </h3>
                    <p className="mt-2 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.34em] text-[#5AA9FF]" dir="ltr">
                        {t.sub}
                    </p>
                    <p className="mt-1.5 text-[12px] text-white/45 font-medium">{t.tagline}</p>
                </div>

                {/* ── البحث بالاسم ── */}
                <form onSubmit={search} className="mt-6 flex flex-col sm:flex-row gap-2.5 max-w-lg mx-auto">
                    <div className="relative flex-1">
                        <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-[#5AA9FF]/70" aria-hidden="true">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
                            </svg>
                        </span>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_.@]/g, ''))}
                            maxLength={24}
                            placeholder={t.join}
                            aria-label={t.join}
                            autoComplete="off"
                            spellCheck={false}
                            dir="ltr"
                            className="w-full rounded-2xl bg-white/[0.04] border border-[#1E6FFF]/30 ps-11 pe-4 py-3.5 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:border-[#5AA9FF] focus:ring-2 focus:ring-[#1E6FFF]/30 transition-all"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={searching}
                        className="shrink-0 rounded-2xl px-6 py-3.5 text-sm font-black text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                        style={{
                            background: 'linear-gradient(180deg,#3D8BFF,#1E6FFF 55%,#0B4FBF)',
                            boxShadow: '0 14px 40px -12px rgba(30,111,255,0.75), inset 0 1px 0 rgba(255,255,255,0.35)',
                        }}
                    >
                        {searching ? t.joining : t.joinBtn}
                    </button>
                </form>

                {err && (
                    <p className="mt-2.5 text-center text-xs font-bold text-red-400/90">{err}</p>
                )}

                {/* ── بطاقة نتيجة البحث ── */}
                {profile && (
                    <div className="mt-5 relative overflow-hidden rounded-3xl border border-[#1E6FFF]/45 bg-gradient-to-b from-[#0A1A38]/95 to-[#040C1C]/60 animate-fade-in-up">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5AA9FF] to-transparent" aria-hidden="true" />
                        <div className="relative p-5 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-start">
                            {/* الصورة من Kick */}
                            <div className="relative shrink-0">
                                <Avatar src={profile.avatar} name={profile.display} idx={profile.rank_idx} size="w-20 h-20 text-2xl" glow />
                            </div>

                            <div className="min-w-0 flex-1 w-full">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-center sm:justify-start">
                                    <p className="text-xl sm:text-2xl font-black text-white truncate" dir="ltr" title={profile.display}>
                                        {profile.display}
                                    </p>
                                    {profile.verified && (
                                        <svg className="w-4 h-4 shrink-0 text-[#5AA9FF]" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>

                                {/* شارة الرتبة */}
                                <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                    <RankBadge emoji={profile.emoji} name={ar ? profile.rank_ar : profile.rank_en} idx={profile.rank_idx} big />
                                    {profile.position != null && (
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1E6FFF]/30 bg-[#1E6FFF]/10 px-3 py-1.5 text-[11px] font-black text-[#CFE4FF]" dir="ltr">
                                            {t.yourRank} #{profile.position}
                                            {profile.totalMembers > 0 && <span className="text-white/40">/ {profile.totalMembers}</span>}
                                        </span>
                                    )}
                                </div>

                                {/* الأرقام */}
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    <div className="rounded-2xl border border-[#1E6FFF]/20 bg-white/[0.03] px-3 py-2.5">
                                        <p className="text-lg sm:text-xl font-black text-white" dir="ltr">{nf(profile.points)}</p>
                                        <p className="mt-0.5 text-[9px] font-black uppercase text-white/35">{t.pts}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[#1E6FFF]/20 bg-white/[0.03] px-3 py-2.5">
                                        <p className="text-lg sm:text-xl font-black text-white" dir="ltr">{nf(profile.messages)}</p>
                                        <p className="mt-0.5 text-[9px] font-black uppercase text-white/35">{t.msgs}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[#1E6FFF]/20 bg-white/[0.03] px-3 py-2.5">
                                        <p className="text-lg sm:text-xl font-black text-white" dir="ltr">{profile.followers != null ? nf(profile.followers) : '—'}</p>
                                        <p className="mt-0.5 text-[9px] font-black uppercase text-white/35">{t.followers}</p>
                                    </div>
                                </div>

                                {profile.position == null && (
                                    <p className="mt-2.5 text-[11px] text-white/40">{t.noMember}</p>
                                )}

                                {profile.next_at && (
                                    <p className="mt-2.5 text-[11px] font-bold text-[#5AA9FF]" dir="ltr">
                                        +{nf(Math.max(0, profile.next_at.points - profile.points))} {t.nextRank}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="relative border-t border-white/[0.06] px-5 py-2.5 flex justify-center">
                            <button
                                type="button"
                                onClick={() => { setProfile(null); setName(''); }}
                                className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-[#5AA9FF] transition-colors"
                            >
                                {t.searchAnother}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── سلم الرتب: البادج + الاسم + النقاط لكل رتبة ── */}
                <RankLadder ranks={ranks} ar={ar} title={t.ladder} sub={t.ladderSub} pts={t.pts} />

                {/* ── منصة التوب 3: الأول وسط فوق، الثاني يمين، الثالث يسار ── */}
                {first && (
                    <div className="mt-7">
                        <div className="flex items-center justify-center gap-2">
                            <span aria-hidden="true">🏆</span>
                            <h4 className="text-base sm:text-lg font-black text-white">{t.top3}</h4>
                        </div>
                        <div dir="ltr" className="mt-4 flex items-end justify-center gap-1.5 sm:gap-4">
                            {third && <PodiumPlace entry={third} place={3} ar={ar} pts={t.pts} />}
                            <PodiumPlace entry={first} place={1} ar={ar} pts={t.pts} />
                            {second && <PodiumPlace entry={second} place={2} ar={ar} pts={t.pts} />}
                        </div>
                    </div>
                )}

                {/* ── الباقي (من الرابع): إطار تمرير يظهر ~10 ويكمل بالنزول ── */}
                <div className="mt-4 relative overflow-hidden rounded-3xl border border-[#1E6FFF]/25 bg-black/25 p-2">
                    <div className="space-y-2 max-h-[660px] overflow-y-auto px-1 py-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1E6FFF transparent' }}>
                    {entries === null && Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/[0.02] p-3 animate-pulse" style={{ animationDelay: `${i * 70}ms` }}>
                            <div className="h-9 w-9 rounded-full bg-white/[0.04]" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 w-28 rounded bg-white/[0.04]" />
                                <div className="h-2 w-40 rounded bg-white/[0.02]" />
                            </div>
                        </div>
                    ))}

                    {capped !== null && capped.length === 0 && (
                        <p className="py-10 text-center text-sm text-white/35 font-medium">{t.noData}</p>
                    )}

                    {rest.map((e) => {
                        const pct = Math.max(6, Math.round((e.points / maxPoints) * 100));
                        const tc = tier(e.rank_idx);
                        return (
                            <div
                                key={`${e.name}-${e.rank}`}
                                className="relative overflow-hidden rounded-2xl border border-[#1E6FFF]/15 bg-white/[0.02] p-3 transition-all duration-300 hover:border-[#1E6FFF]/45 hover:bg-white/[0.05]"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-8 h-8 shrink-0 rounded-xl border border-[#1E6FFF]/25 bg-[#1E6FFF]/10 flex items-center justify-center text-[11px] font-black text-[#CFE4FF]" dir="ltr">
                                        {e.rank < 10 ? `0${e.rank}` : e.rank}
                                    </span>
                                    <Avatar src={e.avatar} name={e.name} idx={e.rank_idx} size="w-10 h-10 text-sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-black text-white/90" dir="auto" title={e.name}>{e.name}</p>
                                        <p className="mt-1">
                                            <RankBadge emoji={e.emoji} name={ar ? (e.rank_ar ?? '') : (e.rank_en ?? '')} idx={e.rank_idx} />
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-xl border border-[#1E6FFF]/25 bg-[#1E6FFF]/10 px-2.5 py-1.5 text-[11px] font-black text-[#CFE4FF]" dir="ltr">
                                        {nf(e.points)}
                                    </span>
                                </div>
                                <div className="mt-2 ms-11 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                    <div className="police-bar h-full rounded-full"
                                        style={{ width: `${pct}%`, background: tc.bar }} />
                                </div>
                            </div>
                        );
                    })}
                    </div>
                    {/* ذوبان سفلي يوحي أن فيه تكملة بالنزول */}
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 h-14 bg-gradient-to-t from-[#040C1C] to-transparent" aria-hidden="true" />
                </div>

                {/* الفوتر */}
                <div className="mt-6 flex items-center justify-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#1E6FFF]/40 to-transparent" />
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#1E6FFF]/25 bg-[#1E6FFF]/[0.07] px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.28em] text-white/50">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#5AA9FF] animate-pulse shadow-[0_0_8px_#5AA9FF]" />
                        {capped?.length ?? 0} {t.members}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#1E6FFF]/40 to-transparent" />
                </div>
            </div>
        </div>
    );
};

export default PoliceRanksBoard;
