import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../types';

/* ============================================================
   ALBUM — final section of the XTROET hub.
   17 photos stacked as a 3D deck, switchable with arrows,
   swipe, filmstrip, keyboard, autoplay and a full lightbox.
   ============================================================ */

const PHOTOS = Array.from({ length: 17 }, (_, i) => ({
    src: `/album/${String(i + 1).padStart(2, '0')}.jpg`,
    n: i + 1,
}));

/* ---------- EDITABLE COPY — replace the bio here when the final text arrives ---------- */
const IDENTITY = {
    ar: {
        name: 'ناصر العنزي',
        handle: 'XTROET',
        role: 'ستريمر على KICK',
        bio: 'ستريمر سعودي على KICK، يبني مجتمعه حول البث: ألعاب، تحديات، ودردوس ما يهدى مع الجمهور. وكل صورة في هذا الألبوم هي لحظة من إحدى السهرات.',
        chips: ['KICK', 'ألعاب', 'تحديات', 'دردوس'],
    },
    en: {
        name: 'Nasser Alanazi',
        handle: 'XTROET',
        role: 'Streamer on KICK',
        bio: 'A Saudi streamer on KICK, building his community around the stream: games, challenges, and endless chat with the audience. Every photo in this album is a moment from one of the late nights.',
        chips: ['KICK', 'GAMES', 'CHALLENGES', 'CHAT'],
    },
} as const;

const AUTOPLAY_MS = 5200;

const wrapDelta = (d: number, n: number) => {
    const half = Math.floor(n / 2);
    let x = d;
    if (x > half) x -= n;
    if (x < -half) x += n;
    return x;
};

const pad = (n: number) => String(n).padStart(2, '0');

