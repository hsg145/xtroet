import React, { useEffect, useRef, useState } from 'react';
import type { Language } from '../types';

/* ============================================================
   THREAD — a cinematic chapter about Nasser Alanazi.
   Rain falls over the whole scene, the story reads like a
   scroll-driven thread, and every beat reveals a photo from
   the album. Heavy on motion, quiet on text.
   ============================================================ */

interface Beat {
    n: string;
    kickerAr: string;
    kickerEn: string;
    headAr: string;
    headEn: string;
    textAr: string;
    textEn: string;
    photo: number;
    tone: 'emerald' | 'bronze' | 'ash';
}

const BEATS: Beat[] = [
    {
        n: '01', kickerAr: 'المستري تاون', kickerEn: 'Mistri Town',
        headAr: 'عسكري قديم', headEn: 'A veteran officer',
        textAr: 'عسكري مثابر قديم في مدينة مستري تاون. حاضر في الميدان كل يوم، وحاضر في كل حالة، حتى صار الاسم يُقال بثقة.',
        textEn: 'A stubborn veteran officer long rooted in Mistri Town — present in the field every day, and present in every case, until the name carried weight.',
        photo: 9, tone: 'emerald',
    },
    {
        n: '02', kickerAr: 'السلم العسكري', kickerEn: 'The ladder',
        headAr: 'رتبةً بعد رتبة', headEn: 'Rank after rank',
        textAr: 'ثابر لصعوده السلم العسكري رتبةً بعد رتبة، بمباشرة الميدان وبالامتياز في الحالات، حتى أصبح رئيس الشرطة قبل أكثر من سنتين.',
        textEn: 'He kept climbing, rank after rank — serving directly in the field and earning merit in every case — until he became police chief a little over two years ago.',
        photo: 15, tone: 'emerald',
    },
    {
        n: '03', kickerAr: 'بكر باكور', kickerEn: 'Bakor Bakor',
        headAr: 'الاختطاف والمحاولات', headEn: 'Abduction & attempts',
        textAr: 'واجه بكر باكور، وتم خطفه من قبل بكر عدة مرات، وقام بكر بمحاولات اغتيال لناصر العنزي. والمطر كان يهطل على المستري تاون كل ليلة.',
        textEn: 'He faced Bakor Bakor, was abducted by him several times, and Bakor made multiple attempts on his life. The rain kept falling over Mistri Town every night.',
        photo: 6, tone: 'ash',
    },
    {
        n: '04', kickerAr: 'فرقة SSF', kickerEn: 'The SSF squad',
        headAr: 'حالة بكر باكور', headEn: 'The Bakor Bakor case',
        textAr: 'ثم قام عبدالصمد القرشي بمباشرة حالة بكر باكور مع فرقة SSF، واستمرت الأحداث حتى قبض عبدالصمد القرشي على بكر، وكان معه ناصر العنزي في موقع بار ساندي.',
        textEn: 'AbdulSamad Al-Qurshi took over the Bakor Bakor case with the SSF squad. It ran until Al-Qurshi arrested Bakor — with Nasser Alanazi beside him at the Bar Sandy site.',
        photo: 3, tone: 'bronze',
    },
    {
        n: '05', kickerAr: '05 / 05 / 2024', kickerEn: '05 / 05 / 2024',
        headAr: 'حكم ناصر العنزي', headEn: 'The verdict',
        textAr: 'ثم ظنّوا أن العسكري الشريف ناصر العنزي فاسد، بسبب فساد عبدالصمد القرشي وتحيز القادة له، ثم تم إعدام ناصر العنزي من قبل عبدالصمد القرشي الفاسد.',
        textEn: 'They assumed the honorable officer Nasser Alanazi was corrupt — because of Al-Qurshi’s corruption and the commanders’ bias toward him. He was executed by the corrupt AbdulSamad Al-Qurshi.',
        photo: 1, tone: 'ash',
    },
];

const EPILOGUE = {
    ar: 'لم يمطر المطر على شيء إلا على تاريخ.',
    en: 'The rain fell on nothing but a history.',
};

/* ---------- rain: one canvas, drawn only while visible ---------- */
const RainLayer: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
    const ref = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let raf = 0;
        let w = 0;
        let h = 0;
        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        type Drop = { x: number; y: number; len: number; spd: number; o: number; w: number };
        let drops: Drop[] = [];

        const build = () => {
            const rect = canvas.getBoundingClientRect();
            w = Math.max(1, Math.round(rect.width));
            h = Math.max(1, Math.round(rect.height));
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            /* count scales with area, capped so weak phones stay smooth */
            const target = reduce ? 0 : Math.round(Math.min(190, (w * h) / 7600) * intensity);
            drops = Array.from({ length: target }, () => ({
                x: Math.random() * (w + 140) - 70,
                y: Math.random() * h,
                len: 9 + Math.random() * 26,
                spd: 380 + Math.random() * 900,
                o: 0.1 + Math.random() * 0.34,
                w: Math.random() < 0.14 ? 1.7 : 0.9,
            }));
        };

        const draw = () => {
            ctx.clearRect(0, 0, w, h);
            ctx.lineCap = 'round';

            for (const d of drops) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(190,225,255,${d.o})`;
                ctx.lineWidth = d.w;
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.len * 0.22, d.y + d.len);
                ctx.stroke();

                d.y += d.spd * 0.016;
                d.x -= d.spd * 0.0035;
                if (d.y > h + 30) {
                    d.y = -20 - Math.random() * 60;
                    d.x = Math.random() * (w + 140) - 70;
                }
                if (d.x < -80) d.x = w + 40;
            }
            raf = requestAnimationFrame(draw);
        };

        const start = () => { if (!raf && drops.length) raf = requestAnimationFrame(draw); };
        const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

        build();
        start();

        const onResize = () => { stop(); build(); start(); };
        window.addEventListener('resize', onResize);

        /* only animate while the scene is on screen */
        const io = new IntersectionObserver(
            ([e]) => (e.isIntersecting ? start() : stop()),
            { threshold: 0.02 }
        );
        io.observe(canvas);

        /* pause when the tab is hidden */
        const onVis = () => (document.hidden ? stop() : start());
        document.addEventListener('visibilitychange', onVis);

        return () => {
            stop();
            io.disconnect();
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [intensity]);

    return <canvas ref={ref} className="thr-rain" aria-hidden="true" />;
};

/* ---------- one scroll-revealed chapter ---------- */
const BeatCard: React.FC<{ beat: Beat; index: number; isAr: boolean }> = ({ beat, index, isAr }) => {
    const ref = useRef<HTMLLIElement | null>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
            { threshold: 0.22, rootMargin: '0px 0px -8% 0px' }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <li ref={ref} className={`thr-beat thr-tone-${beat.tone}${shown ? ' is-in' : ''}`} style={{ ['--i' as string]: index }}>
            <div className="thr-beat-mark" aria-hidden="true">
                <span className="thr-beat-dot" />
                <span className="thr-beat-n" dir="ltr">{beat.n}</span>
            </div>

            <div className="thr-beat-body">
                <span className="thr-beat-kicker">{isAr ? beat.kickerAr : beat.kickerEn}</span>
                <h3 className="thr-beat-head font-arabic-none">{isAr ? beat.headAr : beat.headEn}</h3>
                <p className="thr-beat-text">{isAr ? beat.textAr : beat.textEn}</p>
            </div>

            <figure className="thr-beat-photo">
                <span className="thr-photo-frame">
                    <img
                        src={`/album/${String(beat.photo).padStart(2, '0')}.jpg`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                    />
                    <span className="thr-photo-wash" aria-hidden="true" />
                    <span className="thr-photo-grain" aria-hidden="true" />
                </span>
                <figcaption className="thr-photo-cap" dir="ltr">
                    {String(beat.photo).padStart(2, '0')} / 17
                </figcaption>
            </figure>
        </li>
    );
};

export const ThreadSection: React.FC<{ lang: Language }> = ({ lang }) => {
    const isAr = lang === 'ar';

    return (
        <section
            id="thread"
            className="thr-root relative overflow-hidden scroll-mt-24"
            style={{ ['--i' as string]: 0 }}
        >
            <style>{`
            .thr-root{position:relative;isolation:isolate;
                padding:5rem 0 4.5rem;
                background:
                    radial-gradient(120% 80% at 50% -10%, rgba(16,185,129,.10), transparent 60%),
                    radial-gradient(90% 60% at 100% 110%, rgba(201,162,75,.10), transparent 62%),
                    linear-gradient(180deg,#030B08 0%,#04120D 42%,#030907 100%)}
            /* storm layers above the content's dark base, rain on top of everything */
            .thr-rain{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;
                mix-blend-mode:screen}
            .thr-fog{position:absolute;inset:-20% -10%;z-index:1;pointer-events:none;
                background:
                    radial-gradient(60% 34% at 20% 18%, rgba(255,255,255,.055), transparent 70%),
                    radial-gradient(52% 30% at 82% 62%, rgba(16,185,129,.07), transparent 72%);
                filter:blur(26px);animation:thr-fog 34s ease-in-out infinite alternate}
            @keyframes thr-fog{from{transform:translate3d(-3%,0,0) scale(1)}to{transform:translate3d(3%,2%,0) scale(1.12)}}
            .thr-vig{position:absolute;inset:0;z-index:4;pointer-events:none;
                background:radial-gradient(120% 90% at 50% 45%, transparent 42%, rgba(0,0,0,.55) 88%, rgba(0,0,0,.82) 100%)}
            .thr-bolt{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;
                background:radial-gradient(70% 42% at 62% 8%, rgba(214,240,255,.30), transparent 66%);
                animation:thr-bolt 13s ease-out infinite}
            @keyframes thr-bolt{
                0%,88%{opacity:0}
                89%{opacity:.85}
                90%{opacity:.12}
                91%{opacity:.7}
                93%{opacity:0}
                100%{opacity:0}}
            .thr-scan{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:.28;
                background:repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 1px, transparent 1px 4px);
                mix-blend-mode:overlay}
            /* headline */
            .thr-eyebrow{display:inline-flex;align-items:center;gap:.6rem;padding:.5rem .95rem;border-radius:999px;
                font-size:10px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:rgba(167,243,208,.8);
                background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.24);
                box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
            .thr-title{position:relative;font-size:clamp(2.1rem,7.4vw,4.6rem);line-height:1.04;font-weight:900;
                letter-spacing:-.015em;
                background:linear-gradient(178deg,#FFFFFF 0%,#E8FBF2 38%,#A7F3D0 74%,#34D399 100%);
                -webkit-background-clip:text;background-clip:text;color:transparent;
                filter:drop-shadow(0 10px 40px rgba(16,185,129,.28))}
            [dir="rtl"] .thr-title{letter-spacing:0!important}
            .thr-sub{font-size:clamp(.95rem,2.2vw,1.06rem);line-height:1.95;font-weight:500;color:rgba(255,255,255,.6);
                max-width:62ch}
            .thr-hair{height:2px;border-radius:999px;
                background:linear-gradient(90deg,rgba(201,162,75,.9),rgba(16,185,129,.5) 48%,transparent)}
            /* the thread rail */
            .thr-list{position:relative;display:flex;flex-direction:column;gap:clamp(2.2rem,6vw,4rem)}
            .thr-rail{position:absolute;top:14px;bottom:14px;inset-inline-start:19px;width:2px;border-radius:999px;
                background:linear-gradient(180deg,rgba(16,185,129,.45),rgba(201,162,75,.3) 55%,rgba(255,255,255,.06));
                overflow:hidden}
            .thr-rail::after{content:"";position:absolute;inset-inline:0;height:34%;border-radius:999px;
                background:linear-gradient(180deg,transparent,rgba(167,243,208,.85),transparent);
                animation:thr-flow 4.6s cubic-bezier(.45,0,.55,1) infinite}
            @keyframes thr-flow{from{transform:translateY(-120%)}to{transform:translateY(340%)}}
            .thr-beat{position:relative;display:grid;gap:1.1rem 1.6rem;align-items:center;
                grid-template-columns:40px minmax(0,1fr);
                opacity:0;transform:translateY(34px);
                transition:opacity .95s cubic-bezier(.16,1,.3,1),transform .95s cubic-bezier(.16,1,.3,1);
                transition-delay:calc(var(--i) * 60ms)}
            .thr-beat.is-in{opacity:1;transform:none}
            @media(min-width:900px){
                .thr-beat{grid-template-columns:40px minmax(0,1.05fr) minmax(0,.95fr)}
            }
            .thr-beat-mark{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:.5rem;padding-top:.35rem}
            .thr-beat-dot{width:13px;height:13px;border-radius:999px;flex:none;
                background:linear-gradient(180deg,#A7F3D0,#10B981 60%,#047857);
                box-shadow:0 0 0 4px rgba(4,18,13,1),0 0 22px rgba(16,185,129,.85);
                transition:transform .6s cubic-bezier(.16,1,.3,1)}
            .thr-beat.is-in .thr-beat-dot{transform:scale(1.18)}
            .thr-tone-bronze .thr-beat-dot{background:linear-gradient(180deg,#F4D98A,#C9A24B 60%,#8A6A3A);
                box-shadow:0 0 0 4px rgba(4,18,13,1),0 0 22px rgba(201,162,75,.85)}
            .thr-tone-ash .thr-beat-dot{background:linear-gradient(180deg,#E7EDF0,#8FA3AD 60%,#4A5A63);
                box-shadow:0 0 0 4px rgba(4,18,13,1),0 0 22px rgba(180,200,214,.7)}
            .thr-beat-n{font-size:9px;font-weight:900;letter-spacing:.14em;color:rgba(255,255,255,.32)}
            .thr-beat-body{min-width:0}
            .thr-beat-kicker{display:inline-flex;align-items:center;gap:.45rem;font-size:10px;font-weight:900;
                letter-spacing:.2em;text-transform:uppercase;color:rgba(167,243,208,.7)}
            .thr-beat-kicker::before{content:"";width:6px;height:6px;transform:rotate(45deg);background:#C9A24B;flex:none}
            .thr-tone-bronze .thr-beat-kicker{color:rgba(244,217,138,.8)}
            .thr-tone-ash .thr-beat-kicker{color:rgba(215,228,234,.6)}
            .thr-beat-head{margin:.65rem 0 0;font-size:clamp(1.35rem,4vw,2rem);line-height:1.18;font-weight:900;
                letter-spacing:-.01em;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.6)}
            [dir="rtl"] .thr-beat-head{letter-spacing:0!important}
            .thr-beat-text{margin:.7rem 0 0;font-size:clamp(.92rem,2.1vw,1rem);line-height:2;font-weight:500;
                color:rgba(255,255,255,.62);max-width:56ch}
            /* photo */
            .thr-beat-photo{position:relative;margin:0;min-width:0}
            .thr-photo-frame{position:relative;display:block;aspect-ratio:16/10;border-radius:20px;overflow:hidden;
                background:#04120D;border:1px solid rgba(255,255,255,.1);
                box-shadow:0 34px 70px -26px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.07);
                transform:scale(.94) rotate(-1.4deg);opacity:0;
                transition:transform 1.1s cubic-bezier(.16,1,.3,1),opacity .9s ease;
                transition-delay:calc(var(--i) * 60ms + 160ms)}
            .thr-beat.is-in .thr-photo-frame{transform:none;opacity:1}
            .thr-beat:nth-child(even) .thr-photo-frame{transform:scale(.94) rotate(1.4deg)}
            .thr-photo-frame::after{content:"";position:absolute;inset:0;padding:1px;border-radius:20px;
                background:linear-gradient(150deg,rgba(167,243,208,.7),rgba(16,185,129,.25) 45%,rgba(201,162,75,.6));
                -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
                -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
            .thr-photo-frame img{transition:transform 1.4s cubic-bezier(.16,1,.3,1)}
            .thr-beat:hover .thr-photo-frame img{transform:scale(1.06)}
            .thr-photo-wash{position:absolute;inset:0;pointer-events:none;
                background:linear-gradient(180deg,rgba(16,185,129,.10),transparent 42%,rgba(0,0,0,.55));
                mix-blend-mode:screen}
            .thr-photo-grain{position:absolute;inset:0;pointer-events:none;opacity:.2;mix-blend-mode:overlay;
                background-image:radial-gradient(rgba(255,255,255,.5) 1px, transparent 1px);
                background-size:3px 3px}
            .thr-photo-cap{margin-top:.7rem;font-size:10px;font-weight:900;letter-spacing:.18em;
                color:rgba(255,255,255,.28)}
            /* epilogue */
            .thr-epi{position:relative;margin-top:clamp(3rem,8vw,5rem);padding:clamp(1.6rem,4vw,2.6rem) clamp(1.4rem,4vw,2.4rem);
                border-radius:26px;text-align:center;overflow:hidden;
                background:linear-gradient(180deg,rgba(10,32,26,.6),rgba(3,10,8,.7));
                border:1px solid rgba(255,255,255,.09);
                box-shadow:0 40px 90px -34px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.06);
                backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
            .thr-epi::before{content:"";position:absolute;inset:0;pointer-events:none;
                background:radial-gradient(80% 120% at 50% 0%, rgba(16,185,129,.14), transparent 62%)}
            .thr-epi-quote{position:relative;font-size:clamp(1.1rem,3.4vw,1.75rem);line-height:1.7;font-weight:800;
                color:#EAFBF3;text-shadow:0 8px 34px rgba(16,185,129,.3)}
            [dir="rtl"] .thr-epi-quote{letter-spacing:0!important}
            .thr-epi-meta{position:relative;margin-top:1rem;display:flex;align-items:center;justify-content:center;gap:.8rem;
                font-size:10px;font-weight:900;letter-spacing:.24em;color:rgba(255,255,255,.3);text-transform:uppercase}
            .thr-epi-meta i{width:5px;height:5px;transform:rotate(45deg);background:rgba(201,162,75,.8);flex:none}
            /* cta */
            .thr-cta{position:relative;display:inline-flex;align-items:center;gap:.75rem;padding:.95rem 1.9rem;border-radius:18px;
                font-size:14px;font-weight:900;color:#04120D;text-decoration:none;overflow:hidden;
                background:linear-gradient(180deg,#A7F3D0,#10B981 55%,#047857);
                box-shadow:0 18px 40px -14px rgba(16,185,129,.85),inset 0 1px 0 rgba(255,255,255,.5);
                transition:transform .35s cubic-bezier(.16,1,.3,1),box-shadow .35s ease}
            .thr-cta:hover{transform:translateY(-2px);box-shadow:0 26px 52px -16px rgba(16,185,129,.9),inset 0 1px 0 rgba(255,255,255,.5)}
            .thr-cta:active{transform:scale(.97)}
            .thr-cta::after{content:"";position:absolute;top:-40%;bottom:-40%;width:34%;left:-75%;pointer-events:none;
                background:linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent);
                transform:skewX(-18deg);animation:thr-shine 5.4s ease-in-out infinite}
            @keyframes thr-shine{0%{left:-75%;opacity:0}14%{opacity:1}36%,100%{left:150%;opacity:0}}
            .thr-cta>*{position:relative;z-index:1}
            .thr-ghost{position:relative;display:inline-flex;align-items:center;gap:.7rem;padding:.95rem 1.7rem;border-radius:18px;
                font-size:14px;font-weight:900;color:rgba(255,255,255,.72);text-decoration:none;cursor:pointer;
                font-family:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);
                transition:transform .3s ease,color .3s ease,border-color .3s ease,background .3s ease}
            .thr-ghost:hover{color:#A7F3D0;border-color:rgba(16,185,129,.5);background:rgba(16,185,129,.1);transform:translateY(-2px)}
            .thr-ghost:active{transform:scale(.97)}
            .thr-fade-up{opacity:0;transform:translateY(26px);animation:thr-up 1.1s cubic-bezier(.16,1,.3,1) forwards;
                animation-delay:calc(var(--i) * 90ms)}
            @keyframes thr-up{to{opacity:1;transform:none}}
            a:focus-visible,button:focus-visible{outline:2px solid #10B981;outline-offset:3px;border-radius:14px}
            @media(prefers-reduced-motion:reduce){
                .thr-fog,.thr-bolt,.thr-rail::after,.thr-cta::after{animation:none}
                .thr-beat,.thr-photo-frame,.thr-fade-up{opacity:1!important;transform:none!important;transition:none!important}
                .thr-rain{display:none}
            }
            `}</style>

            {/* storm layers */}
            <span className="thr-fog" aria-hidden="true" />
            <span className="thr-scan" aria-hidden="true" />
            <RainLayer />

            <div className="relative z-[5] mx-auto w-full max-w-[1200px] px-4 sm:px-6 md:px-8">

                {/* ---- headline ---- */}
                <header className="text-center">
                    <span className="thr-fade-up inline-flex" style={{ ['--i' as string]: 0 }}>
                        <span className="thr-eyebrow">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_10px_#10B981]" aria-hidden="true" />
                            <span dir="ltr">{isAr ? 'قصة ناصر العنزي' : 'The story of Nasser Alanazi'}</span>
                        </span>
                    </span>

                    <h2 className={`thr-fade-up thr-title mt-6 ${isAr ? 'font-arabic' : ''}`} style={{ ['--i' as string]: 1 }}>
                        {isAr ? 'سِيرةٌ تحت المطر' : 'A life under the rain'}
                    </h2>

                    <p className="thr-fade-up thr-sub mx-auto mt-5" style={{ ['--i' as string]: 2 }}>
                        {isAr
                            ? 'مستري تاون، فرقة SSF، وموقع بار ساندي. خمسة فصول من حياة ناصر العنزي — الرتبة، ثم الدم، ثم تاريخ ما كان له أن يأتي.'
                            : 'Mistri Town, the SSF squad, and the Bar Sandy site. Five chapters from the life of Nasser Alanazi — the rank, then the blood, then a date that should never have come.'}
                    </p>

                    <div className="thr-fade-up mx-auto mt-8 flex max-w-md items-center gap-4" style={{ ['--i' as string]: 3 }}>
                        <span className="h-[2px] flex-1 rounded-full bg-gradient-to-l from-transparent to-[#C9A24B]/70" aria-hidden="true" />
                        <span className="w-2 h-2 rotate-45 bg-[#C9A24B]" aria-hidden="true" />
                        <span className="h-[2px] flex-1 rounded-full bg-gradient-to-r from-transparent to-[#C9A24B]/70" aria-hidden="true" />
                    </div>
                </header>

                {/* ---- the thread ---- */}
                <ol className="thr-list mt-14 md:mt-20">
                    <span className="thr-rail" aria-hidden="true" />
                    {BEATS.map((b, i) => (
                        <BeatCard key={b.n} beat={b} index={i} isAr={isAr} />
                    ))}
                </ol>

                {/* ---- epilogue + route to the album ---- */}
                <div className="thr-fade-up" style={{ ['--i' as string]: 1 }}>
                    <blockquote className="thr-epi">
                        <p className={`thr-epi-quote ${isAr ? 'font-arabic' : ''}`}>
                            {isAr ? EPILOGUE.ar : EPILOGUE.en}
                        </p>
                        <div className="thr-epi-meta">
                            <i aria-hidden="true" />
                            <span dir="ltr">NASSER ALANAZI</span>
                            <i aria-hidden="true" />
                            <span dir="ltr">05 / 05 / 2024</span>
                        </div>
                    </blockquote>

                    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                        <a href="#album" className="thr-cta">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#04120D] text-[#6EE7B7]" aria-hidden="true">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            </span>
                            {isAr ? 'ادخل ألبوم ناصر' : 'Enter Nasser’s album'}
                        </a>

                        <a
                            className="thr-ghost"
                            href="https://kick.com/xtroet"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" aria-hidden="true">
                                <path d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            {isAr ? 'شاهد البث' : 'Watch live'}
                        </a>
                    </div>
                </div>
            </div>

            {/* flash + vignette sit above the rain for depth */}
            <span className="thr-bolt" aria-hidden="true" />
            <span className="thr-vig" aria-hidden="true" />
        </section>
    );
};

export default ThreadSection;
