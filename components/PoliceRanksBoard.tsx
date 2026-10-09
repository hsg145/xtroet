import React, { useEffect, useState, useCallback } from 'react';

/**
 * Police Ranks Counter — لوحة الرتب على الموقع.
 * أي زائر يكتب اسمه فينزل على اللوحة مباشرة (يتسجل بـ /api/leaderboard).
 * الهوية البصرية: أزرق Tavern/الشرطة — بانر + لوقو + تدرّجات سماوية.
 */

type Entry = {
    rank: number;
    name: string;
    points: number;
    rank_idx: number;
    rank_ar?: string;
    rank_en?: string;
    emoji?: string;
    next_at?: { points: number; label: string } | null;
    avatar?: string;
};

const BLUE = '#1E6FFF';
const BLUE_HI = '#5AA9FF';
const ICE = '#CFE4FF';
const NAVY = '#040C1C';

const nf = (n: number) => n.toLocaleString('en-US');

/** لون الرتبة حسب المستوى — أزرق كله بدرجات، كل ما علّى زاد الوهج. */
function rankColor(idx: number) {
    if (idx >= 12) return '#FFD166';
    if (idx >= 9) return '#E6F0FF';
    if (idx >= 6) return BLUE_HI;
    return BLUE;
}

export const PoliceRanksBoard: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => {
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [flash, setFlash] = useState<number | null>(null);

    const ar = lang === 'ar';

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/leaderboard');
            const j = await r.json();
            setEntries(Array.isArray(j.entries) ? j.entries : []);
        } catch {
            setEntries([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const join = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length < 2) {
            setMsg({ ok: false, text: ar ? 'اكتب اسمك (حرفين على الأقل)' : 'Enter your name (2+ chars)' });
            return;
        }
        setSaving(true);
        setMsg(null);
        try {
            const r = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: trimmed }),
            });
            const j = await r.json();
            if (!r.ok || j.error) {
                setMsg({ ok: false, text: j.error || (ar ? 'ما قدرنا نسجّل الاسم' : 'Could not save your name') });
            } else {
                setName('');
                setMsg({ ok: true, text: ar ? `أهلاً ${trimmed}! ظهرت على اللوحة 🚨` : `Welcome ${trimmed}! You're on the board 🚨` });
                setFlash(0);
                await load();
            }
        } catch {
            setMsg({ ok: false, text: ar ? 'خطأ شبكة' : 'Network error' });
        } finally {
            setSaving(false);
        }
    };

    const top = entries?.[0];
    const rest = entries?.slice(1) ?? [];
    const maxPoints = Math.max(1, ...(entries ?? []).map((e) => e.points));

    const t = {
        title: ar ? 'عدّاد الرتب' : 'Ranks Counter',
        sub: ar ? 'POLICE RANKS COUNTER' : 'POLICE RANKS COUNTER',
        tagline: ar ? 'تتبّع الرتب — سجّل اسمك' : 'Track the ranks — join the board',
        join: ar ? 'سجّل اسمك' : 'Enter your name',
        joinBtn: ar ? 'انضم' : 'Join',
        joining: ar ? 'جارٍ…' : 'Joining…',
        members: ar ? 'عضو' : 'members',
        pts: ar ? 'نقطة' : 'PTS',
        noData: ar ? 'اللوحة فاضية — كن أول واحد!' : 'Board is empty — be the first!',
        top: ar ? 'المتصدر' : 'TOP',
        toNext: ar ? 'للرتبة الجاية' : 'to next rank',
        emptyName: ar ? 'مافي اسم' : 'No name',
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
                    src="/rank-banner.png"
                    alt="Police Ranks Counter"
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
                                    src="/rank-logo.png"
                                    alt="Police Ranks"
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

                {/* ── نموذج الانضمام ── */}
                <form onSubmit={join} className="mt-6 flex flex-col sm:flex-row gap-2.5 max-w-lg mx-auto">
                    <div className="relative flex-1">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={24}
                            placeholder={t.join}
                            aria-label={t.join}
                            className="w-full rounded-2xl bg-white/[0.04] border border-[#1E6FFF]/30 px-4 py-3.5 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:border-[#5AA9FF] focus:ring-2 focus:ring-[#1E6FFF]/30 transition-all"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="shrink-0 rounded-2xl px-6 py-3.5 text-sm font-black text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                        style={{
                            background: 'linear-gradient(180deg,#3D8BFF,#1E6FFF 55%,#0B4FBF)',
                            boxShadow: '0 14px 40px -12px rgba(30,111,255,0.75), inset 0 1px 0 rgba(255,255,255,0.35)',
                        }}
                    >
                        {saving ? t.joining : t.joinBtn}
                    </button>
                </form>

                {msg && (
                    <p className={`mt-2.5 text-center text-xs font-bold ${msg.ok ? 'text-[#5AA9FF]' : 'text-red-400/90'}`}>
                        {msg.text}
                    </p>
                )}

                {/* ── المتصدر ── */}
                {top && (
                    <div className="mt-7 relative overflow-hidden rounded-3xl border border-[#1E6FFF]/35 bg-gradient-to-b from-[#0A1A38]/90 to-transparent">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5AA9FF] to-transparent" aria-hidden="true" />
                        <div className="relative flex flex-col items-center p-5">
                            <span className="text-[10px] font-black tracking-[0.3em] text-[#5AA9FF]" dir="ltr">{t.top}</span>
                            <div className="mt-3 relative">
                                <span className="absolute -inset-2 rounded-full bg-[#1E6FFF]/40 blur-xl animate-pulse" aria-hidden="true" />
                                <span className="relative block w-20 h-20 rounded-full p-[3px]" style={{ background: `conic-gradient(from 200deg,#5AA9FF,#1E6FFF,#CFE4FF,#1E6FFF,#5AA9FF)`, boxShadow: '0 0 34px rgba(30,111,255,0.65)' }}>
                                    {top.avatar
                                        ? <img src={top.avatar} alt={top.name} className="w-full h-full rounded-full object-cover bg-black" />
                                        : <span className="w-full h-full rounded-full bg-[#040C1C] flex items-center justify-center text-2xl font-black text-[#5AA9FF]">{(top.name || '?').charAt(0).toUpperCase()}</span>}
                                </span>
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-lg border border-white/30 bg-[#040C1C] px-2 py-0.5 text-[10px] font-black text-[#5AA9FF]" dir="ltr">#1</span>
                            </div>
                            <p className="mt-3 text-xl font-black text-white" dir="auto">{top.name}</p>
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black"
                                    style={{ borderColor: `${rankColor(top.rank_idx)}66`, background: `${rankColor(top.rank_idx)}1F`, color: rankColor(top.rank_idx) }}>
                                    <span aria-hidden="true">{top.emoji}</span>
                                    <span dir="auto">{ar ? top.rank_ar : top.rank_en}</span>
                                </span>
                                <span className="rounded-full border border-[#1E6FFF]/30 bg-[#1E6FFF]/10 px-2.5 py-1 text-[11px] font-black text-[#CFE4FF]" dir="ltr">
                                    {nf(top.points)} {t.pts}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── الباقي ── */}
                <div className="mt-4 space-y-2">
                    {entries === null && Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/[0.02] p-3 animate-pulse" style={{ animationDelay: `${i * 70}ms` }}>
                            <div className="h-9 w-9 rounded-full bg-white/[0.04]" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 w-28 rounded bg-white/[0.04]" />
                                <div className="h-2 w-40 rounded bg-white/[0.02]" />
                            </div>
                        </div>
                    ))}

                    {entries !== null && entries.length === 0 && (
                        <p className="py-10 text-center text-sm text-white/35 font-medium">{t.noData}</p>
                    )}

                    {rest.map((e, idx) => {
                        const pct = Math.max(6, Math.round((e.points / maxPoints) * 100));
                        const rc = rankColor(e.rank_idx);
                        const justIn = flash === 0 && idx === 0;
                        return (
                            <div
                                key={`${e.name}-${e.rank}`}
                                className="relative overflow-hidden rounded-2xl border border-[#1E6FFF]/15 bg-white/[0.02] p-3 transition-all duration-300 hover:border-[#1E6FFF]/45 hover:bg-white/[0.05]"
                                style={justIn ? { animation: 'police-pop 0.6s cubic-bezier(0.16,1,0.3,1)' } : undefined}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-8 h-8 shrink-0 rounded-xl border border-[#1E6FFF]/25 bg-[#1E6FFF]/10 flex items-center justify-center text-[11px] font-black text-[#CFE4FF]" dir="ltr">
                                        {e.rank < 10 ? `0${e.rank}` : e.rank}
                                    </span>
                                    <span className="relative w-10 h-10 shrink-0 rounded-full p-[2px]" style={{ background: `linear-gradient(135deg,${rc},#040C1C)` }}>
                                        {e.avatar
                                            ? <img src={e.avatar} alt={e.name} loading="lazy" className="w-full h-full rounded-full object-cover bg-black" />
                                            : <span className="w-full h-full rounded-full bg-[#0A1A38] flex items-center justify-center text-sm font-black text-[#5AA9FF]">{(e.name || '?').charAt(0).toUpperCase()}</span>}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-black text-white/90" dir="auto">{e.name}</p>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-white/40">
                                            <span style={{ color: rc }}><span aria-hidden="true">{e.emoji}</span> <span dir="auto">{ar ? e.rank_ar : e.rank_en}</span></span>
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-xl border border-[#1E6FFF]/25 bg-[#1E6FFF]/10 px-2.5 py-1.5 text-[11px] font-black text-[#CFE4FF]" dir="ltr">
                                        {nf(e.points)}
                                    </span>
                                </div>
                                <div className="mt-2 ms-11 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                    <div className="police-bar h-full rounded-full"
                                        style={{ width: `${pct}%`, background: `linear-gradient(to right,${BLUE_HI},${BLUE},#0B4FBF)` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* الفوتر */}
                <div className="mt-6 flex items-center justify-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#1E6FFF]/40 to-transparent" />
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#1E6FFF]/25 bg-[#1E6FFF]/[0.07] px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.28em] text-white/50">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#5AA9FF] animate-pulse shadow-[0_0_8px_#5AA9FF]" />
                        {entries?.length ?? 0} {t.members}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#1E6FFF]/40 to-transparent" />
                </div>
            </div>
        </div>
    );
};

export default PoliceRanksBoard;