export const AlbumSection: React.FC<{ lang: Language }> = ({ lang }) => {
    const isAr = lang === 'ar';
    const copy = isAr ? IDENTITY.ar : IDENTITY.en;
    const dir = isAr ? -1 : 1;

    const total = PHOTOS.length;
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const [box, setBox] = useState(false);
    const stripRef = useRef<HTMLDivElement | null>(null);
    const touchX = useRef<number | null>(null);

    const go = useCallback((step: number) => {
        setActive((p) => (p + step + total) % total);
    }, [total]);

    /* autoplay — pauses on hover, focus, touch or when the lightbox is open */
    useEffect(() => {
        if (paused || box) return;
        const id = window.setTimeout(() => go(1), AUTOPLAY_MS);
        return () => window.clearTimeout(id);
    }, [active, paused, box, go]);

    /* keep the active filmstrip chip in view */
    useEffect(() => {
        const el = stripRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [active]);

    /* lightbox: lock scroll + keyboard */
    useEffect(() => {
        if (!box) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setBox(false);
            if (e.key === 'ArrowRight') go(isAr ? -1 : 1);
            if (e.key === 'ArrowLeft') go(isAr ? 1 : -1);
        };
        document.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
    }, [box, go, isAr]);

    const prev = () => go(isAr ? 1 : -1);
    const next = () => go(isAr ? -1 : 1);

    /* ---------- deck ---------- */
    const deck = PHOTOS.map((p, i) => {
        const d = wrapDelta(i - active, total);
        const ad = Math.abs(d);
        if (ad > 2) return null;

        const x = d * 60 * dir;
        const y = ad * 14;
        const rot = d * 5 * dir;
        const sc = 1 - ad * 0.07;
        const op = d === 0 ? 1 : Math.max(0.16, 0.6 - (ad - 1) * 0.22);
        const filt = d === 0 ? 'brightness(1) saturate(1.06)' : `brightness(${1 - ad * 0.42}) saturate(.7) blur(${ad === 1 ? 1.2 : 2.6}px)`;

        return (
            <div
                key={p.src}
                className="absolute inset-0 select-none"
                style={{
                    transform: `translate3d(${x}%, ${y}px, 0) rotate(${rot}deg) scale(${sc})`,
                    opacity: op,
                    filter: filt,
                    zIndex: 50 - ad,
                    transition: 'transform .78s cubic-bezier(.16,1,.3,1), opacity .6s ease, filter .6s ease',
                    willChange: 'transform',
                    pointerEvents: d === 0 ? 'auto' : 'none',
                }}
            >
                {d === 0 ? (
                    <div className="h-full w-full rounded-[26px] p-[1.5px] bg-gradient-to-b from-[#A7F3D0]/85 via-[#10B981]/35 to-[#C9A24B]/75 shadow-[0_0_60px_-14px_rgba(16,185,129,0.7)]">
                        <div className="relative h-full w-full overflow-hidden rounded-[24.5px] border border-white/10 bg-black">
                            <img
                                src={p.src}
                                alt={`${copy.name} — ${isAr ? 'صورة' : 'photo'} ${pad(p.n)}`}
                                loading={p.n <= 3 ? 'eager' : 'lazy'}
                                decoding="async"
                                className="h-full w-full object-cover"
                                onClick={() => setBox(true)}
                            />
                            <span className="alb-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/25 to-transparent" aria-hidden="true" />
                            <span className="absolute bottom-3 start-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-black text-white/85 backdrop-blur border border-white/15">
                                <span className="h-1.5 w-1.5 rotate-45 bg-[#C9A24B]" aria-hidden="true" />
                                <span dir="ltr">{pad(p.n)} / {pad(total)}</span>
                            </span>
                            <span className="pointer-events-none absolute inset-0 cursor-zoom-in" onClick={() => setBox(true)} aria-hidden="true" />
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full overflow-hidden rounded-[24px] border border-white/10 bg-black">
                        <img src={p.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </div>
                )}
            </div>
        );
    });

    return (
        <div className="w-full">
            <style>{`
            .alb-shell{position:relative;border-radius:32px;padding:1px;
                background:linear-gradient(150deg,rgba(16,185,129,.5),rgba(201,162,75,.22) 45%,rgba(16,185,129,.5));
                box-shadow:0 40px 90px -30px rgba(0,0,0,.9)}
            .alb-shell-in{position:relative;border-radius:31px;overflow:hidden;
                background:linear-gradient(180deg,rgba(9,36,28,.92),rgba(3,11,8,.96))}
            .alb-aura{position:absolute;inset:0;pointer-events:none;
                background:radial-gradient(520px 220px at 82% -10%,rgba(16,185,129,.18),transparent 70%),
                           radial-gradient(420px 200px at 8% 108%,rgba(201,162,75,.14),transparent 70%);
                animation:alb-drift 16s ease-in-out infinite alternate}
            @keyframes alb-drift{from{transform:translate3d(-2%,0,0) scale(1)}to{transform:translate3d(2%,1.5%,0) scale(1.06)}}
            .alb-stage{position:relative;aspect-ratio:4/3;perspective:1600px;transform-style:preserve-3d}
            @media(min-width:768px){.alb-stage{aspect-ratio:16/10}}
            @media(min-width:1024px){.alb-stage{aspect-ratio:4/3}}
            @media(min-width:1280px){.alb-stage{aspect-ratio:3/2}}
            .alb-reflect{position:absolute;left:8%;right:8%;bottom:-14px;height:70px;border-radius:50%;pointer-events:none;
                background:radial-gradient(closest-side,rgba(16,185,129,.30),transparent 78%);filter:blur(10px)}
            .alb-sheen{position:absolute;inset:0;mix-blend-mode:screen;opacity:.5;
                background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.22) 46%,transparent 60%);
                transform:translateX(-120%);animation:alb-sweep 6.5s ease-in-out infinite}
            @keyframes alb-sweep{0%,72%{transform:translateX(-120%)}88%,100%{transform:translateX(120%)}}
            .alb-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;
                border-radius:99px;cursor:pointer;color:#A7F3D0;flex:none;
                background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.28);
                box-shadow:inset 0 1px 0 rgba(255,255,255,.08);transition:all .35s cubic-bezier(.16,1,.3,1)}
            .alb-btn:hover{color:#04120D;border-color:transparent;transform:translateY(-2px) scale(1.05);
                background:linear-gradient(180deg,#A7F3D0,#10B981 55%,#047857);
                box-shadow:0 16px 34px -12px rgba(16,185,129,.8)}
            .alb-btn:active{transform:scale(.94)}
            .alb-btn:disabled{opacity:.35;cursor:not-allowed}
            .alb-track{position:relative;height:4px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
            .alb-fill{position:absolute;inset-block:0;inset-inline-start:0;border-radius:99px;
                background:linear-gradient(90deg,#C9A24B,#A7F3D0 45%,#10B981);
                box-shadow:0 0 14px rgba(16,185,129,.7);transition:width .6s cubic-bezier(.16,1,.3,1)}
            .alb-auto{position:absolute;inset-block:0;inset-inline-start:0;border-radius:99px;
                background:linear-gradient(90deg,rgba(255,255,255,.55),rgba(167,243,208,.75));
                animation:alb-prog 5.2s linear forwards}
            @keyframes alb-prog{from{width:0%}to{width:100%}}
            .alb-strip{max-width:100%;overflow-x:auto;overflow-y:hidden}
            .alb-chip{position:relative;flex:none;width:64px;height:46px;border-radius:13px;overflow:hidden;cursor:pointer;
                border:1px solid rgba(255,255,255,.1);background:#04120D;padding:0;
                transition:transform .45s cubic-bezier(.16,1,.3,1),border-color .35s ease,box-shadow .35s ease,opacity .35s ease;opacity:.5}
            .alb-chip img{width:100%;height:100%;object-fit:cover;display:block}
            .alb-chip:hover{opacity:.9;transform:translateY(-3px)}
            .alb-chip.is-active{opacity:1;transform:translateY(-4px) scale(1.06);border-color:transparent;
                box-shadow:0 0 0 2px #10B981,0 14px 30px -10px rgba(16,185,129,.75)}
            .alb-chip:focus-visible{outline:2px solid #A7F3D0;outline-offset:3px}
            .alb-id-name{position:relative;display:inline-block;
                background:linear-gradient(165deg,#FFFFFF 0%,#EAFBF3 34%,#A7F3D0 78%,#34D399 100%);
                -webkit-background-clip:text;background-clip:text;color:transparent;
                filter:drop-shadow(0 6px 30px rgba(16,185,129,.35))}
            [dir="rtl"] .alb-id-name{letter-spacing:0!important}
            .alb-rule{position:relative;height:2px;border-radius:99px;
                background:linear-gradient(90deg,rgba(201,162,75,.85),rgba(16,185,129,.55) 45%,transparent)}
            .alb-rule::before{content:"";position:absolute;inset-inline-start:0;top:50%;width:56px;height:2px;
                transform:translateY(-50%);border-radius:99px;
                background:linear-gradient(90deg,#F4D98A,#C9A24B);box-shadow:0 0 16px rgba(201,162,75,.75)}
            .alb-tag{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:99px;
                font-size:11px;font-weight:800;color:rgba(255,255,255,.68);
                background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.18);transition:all .3s ease}
            .alb-tag:hover{color:#A7F3D0;border-color:rgba(16,185,129,.45);background:rgba(16,185,129,.1)}
            .alb-box{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;padding:16px;
                background:rgba(2,9,7,.9);backdrop-filter:blur(18px) saturate(1.1);-webkit-backdrop-filter:blur(18px) saturate(1.1);
                animation:alb-fade .35s ease both}
            @keyframes alb-fade{from{opacity:0}to{opacity:1}}
            .alb-box-panel{position:relative;width:min(1080px,100%);animation:alb-zoom .5s cubic-bezier(.16,1,.3,1) both}
            @keyframes alb-zoom{from{opacity:0;transform:translateY(26px) scale(.94)}to{opacity:1;transform:none}}
            .alb-box-img{max-height:74vh;width:auto;max-width:100%;border-radius:22px;object-fit:contain;
                border:1px solid rgba(255,255,255,.14);box-shadow:0 50px 120px -30px rgba(0,0,0,.95)}
            .alb-x{position:absolute;top:-52px;inset-inline-end:0;width:42px;height:42px;border-radius:14px;cursor:pointer;
                display:inline-flex;align-items:center;justify-content:center;color:rgba(255,255,255,.75);
                background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);transition:all .3s ease}
            .alb-x:hover{color:#04120D;background:#A7F3D0;border-color:transparent;transform:rotate(90deg)}
            @media(prefers-reduced-motion:reduce){.alb-aura,.alb-sheen,.alb-auto{animation:none}.alb-stage>div{transition:none}}
            a:focus-visible,button:focus-visible{outline:2px solid #10B981;outline-offset:3px;border-radius:12px}
            `}</style>

            <div className="grid gap-4 md:gap-6 lg:gap-0 lg:grid-cols-[0.78fr_1.22fr] items-stretch">

                {/* ================= DECK ================= */}
                <div className="alb-shell order-1 min-w-0">
                    <div className="alb-shell-in">
                        <span className="alb-aura" aria-hidden="true" />

                        {/* stage */}
                        <div
                            className="relative px-4 pt-5 pb-6 sm:px-6"
                            onMouseEnter={() => setPaused(true)}
                            onMouseLeave={() => setPaused(false)}
                            onFocus={() => setPaused(true)}
                            onBlur={() => setPaused(false)}
                            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
                            onTouchEnd={(e) => {
                                if (touchX.current !== null) {
                                    const dx = e.changedTouches[0].clientX - touchX.current;
                                    if (Math.abs(dx) > 45) (dx < 0 ? next : prev)();
                                }
                                touchX.current = null;
                                setPaused(false);
                            }}
                        >
                            {/* header row */}
                            <div className="relative z-10 flex items-center justify-between gap-3 mb-4">
                                <span className="inline-flex items-center gap-2.5 text-[10px] font-black uppercase text-[#6EE7B7]/70">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_10px_#10B981]" />
                                    <span dir="ltr">PHOTO DECK</span>
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full bg-black/45 border border-white/10 px-3 py-1.5">
                                    <span className="text-[11px] font-black text-white" dir="ltr">{pad(active + 1)}</span>
                                    <span className="h-3 w-px bg-white/15" />
                                    <span className="text-[11px] font-black text-white/40" dir="ltr">{pad(total)}</span>
                                </span>
                            </div>

                            {/* stacked cards */}
                            <div className="alb-stage">{deck}</div>
                            <span className="alb-reflect" aria-hidden="true" />

                            {/* controls */}
                            <div className="relative z-10 mt-6 flex items-center gap-3 sm:gap-4">
                                <button type="button" className="alb-btn" onClick={prev} aria-label={isAr ? 'السابق' : 'Previous'}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M15 6l-6 6 6 6" />
                                    </svg>
                                </button>

                                <div className="flex-1 min-w-0">
                                    <div className="alb-track">
                                        <span className="alb-fill" style={{ width: `${((active + 1) / total) * 100}%` }} />
                                        {!paused && !box && (
                                            <span key={active} className="alb-auto" />
                                        )}
                                    </div>
                                    <div className="mt-2.5 flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-bold text-white/40 truncate">
                                            {isAr ? 'اسحب أو استخدم الأسهم للتنقل' : 'Swipe or use the arrows to browse'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setBox(true)}
                                            className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/60 hover:text-[#04120D] hover:bg-[#A7F3D0] hover:border-[#A7F3D0] transition-all duration-300"
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
                                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                            </svg>
                                            {isAr ? 'ملء الشاشة' : 'Fullscreen'}
                                        </button>
                                    </div>
                                </div>

                                <button type="button" className="alb-btn" onClick={next} aria-label={isAr ? 'التالي' : 'Next'}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M9 6l6 6-6 6" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* filmstrip */}
                        <div className="relative border-t border-white/[0.07] bg-black/35">
                            <div className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase text-white/30">
                                    {isAr ? 'كل الصور' : 'All frames'}
                                </span>
                                <span className="text-[10px] font-black text-[#C9A24B]/80" dir="ltr">{pad(total)}</span>
                            </div>
                            <div
                                ref={stripRef}
                                className="scrollbar-hide alb-strip flex gap-2 overflow-x-auto px-4 sm:px-6 pb-4"
                                dir="ltr"
                            >
                                {PHOTOS.map((p) => (
                                    <button
                                        key={p.src}
                                        type="button"
                                        data-i={p.n - 1}
                                        onClick={() => setActive(p.n - 1)}
                                        className={`alb-chip${active === p.n - 1 ? ' is-active' : ''}`}
                                        aria-label={`${isAr ? 'صورة' : 'Photo'} ${p.n}`}
                                        aria-current={active === p.n - 1 ? 'true' : undefined}
                                    >
                                        <img src={p.src} alt="" loading="lazy" decoding="async" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ================= IDENTITY ================= */}
                <aside className="order-2 min-w-0 flex flex-col justify-center">
                    <div className="relative h-full rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden">
                        <div
                            className="absolute -top-24 start-0 h-72 w-72 rounded-full blur-[100px] pointer-events-none"
                            style={{ background: 'radial-gradient(circle, rgba(16,185,129,.20), transparent 70%)' }}
                            aria-hidden="true"
                        />
                        <div
                            className="absolute -bottom-24 end-0 h-72 w-72 rounded-full blur-[100px] pointer-events-none"
                            style={{ background: 'radial-gradient(circle, rgba(201,162,75,.16), transparent 70%)' }}
                            aria-hidden="true"
                        />
                        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/60 to-transparent" aria-hidden="true" />

                        <div className="relative p-6 sm:p-9 lg:p-11 xl:p-12">
                            <span className="inline-flex items-center gap-2.5 text-[10px] font-black uppercase text-white/35">
                                <span className="h-1.5 w-1.5 rotate-45 bg-[#C9A24B]" aria-hidden="true" />
                                <span dir="ltr">// THE MAN BEHIND XTROET</span>
                            </span>

                            <h3 className={`alb-id-name mt-5 text-[38px] leading-[1.05] font-black tracking-tight sm:text-[52px] lg:text-[62px] xl:text-[70px] ${isAr ? 'font-arabic' : ''}`}>
                                {copy.name}
                            </h3>

                            <p className="mt-2.5 text-[11px] sm:text-xs font-black uppercase text-white/25" dir="ltr">
                                {isAr ? 'Nasser Alanazi' : 'XTROET — Nasser Alanazi'}
                            </p>

                            <div className="mt-5 flex items-center gap-3">
                                <span className="text-[15px] font-black text-[#6EE7B7]" dir="ltr">{copy.handle}</span>
                                <span className="h-1 w-1 rotate-45 bg-[#C9A24B]/70" aria-hidden="true" />
                                <span className="text-[14px] font-bold text-white/45">{copy.role}</span>
                            </div>

                            <span className="alb-rule mt-7 block" aria-hidden="true" />

                            <p className="mt-7 text-[16px] sm:text-[17px] lg:text-[18px] leading-[2.05] font-medium text-white/70 max-w-[46ch]">
                                {copy.bio}
                            </p>

                            <div className="mt-7 flex flex-wrap gap-2">
                                {copy.chips.map((c) => (
                                    <span key={c} className="alb-tag" dir={/^[\x00-\x7F]+$/.test(c) ? 'ltr' : undefined}>
                                        <span className="h-1 w-1 rotate-45 bg-[#10B981]" aria-hidden="true" />
                                        {c}
                                    </span>
                                ))}
                            </div>

                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <a href="https://kick.com/xtroet" target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-[14px] text-[#04120D] transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                                    style={{ background: 'linear-gradient(180deg,#A7F3D0,#10B981 55%,#047857)', boxShadow: '0 16px 34px -12px rgba(16,185,129,.8), inset 0 1px 0 rgba(255,255,255,.5)' }}>
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#04120D] text-[#6EE7B7]" aria-hidden="true">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                    </span>
                                    {isAr ? 'شاهد البث' : 'Watch Live'}
                                </a>

                                <button
                                    type="button"
                                    onClick={() => setBox(true)}
                                    className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl font-black text-[14px] text-white/70 transition-all duration-300 bg-white/[0.05] border border-white/10 hover:text-white hover:border-[#10B981]/50 active:scale-[0.98]"
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                                        <rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-4.5-4.5L7 19" />
                                    </svg>
                                    {isAr ? `كل الصور (${total})` : `All photos (${total})`}
                                </button>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>

            {/* ================= LIGHTBOX ================= */}
            {box && (
                <div className="alb-box" role="dialog" aria-modal="true" aria-label={isAr ? 'عارض الصور' : 'Photo viewer'} onClick={() => setBox(false)}>
                    <div className="alb-box-panel" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="alb-x" onClick={() => setBox(false)} aria-label={isAr ? 'إغلاق' : 'Close'}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>

                        <div className="relative">
                            <img src={PHOTOS[active].src} alt={`${copy.name} — ${pad(PHOTOS[active].n)}`} className="alb-box-img mx-auto" />
                        </div>

                        <div className="mt-4 flex items-center justify-center gap-4 sm:gap-6">
                            <button type="button" className="alb-btn" onClick={prev} aria-label={isAr ? 'السابق' : 'Previous'}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                            </button>
                            <span className="text-[12px] font-black text-white/70" dir="ltr">{pad(active + 1)} / {pad(total)}</span>
                            <button type="button" className="alb-btn" onClick={next} aria-label={isAr ? 'التالي' : 'Next'}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlbumSection;