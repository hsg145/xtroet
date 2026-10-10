import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * لوحة إدارة البوت — صفحة مستقلة على /admin (غرفة القيادة).
 * للرئيس فقط: كلمة سر + قفل 24 ساعة بعد 10 محاولات فاشلة لكل جهاز.
 *
 * المميزات: نقاط/رتبة/تصفير، تايم آوت (يوقف النقاط حتى للمشرفين)، تعزيزات
 * وعقوبات شخصية، فعاليات عامة (دبل/تربل/تخريب/مخصص)، أكواد نقاط مخفية،
 * تعديل أسعار الرتب (يتحدث عند الكل)، إعلانات الشات، سجل العمليات الكامل.
 */

type Lang = 'ar' | 'en';

const TOKEN_KEY = 'xtr_admin_token';
const EXP_KEY = 'xtr_admin_exp';
const DEV_KEY = 'xtr_admin_device';

function deviceId(): string {
  try {
    let d = localStorage.getItem(DEV_KEY);
    if (!d) {
      const c = globalThis.crypto as Crypto | undefined;
      d = c && 'randomUUID' in c ? c.randomUUID() : `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      localStorage.setItem(DEV_KEY, d);
    }
    return d;
  } catch {
    return 'unknown-device';
  }
}

async function callAdmin(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const token = sessionStorage.getItem(TOKEN_KEY) || '';
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, deviceId: deviceId(), token, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('unauthorized');
  if (!r.ok) {
    const e: any = new Error(j.error || 'failed');
    e.data = j;
    throw e;
  }
  return j;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function fmtLeft(ms: number, ar: boolean): string {
  if (ms <= 0) return ar ? 'انتهى' : 'ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return `${d}${ar ? 'ي' : 'd'} ${h}${ar ? 'س' : 'h'} ${m}${ar ? 'د' : 'm'}`;
  if (h > 0) return `${h}${ar ? 'س' : 'h'} ${m}${ar ? 'د' : 'm'} ${ss}${ar ? 'ث' : 's'}`;
  return `${m}${ar ? 'د' : 'm'} ${ss}${ar ? 'ث' : 's'}`;
}

const nf = (n: number) => Number(n || 0).toLocaleString('en-US');

const GOLD = '#C9A24B';
const GOLD_LT = '#F4D98A';
const GOLD_DK = '#8A6D1F';
const EMERALD = '#10B981';

/* ── الأنيميشن والخلفية ─────────────────────────────────────── */
const ADM_CSS = `
.adm-shell{--gold:${GOLD};--gold-lt:${GOLD_LT};--gold-dk:${GOLD_DK};--emerald:${EMERALD};--ink:#050403}
.adm-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:
  radial-gradient(1100px 620px at 12% -10%,rgba(201,162,75,.16),transparent 60%),
  radial-gradient(900px 560px at 88% 0%,rgba(16,185,129,.13),transparent 62%),
  radial-gradient(760px 620px at 50% 108%,rgba(201,162,75,.10),transparent 60%),
  linear-gradient(180deg,#070604 0%,#040302 60%,#050403 100%)}
.adm-grid{position:absolute;inset:-40%;opacity:.30;
  background-image:linear-gradient(rgba(201,162,75,.10) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(201,162,75,.10) 1px,transparent 1px);
  background-size:56px 56px;transform:perspective(700px) rotateX(62deg) translateY(-8%);
  animation:adm-grid 26s linear infinite;mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000,transparent 78%);
  -webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000,transparent 78%)}
@keyframes adm-grid{from{background-position:0 0}to{background-position:0 56px}}
.adm-scan{position:absolute;inset:0;mix-blend-mode:soft-light;opacity:.5;
  background:repeating-linear-gradient(180deg,rgba(255,255,255,.045) 0 1px,transparent 1px 4px)}
.adm-sweep{position:absolute;inset-x:-40%;top:-30%;height:60%;
  background:linear-gradient(105deg,transparent,rgba(244,217,138,.10),transparent);
  animation:adm-sweep 9s ease-in-out infinite}
@keyframes adm-sweep{0%{transform:translateX(-40%)}100%{transform:translateX(140%)}}
.adm-spark{position:absolute;border-radius:999px;background:rgba(244,217,138,.9);
  box-shadow:0 0 10px rgba(244,217,138,.9);animation:adm-float linear infinite}
@keyframes adm-float{0%{transform:translateY(0) scale(.6);opacity:0}
  12%{opacity:.9}88%{opacity:.7}100%{transform:translateY(-140px) scale(1.15);opacity:0}}

.adm-in{animation:adm-in .7s cubic-bezier(.16,1,.3,1) both}
@keyframes adm-in{from{opacity:0;transform:translateY(22px) scale(.985);filter:blur(6px)}
  to{opacity:1;transform:none;filter:blur(0)}}
.adm-shake{animation:adm-shake .45s cubic-bezier(.36,.07,.19,.97)}
@keyframes adm-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}
  30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
.adm-spin-slow{animation:adm-spin 14s linear infinite}
@keyframes adm-spin{to{transform:rotate(360deg)}}
.adm-spin-rev{animation:adm-spin 22s linear infinite reverse}
@keyframes adm-pulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.9;transform:scale(1.06)}}
.adm-pop{animation:adm-pop .45s cubic-bezier(.34,1.56,.64,1) both}
@keyframes adm-pop{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:scale(1)}}
.adm-breathe{animation:adm-breathe 4.5s ease-in-out infinite}
@keyframes adm-breathe{0%,100%{box-shadow:0 0 30px -14px rgba(201,162,75,.7)}
  50%{box-shadow:0 0 54px -10px rgba(201,162,75,.95)}}

.adm-frame{position:relative;border-radius:30px;padding:1px;
  background:linear-gradient(140deg,rgba(201,162,75,.65),rgba(16,185,129,.35) 38%,rgba(255,255,255,.07) 55%,rgba(16,185,129,.3) 72%,rgba(201,162,75,.65));
  box-shadow:0 40px 90px -30px rgba(0,0,0,.95),0 0 70px -30px rgba(201,162,75,.35)}
.adm-panel{position:relative;border-radius:29px;overflow:hidden;
  background:linear-gradient(180deg,rgba(14,12,8,.93),rgba(5,4,3,.96));
  backdrop-filter:blur(26px) saturate(1.15);-webkit-backdrop-filter:blur(26px) saturate(1.15)}
.adm-panel::before{content:"";position:absolute;top:0;left:10%;right:10%;height:1px;border-radius:99px;
  background:linear-gradient(90deg,transparent,rgba(244,217,138,.85),rgba(16,185,129,.7),transparent)}

.adm-card{position:relative;border-radius:24px;overflow:hidden;
  border:1px solid rgba(201,162,75,.20);background:rgba(255,255,255,.028);
  transition:transform .35s cubic-bezier(.16,1,.3,1),border-color .35s,box-shadow .35s,background .35s}
.adm-card::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;
  background:radial-gradient(420px 120px at var(--mx,50%) -10%,rgba(244,217,138,.16),transparent 70%);
  transition:opacity .35s}
.adm-card:hover{transform:translateY(-3px);border-color:rgba(244,217,138,.5);
  background:rgba(255,255,255,.05);box-shadow:0 22px 48px -22px rgba(201,162,75,.55)}
.adm-card:hover::before{opacity:1}

.adm-stat{position:relative;overflow:hidden}
.adm-stat::after{content:"";position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent,${GOLD_LT},transparent);animation:adm-slide 3.4s ease-in-out infinite}
@keyframes adm-slide{0%{transform:translateX(-100%)}60%,100%{transform:translateX(100%)}}

.adm-tab{position:relative;overflow:hidden;transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s}
.adm-tab:hover{transform:translateY(-2px)}
.adm-tab:active{transform:scale(.97)}
.adm-tab.on{color:#0B0906;background:linear-gradient(180deg,${GOLD_LT} 0%,${GOLD} 60%,${GOLD_DK} 100%);
  box-shadow:0 14px 32px -12px rgba(201,162,75,.85),inset 0 1px 0 rgba(255,255,255,.55);
  border-color:transparent}
.adm-tab.on::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.55) 50%,transparent 80%);
  transform:translateX(-120%);animation:adm-shine 4.5s ease-in-out infinite}
@keyframes adm-shine{0%{transform:translateX(-120%)}55%,100%{transform:translateX(120%)}}

.adm-btn{position:relative;overflow:hidden;transition:transform .25s cubic-bezier(.16,1,.3,1),filter .25s,box-shadow .25s}
.adm-btn:hover{filter:brightness(1.09);transform:translateY(-1.5px)}
.adm-btn:active{transform:scale(.96)}
.adm-btn:disabled{opacity:.45;filter:grayscale(.4)}
.adm-btn::after{content:"";position:absolute;top:-50%;bottom:-50%;width:38%;left:-70%;
  background:linear-gradient(105deg,transparent,rgba(255,255,255,.6),transparent);
  transform:skewX(-18deg);animation:adm-shine 5s ease-in-out infinite}
.adm-btn.ghost::after{display:none}

.adm-input{width:100%;border-radius:18px;padding:.72rem .95rem;font-size:.9rem;font-weight:800;color:#fff;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.11);outline:none;
  transition:border-color .3s,box-shadow .3s,background .3s}
.adm-input::placeholder{color:rgba(255,255,255,.24)}
.adm-input:focus{border-color:rgba(244,217,138,.65);background:rgba(255,255,255,.07);
  box-shadow:0 0 0 4px rgba(201,162,75,.14)}
.adm-input:disabled{opacity:.4}
select.adm-input option{background:#0A0806;color:#fff}

.adm-scroll{overflow-y:auto;scrollbar-width:thin;scrollbar-color:${GOLD} transparent}
.adm-scroll::-webkit-scrollbar{width:7px}
.adm-scroll::-webkit-scrollbar-track{background:transparent}
.adm-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,${GOLD_LT},${GOLD_DK});border-radius:99px}

.adm-lock-ring{position:absolute;inset:-10%;border-radius:999px;border:1px solid transparent;
  background:conic-gradient(from 0deg,transparent 0 62%,rgba(201,162,75,.9) 76%,${GOLD_LT} 88%,transparent 96%) border-box;
  -webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
  mask-composite:exclude;opacity:.9}

.adm-toast{animation:adm-toast .45s cubic-bezier(.34,1.56,.64,1) both}
@keyframes adm-toast{from{opacity:0;transform:translateY(-14px) scale(.94)}to{opacity:1;transform:none}}

.adm-row{animation:adm-row .5s cubic-bezier(.16,1,.3,1) both}
@keyframes adm-row{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}

.adm-bar{position:relative;height:5px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.07)}
.adm-bar i{position:absolute;inset:0 auto 0 0;border-radius:99px;
  background:linear-gradient(90deg,${GOLD_LT},${GOLD},${GOLD_DK});animation:adm-grow .9s cubic-bezier(.16,1,.3,1) both}
@keyframes adm-grow{from{width:0 !important}}

@media (prefers-reduced-motion:reduce){.adm-shell *,.adm-shell *::before,.adm-shell *::after{
  animation:none !important;transition:none !important}}
`;

/* نجوم الخلفية */
function Sparks({ ar }: { ar: boolean }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        bottom: `${(i * 23 + 7) % 60}%`,
        dur: `${9 + ((i * 7) % 13)}s`,
        delay: `${(i * 1.7) % 12}s`,
        size: 2 + (i % 3),
      })),
    [],
  );
  void ar;
  return (
    <div aria-hidden="true">
      {sparks.map((s, i) => (
        <span key={i} className="adm-spark" style={{ left: s.left, bottom: s.bottom, width: s.size, height: s.size, animationDuration: s.dur, animationDelay: s.delay }} />
      ))}
    </div>
  );
}

/* ── شاشة القفل ─────────────────────────────────────────────── */
const LockScreen: React.FC<{ ar: boolean; onLogin: () => void }> = ({ ar, onLogin }) => {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const now = useNow(lockedUntil != null && lockedUntil > Date.now());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || (lockedUntil && lockedUntil > Date.now())) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', deviceId: deviceId(), password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.token) {
        sessionStorage.setItem(TOKEN_KEY, j.token);
        sessionStorage.setItem(EXP_KEY, String(j.expires_at));
        setPw('');
        onLogin();
        return;
      }
      if (j.error === 'locked' && j.locked_until) {
        setLockedUntil(new Date(j.locked_until).getTime());
        setErr(ar ? 'تم قفل الجهاز 24 ساعة — 10 محاولات فاشلة' : 'Device locked 24h — 10 failed attempts');
      } else {
        setLeft(typeof j.fails_left === 'number' ? j.fails_left : null);
        setErr(ar ? 'كلمة السر غير صحيحة' : 'Wrong password');
      }
      setShake(true);
      window.setTimeout(() => setShake(false), 480);
    } catch {
      setErr(ar ? 'خطأ في الشبكة' : 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const locked = lockedUntil != null && lockedUntil > now;

  return (
    <div className="adm-card adm-pop p-7 sm:p-10 text-center">
      <div className="relative mx-auto w-24 h-24">
        <span className="adm-lock-ring adm-spin-slow" aria-hidden="true" />
        <span className="adm-lock-ring adm-spin-rev" style={{ inset: '-22%' }} aria-hidden="true" />
        <span className="absolute inset-0 rounded-full flex items-center justify-center text-4xl adm-breathe"
          style={{ background: 'radial-gradient(circle at 40% 30%,#1a1409,#080604)', border: '1px solid rgba(201,162,75,.45)' }} aria-hidden="true">
          {locked ? '🔒' : '👑'}
        </span>
      </div>

      <h2 className="mt-6 text-2xl sm:text-3xl font-black text-white" style={{ textShadow: `0 4px 26px ${GOLD}55` }}>
        {ar ? 'غرفة القيادة' : 'Command Room'}
      </h2>
      <p className="mt-1.5 text-[11px] font-black uppercase tracking-[0.34em]" style={{ color: GOLD }} dir="ltr">
        AUTHORIZED PERSONNEL ONLY
      </p>
      <p className="mt-3 text-[12px] text-white/45 font-medium">
        {ar ? 'تحكم كامل في بوت الرتب — للنشر فقط.' : 'Full control of the ranks bot — owner only.'}
      </p>

      <form onSubmit={submit} className={`mt-7 flex flex-col gap-3 ${shake ? 'adm-shake' : ''}`}>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={ar ? 'كلمة السر' : 'Password'}
            disabled={locked}
            autoComplete="current-password"
            dir="ltr"
            aria-label={ar ? 'كلمة السر' : 'Password'}
            className="adm-input text-center tracking-[0.32em] py-4 !text-base"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 end-3 my-auto h-8 px-2 rounded-lg text-white/40 hover:text-white/80 text-xs font-black transition-colors"
            aria-label={show ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
          >
            {show ? '🙈' : '👁'}
          </button>
        </div>

        <button
          type="submit"
          disabled={busy || locked || !pw}
          className="adm-btn rounded-2xl py-4 text-sm font-black"
          style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
        >
          {busy ? (ar ? 'جارٍ التحقق…' : 'Verifying…') : locked ? (ar ? 'مقفل' : 'Locked') : (ar ? 'دخول آمن' : 'Secure entry')}
        </button>
      </form>

      {locked ? (
        <p className="mt-4 text-sm font-black text-red-400 adm-breathe" dir="ltr">🔒 {fmtLeft(lockedUntil! - now, ar)}</p>
      ) : (
        left != null && (
          <div className="mt-4">
            <p className="text-[11px] font-bold text-white/45">{ar ? `محاولات متبقية: ${left}` : `${left} attempts left`}</p>
            <div className="adm-bar mt-2" aria-hidden="true">
              <i style={{ width: `${(left / 10) * 100}%` }} />
            </div>
          </div>
        )
      )}

      {err && <p className="mt-3 text-xs font-black text-red-400 adm-pop">{err}</p>}

      <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold text-white/25">
        <span aria-hidden="true">🛡</span>
        <span>{ar ? 'تشفير HMAC · 10 محاولات لكل جهاز · قفل 24 ساعة' : 'HMAC token · 10 tries per device · 24h lockout'}</span>
      </div>
      <a href="/" className="mt-5 inline-block text-[11px] font-black text-white/30 hover:text-white/60 transition-colors">
        ← {ar ? 'رجوع للموقع' : 'Back to site'}
      </a>
    </div>
  );
};

/* ── عناصر مشتركة ───────────────────────────────────────────── */
const Panel: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => (
  <div className={`adm-card adm-in p-5 sm:p-6 ${className}`} style={{ animationDelay: `${delay}ms` }}>
    <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${GOLD}88,transparent)` }} aria-hidden="true" />
    {children}
  </div>
);

type BtnTone = 'gold' | 'green' | 'red' | 'ghost' | 'blue';
const BTN: Record<BtnTone, React.CSSProperties> = {
  gold: { background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' },
  green: { background: 'linear-gradient(180deg,#A7F3D0,#10B981 55%,#047857)', color: '#04120D' },
  red: { background: 'linear-gradient(180deg,#FF7A7A,#B30000)', color: '#fff' },
  blue: { background: 'linear-gradient(180deg,#8FC7FF,#1E6FFF 55%,#0B4FBF)', color: '#fff' },
  ghost: { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.13)', color: '#fff' },
};

const B: React.FC<{ children: React.ReactNode; onClick?: () => void; disabled?: boolean; tone?: BtnTone; type?: 'button' | 'submit'; className?: string }> = ({
  children, onClick, disabled, tone = 'green', type = 'button', className = '',
}) => (
  <button type={type} onClick={onClick} disabled={disabled}
    className={`adm-btn ${tone === 'ghost' ? 'ghost' : ''} rounded-2xl px-4 py-2.5 text-[13px] font-black ${className}`}
    style={BTN[tone]}>
    {children}
  </button>
);

const L: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <label className="block">
    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</span>
    {children}
  </label>
);

/* ── الصفحة الرئيسية للوحة ──────────────────────────────────── */
type Tab = 'home' | 'users' | 'events' | 'drops' | 'ranks' | 'log';

export const AdminDashboard: React.FC = () => {
  const [lang, setLang] = useState<Lang>(() => (navigator.language || 'ar').startsWith('ar') ? 'ar' : 'ar');
  const ar = lang === 'ar';
  const [authed, setAuthed] = useState(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    const e = Number(sessionStorage.getItem(EXP_KEY) || 0);
    return !!t && e > Date.now();
  });
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<any>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(authed);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    document.title = ar ? 'غرفة القيادة — XTROET' : 'Command Room — XTROET';
    // Never index the control room.
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'noindex, nofollow');
  }, [ar]);

  const say = (ok: boolean, text: string) => {
    setToast({ ok, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  };

  const reload = useCallback(async () => {
    try {
      setData(await callAdmin('overview'));
    } catch (e: any) {
      if (String(e?.message) === 'unauthorized') {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EXP_KEY);
        setAuthed(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void reload();
    const t = setInterval(() => void reload(), 20000);
    return () => clearInterval(t);
  }, [authed, reload]);

  const run = async (action: string, params: Record<string, unknown>, okText: string) => {
    setBusy(true);
    try {
      await callAdmin(action, params);
      say(true, okText);
      await reload();
    } catch (e: any) {
      say(false, e?.data?.error ? `${ar ? 'خطأ' : 'Error'}: ${e.data.error}` : ar ? 'فشلت العملية' : 'Action failed');
      if (String(e?.message) === 'unauthorized') {
        sessionStorage.removeItem(TOKEN_KEY);
        setAuthed(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXP_KEY);
    setData(null);
    setAuthed(false);
  };

  const ev = data?.event && data.event.ends_at && new Date(data.event.ends_at).getTime() > now ? data.event : null;
  const dr = data?.drop && data.drop.ends_at && new Date(data.drop.ends_at).getTime() > now ? data.drop : null;

  const TABS: Array<{ id: Tab; ar: string; en: string; icon: string }> = [
    { id: 'home', ar: 'نظرة عامة', en: 'Overview', icon: '🏠' },
    { id: 'users', ar: 'المستخدمون', en: 'Users', icon: '👥' },
    { id: 'events', ar: 'الفعاليات', en: 'Events', icon: '🔥' },
    { id: 'drops', ar: 'الأكواد', en: 'Drops', icon: '🎁' },
    { id: 'ranks', ar: 'أسعار الرتب', en: 'Rank prices', icon: '🎖️' },
    { id: 'log', ar: 'السجل', en: 'Log', icon: '📜' },
  ];

  return (
    <div className="adm-shell min-h-screen w-full text-white" dir={ar ? 'rtl' : 'ltr'}>
      <style>{ADM_CSS}</style>

      <div className="adm-bg" aria-hidden="true">
        <div className="adm-grid" />
        <Sparks ar={ar} />
        <div className="adm-sweep" />
        <div className="adm-scan" />
      </div>

      <div className="relative z-10 min-h-screen w-full max-w-[1180px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {!authed ? (
          <div className="max-w-md mx-auto adm-in pt-6">
            <LockScreen ar={ar} onLogin={() => setAuthed(true)} />
          </div>
        ) : (
          <>
            {/* الهيدر */}
            <header className="adm-frame adm-in">
              <div className="adm-panel px-5 sm:px-7 py-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="relative w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 adm-breathe"
                      style={{ background: 'radial-gradient(circle at 40% 30%,#1c160b,#080604)', border: '1px solid rgba(201,162,75,.5)' }} aria-hidden="true">
                      👑
                    </span>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-2xl font-black leading-none" style={{ textShadow: `0 4px 24px ${GOLD}44` }}>
                        {ar ? 'غرفة القيادة' : 'Command Room'}
                      </h1>
                      <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: GOLD }} dir="ltr">
                        RANKSBOT CONTROL
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[10px] font-black"
                      style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.35)', color: '#6EE7B7' }} dir="ltr">
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: EMERALD, boxShadow: `0 0 10px ${EMERALD}` }} />
                      #{data?.channel?.slug ?? '…'}
                    </span>
                    <button onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                      className="adm-btn ghost rounded-2xl px-3.5 py-2 text-[11px] font-black text-white/70" aria-label="language">
                      {ar ? 'EN' : 'عربي'}
                    </button>
                    <a href="/" className="adm-btn ghost rounded-2xl px-3.5 py-2 text-[11px] font-black text-white/70 no-underline">
                      {ar ? 'الموقع' : 'Site'}
                    </a>
                    <B tone="red" onClick={logout} className="!px-3.5 !py-2 !text-[11px]">{ar ? 'خروج' : 'Exit'}</B>
                  </div>
                </div>

                {(ev || dr) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ev && (
                      <span className="adm-pop inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-black"
                        style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(248,113,113,.45)', color: '#FCA5A5' }}>
                        <span aria-hidden="true">🔥</span>
                        {ev.label || `×${ev.mult}`}
                        <span dir="ltr" className="adm-breathe">⏳ {fmtLeft(new Date(ev.ends_at).getTime() - now, ar)}</span>
                        <button onClick={() => void run('event_stop', {}, ar ? 'توقفت الفعالية' : 'Event stopped')} className="underline opacity-70 hover:opacity-100">✕</button>
                      </span>
                    )}
                    {dr && (
                      <span className="adm-pop inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-black"
                        style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.45)', color: '#6EE7B7' }}>
                        <span aria-hidden="true">🎁</span>
                        {ar ? 'كود نشط' : 'Drop live'}
                        <span dir="ltr">⏳ {fmtLeft(new Date(dr.ends_at).getTime() - now, ar)}</span>
                        <button onClick={() => void run('drop_stop', {}, ar ? 'توقف الكود' : 'Drop stopped')} className="underline opacity-70 hover:opacity-100">✕</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </header>

            {/* التبويبات */}
            <nav className="mt-4 adm-panel adm-in px-2.5 py-2.5 flex gap-2 overflow-x-auto adm-scroll" style={{ animationDelay: '80ms' }} aria-label="admin tabs">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`adm-tab shrink-0 rounded-2xl px-4 sm:px-5 py-3 text-[13px] font-black whitespace-nowrap ${tab === t.id ? 'on' : 'text-white/55'}`}
                  style={tab === t.id ? undefined : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}
                  aria-current={tab === t.id ? 'page' : undefined}>
                  <span aria-hidden="true" className="me-1.5">{t.icon}</span>
                  {ar ? t.ar : t.en}
                </button>
              ))}
            </nav>

            {toast && (
              <div className="adm-toast mt-4 text-center">
                <span className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-black"
                  style={toast.ok
                    ? { background: 'rgba(16,185,129,.14)', border: '1px solid rgba(16,185,129,.5)', color: '#6EE7B7' }
                    : { background: 'rgba(239,68,68,.14)', border: '1px solid rgba(248,113,113,.5)', color: '#FCA5A5' }}>
                  <span aria-hidden="true">{toast.ok ? '✅' : '⛔'}</span>
                  {toast.text}
                </span>
              </div>
            )}

            <main className="mt-4" key={tab}>
              {tab === 'home' && <HomeTab ar={ar} data={data} busy={busy} run={run} goto={setTab} />}
              {tab === 'users' && <UsersTab ar={ar} now={now} busy={busy} run={run} />}
              {tab === 'events' && <EventsTab ar={ar} now={now} ev={ev} busy={busy} run={run} />}
              {tab === 'drops' && <DropsTab ar={ar} now={now} drop={dr} busy={busy} run={run} />}
              {tab === 'ranks' && <RanksTab ar={ar} busy={busy} run={run} />}
              {tab === 'log' && <LogTab ar={ar} />}
            </main>
          </>
        )}
      </div>
    </div>
  );
};

type RunFn = (action: string, params: Record<string, unknown>, okText: string) => Promise<void>;

/* ── نظرة عامة ──────────────────────────────────────────────── */
const HomeTab: React.FC<{ ar: boolean; data: any; busy: boolean; run: RunFn; goto: (t: Tab) => void }> = ({ ar, data, busy, run, goto }) => {
  const [text, setText] = useState('');
  const s = data?.stats;
  const cards = [
    { label: ar ? 'الأعضاء' : 'Members', value: s ? nf(s.members) : '…', icon: '👥', tint: GOLD },
    { label: ar ? 'مجموع النقاط' : 'Total points', value: s ? nf(s.totalPoints) : '…', icon: '💎', tint: EMERALD },
    { label: ar ? 'مكتومين الآن' : 'Muted now', value: s ? nf(s.mutes) : '…', icon: '⏱', tint: '#F87171' },
    { label: ar ? 'معزّزين / معاقبين' : 'Boosted / punished', value: s ? nf(s.boosts) : '…', icon: '⚡', tint: '#FBBF24' },
    { label: ar ? 'رسائل بالانتظار' : 'Queued messages', value: s ? nf(s.pendingOutbox) : '…', icon: '📬', tint: '#60A5FA' },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <div key={c.label} className="adm-card adm-stat adm-in p-4 text-center" style={{ animationDelay: `${i * 70}ms` }}>
            <p className="text-2xl" aria-hidden="true">{c.icon}</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-black" dir="ltr" style={{ color: c.tint }}>{c.value}</p>
            <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-white/40">{c.label}</p>
          </div>
        ))}
      </div>

      <Panel delay={120}>
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <span aria-hidden="true">📣</span> {ar ? 'إعلان في الشات' : 'Chat announcement'}
        </h2>
        <p className="mt-1 text-[11px] text-white/40 font-bold">{ar ? 'يظهر خلال 5 ثوانٍ في شات البوت' : 'Appears in chat within 5 seconds'}</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={400}
            placeholder={ar ? 'اكتب الإعلان…' : 'Announcement text…'} className="adm-input flex-1" />
          <B tone="gold" disabled={busy || text.trim().length < 2}
            onClick={() => { void run('announce', { text: text.trim() }, ar ? 'تم إرسال الإعلان' : 'Announcement sent'); setText(''); }}>
            {ar ? 'إرسال' : 'Send'}
          </B>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(ar ? ['🔥 فعالية الدبل بدأت — نقاطكم ×2!', '⚠️ انتبهوا: تذكير بالدبل', '🎖 رتب جديدة وصلت!'] :
            ['🔥 Double points event — x2!', '⚠️ Reminder: double event', '🎖 New ranks unlocked!']).map((q) => (
            <button key={q} onClick={() => setText(q)}
              className="rounded-full px-3 py-1.5 text-[10px] font-black text-white/50 border border-white/10 bg-white/[0.03] hover:text-white/85 hover:border-[#C9A24B]/45 transition-colors">
              {q}
            </button>
          ))}
        </div>
      </Panel>

      <Panel delay={200}>
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <span aria-hidden="true">⚡</span> {ar ? 'اختصارات سريعة' : 'Quick actions'}
        </h2>
        <div className="mt-3 grid sm:grid-cols-3 gap-2">
          <B tone="gold" disabled={busy} onClick={() => void run('event_start', { kind: 'double', mult: 2, minutes: 10 }, ar ? 'بدأ الدبل 🔥' : 'Double live')}>
            🔥 {ar ? 'دبل 10 دقائق' : 'Double 10 min'}
          </B>
          <B tone="red" disabled={busy} onClick={() => void run('event_stop', {}, ar ? 'تم إيقاف الفعالية' : 'Event stopped')}>
            ⏹ {ar ? 'إيقاف الفعالية' : 'Stop event'}
          </B>
          <B tone="blue" onClick={() => goto('users')}>
            👥 {ar ? 'إدارة شخص' : 'Manage a user'}
          </B>
        </div>
      </Panel>

      <Panel delay={280}>
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <span aria-hidden="true">📜</span> {ar ? 'آخر العمليات' : 'Recent activity'}
        </h2>
        <div className="mt-2.5 space-y-1.5 adm-scroll max-h-64">
          {(data?.recent ?? []).length === 0 && <p className="text-[11px] text-white/30">—</p>}
          {(data?.recent ?? []).map((a: any, i: number) => (
            <div key={i} className="adm-row rounded-xl px-3 py-2 flex items-center gap-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', animationDelay: `${i * 60}ms` }}>
              <span className="text-[11px] font-black shrink-0" style={{ color: GOLD }} dir="auto">{a.action}</span>
              <span className="flex-1 truncate text-[10px] text-white/40 font-bold" dir="auto">{a.detail && Object.keys(a.detail).length ? JSON.stringify(a.detail) : '—'}</span>
              <span className="text-[10px] text-white/30 font-bold shrink-0" dir="ltr">{new Date(a.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

/* ── المستخدمون ─────────────────────────────────────────────── */
const UsersTab: React.FC<{ ar: boolean; now: number; busy: boolean; run: RunFn }> = ({ ar, now, busy, run }) => {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const [finding, setFinding] = useState(false);
  const [mods, setMods] = useState<any[]>([]);
  const [amount, setAmount] = useState('100');
  const [muteMin, setMuteMin] = useState('1');
  const [boostMult, setBoostMult] = useState('2');
  const [boostMin, setBoostMin] = useState('10');
  const [rankSel, setRankSel] = useState('');

  const loadMods = useCallback(async () => {
    try {
      setMods((await callAdmin('modifiers_list')).items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadMods();
    const t = setInterval(() => void loadMods(), 20000);
    return () => clearInterval(t);
  }, [loadMods]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setFinding(true);
    setRes(null);
    setRankSel('');
    try {
      const j = await callAdmin('user_search', { name: q.trim() });
      setRes(j.found ? j : { notFound: true });
    } catch {
      setRes({ error: true });
    } finally {
      setFinding(false);
    }
  };

  const m = res && !res.notFound && !res.error ? res.member : null;

  const after = async (p: Promise<unknown>) => {
    await p;
    await loadMods();
    if (m) {
      try {
        const j = await callAdmin('user_search', { name: m.username });
        setRes(j.found ? j : { notFound: true });
      } catch { /* keep */ }
    }
  };

  const active = mods.filter((x) => x.muted || x.boosted);

  return (
    <div className="grid gap-4">
      <Panel delay={0}>
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <span aria-hidden="true">🔍</span> {ar ? 'ابحث عن شخص' : 'Find a user'}
        </h2>
        <form onSubmit={search} className="mt-3 flex flex-col sm:flex-row gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? 'اسم الشخص في كيك…' : 'Kick username…'}
            dir="ltr" className="adm-input flex-1" aria-label="username" />
          <B type="submit" tone="gold" disabled={finding || !q.trim()}>{finding ? (ar ? '…' : '…') : (ar ? 'بحث' : 'Search')}</B>
        </form>
        {res?.notFound && <p className="mt-2 text-xs text-white/45">{ar ? 'ما لقيته — لازم يكون كتب في الشات أول' : 'Not found — they must have chatted first'}</p>}
      </Panel>

      {m && (
        <Panel delay={60}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative shrink-0">
              <span className="absolute -inset-1.5 rounded-full blur-xl animate-pulse" style={{ background: `${GOLD}44` }} aria-hidden="true" />
              {res.avatar
                ? <img src={res.avatar} alt={m.username} className="relative w-[72px] h-[72px] rounded-full object-cover border-2" style={{ borderColor: `${GOLD}99` }} />
                : <span className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-2xl font-black" style={{ background: '#14100A', border: '2px solid rgba(201,162,75,.6)' }}>{(m.username || '?').charAt(0).toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg sm:text-xl font-black text-white truncate" dir="ltr">{m.username}</p>
              <p className="text-[12px] text-white/50 font-bold mt-0.5" dir="ltr">
                {nf(m.points)} {ar ? 'نقطة' : 'pts'} · {res.rank ? (ar ? res.rank.name_ar : res.rank.name_en) : ''} · #{res.position ?? '—'} · {nf(m.message_count)} {ar ? 'رسالة' : 'msgs'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {res.rank?.emoji && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: 'rgba(201,162,75,.12)', border: '1px solid rgba(201,162,75,.4)', color: GOLD_LT }}>
                    <span aria-hidden="true">{res.rank.emoji}</span>{ar ? res.rank.name_ar : res.rank.name_en}
                  </span>
                )}
                {res.modifier?.mute_until && new Date(res.modifier.mute_until).getTime() > now && (
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: 'rgba(239,68,68,.14)', border: '1px solid rgba(248,113,113,.45)', color: '#FCA5A5' }} dir="ltr">
                    ⏱ {fmtLeft(new Date(res.modifier.mute_until).getTime() - now, ar)}
                  </span>
                )}
                {res.modifier?.multiplier != null && res.modifier?.multiplier_until && new Date(res.modifier.multiplier_until).getTime() > now && (
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ background: 'rgba(251,191,36,.14)', border: '1px solid rgba(251,191,36,.45)', color: '#FBBF24' }} dir="ltr">
                    ×{res.modifier.multiplier} ⏳ {fmtLeft(new Date(res.modifier.multiplier_until).getTime() - now, ar)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid md:grid-cols-2 gap-3">
            {/* النقاط والرتبة */}
            <div className="adm-card p-4">
              <p className="text-xs font-black text-white flex items-center gap-2"><span aria-hidden="true">💎</span> {ar ? 'النقاط والرتبة' : 'Points & rank'}</p>
              <div className="mt-3 flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ''))}
                  dir="ltr" inputMode="numeric" className="adm-input text-center" aria-label="amount" />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <B disabled={busy} tone="green" onClick={() => void after(run('user_points', { user_id: m.kick_user_id, username: m.username, mode: 'add', amount: Number(amount) || 0 }, ar ? 'تمت الإضافة' : 'Points added'))}>+ {ar ? 'إضافة' : 'Add'}</B>
                <B disabled={busy} tone="blue" onClick={() => void after(run('user_points', { user_id: m.kick_user_id, username: m.username, mode: 'set', amount: Number(amount) || 0 }, ar ? 'تم التعيين' : 'Points set'))}>= {ar ? 'تعيين' : 'Set'}</B>
                <B disabled={busy} tone="red" onClick={() => void after(run('user_reset', { user_id: m.kick_user_id, username: m.username }, ar ? 'تم التصفير' : 'User reset'))}>♻️ {ar ? 'تصفير' : 'Reset'}</B>
              </div>
              <div className="mt-3">
                <L label={ar ? 'تغيير الرتبة' : 'Change rank'}>
                  <select value={rankSel} onChange={(e) => setRankSel(e.target.value)} className="adm-input" aria-label="rank">
                    <option value="">{ar ? 'اختر رتبة…' : 'Pick a rank…'}</option>
                    {(res.ranks ?? []).map((r: any) => (
                      <option key={r.idx} value={r.idx}>
                        {r.emoji} {ar ? r.name_ar : r.name_en} — {nf(r.min_points)}
                      </option>
                    ))}
                  </select>
                </L>
                <div className="mt-2">
                  <B tone="gold" disabled={busy || !rankSel}
                    onClick={() => void after(run('user_rank', { user_id: m.kick_user_id, username: m.username, rank_idx: Number(rankSel) }, ar ? 'تم تغيير الرتبة' : 'Rank changed'))}>
                    {ar ? 'تطبيق الرتبة' : 'Apply rank'}
                  </B>
                </div>
              </div>
            </div>

            {/* تايم آوت + تعزيز */}
            <div className="adm-card p-4">
              <p className="text-xs font-black text-white flex items-center gap-2"><span aria-hidden="true">⏱</span> {ar ? 'تايم آوت (يوقف النقاط — حتى للمشرفين)' : 'Timeout (stops points — even mods)'}</p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {['1', '5', '15', '60'].map((v) => (
                  <button key={v} type="button" onClick={() => setMuteMin(v)} dir="ltr"
                    className={`rounded-xl py-2.5 text-[12px] font-black transition-all adm-btn ${muteMin === v ? '' : 'ghost text-white/50'}`}
                    style={muteMin === v ? { background: 'linear-gradient(180deg,#FF7A7A,#B30000)', color: '#fff' } : undefined}>
                    {v}m
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <B disabled={busy} tone="red" onClick={() => void after(run('user_mute', { user_id: m.kick_user_id, username: m.username, minutes: Number(muteMin) || 1 }, ar ? 'تم التايم آوت' : 'Muted'))}>
                  ⏱ {ar ? 'تايم آوت' : 'Timeout'}
                </B>
                <B disabled={busy} tone="ghost" onClick={() => void after(run('user_unmute', { user_id: m.kick_user_id }, ar ? 'تم فك الكتم' : 'Unmuted'))}>
                  {ar ? 'فك الكتم' : 'Unmute'}
                </B>
                <input value={muteMin} onChange={(e) => setMuteMin(e.target.value.replace(/[^0-9]/g, ''))}
                  dir="ltr" inputMode="numeric" placeholder="min" className="adm-input text-center" aria-label="mute minutes" />
              </div>

              <p className="text-xs font-black text-white mt-4 flex items-center gap-2"><span aria-hidden="true">⚡</span> {ar ? 'تعزيز / عقوبة' : 'Boost / punish'}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={boostMult} onChange={(e) => setBoostMult(e.target.value)} className="adm-input" dir="ltr" aria-label="multiplier">
                  <option value="3">×3 {ar ? 'تربل' : 'triple'}</option>
                  <option value="2">×2 {ar ? 'دبل' : 'double'}</option>
                  <option value="0.5">×0.5 {ar ? 'نصف نقطة' : 'half point'}</option>
                  <option value="0">0 🧊 {ar ? 'تجميد' : 'freeze'}</option>
                </select>
                <input value={boostMin} onChange={(e) => setBoostMin(e.target.value.replace(/[^0-9]/g, ''))}
                  dir="ltr" inputMode="numeric" placeholder="min" className="adm-input text-center" aria-label="boost minutes" />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <B disabled={busy} tone="gold" onClick={() => void after(run('user_boost', { user_id: m.kick_user_id, username: m.username, mult: Number(boostMult), minutes: Number(boostMin) || 10 }, ar ? 'تم التطبيق' : 'Applied'))}>
                  {ar ? 'تطبيق' : 'Apply'}
                </B>
                <B disabled={busy} tone="ghost" onClick={() => void after(run('user_boost_clear', { user_id: m.kick_user_id }, ar ? 'تمت الإزالة' : 'Cleared'))}>
                  {ar ? 'إزالة' : 'Clear'}
                </B>
              </div>
            </div>
          </div>
        </Panel>
      )}

      <Panel delay={120}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            <span aria-hidden="true">🚨</span> {ar ? 'المكتومين والمعززين الآن' : 'Active mutes & boosts'}
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: 'rgba(239,68,68,.15)', color: '#FCA5A5' }} dir="ltr">{active.length}</span>
          </h2>
          <button onClick={() => void loadMods()} className="text-[11px] font-black px-2.5 py-1 rounded-lg hover:text-white transition-colors" style={{ color: GOLD }}>↻</button>
        </div>
        <div className="mt-3 space-y-1.5 adm-scroll max-h-72">
          {active.length === 0 && <p className="text-[11px] text-white/30">{ar ? 'ما فيه أحد' : 'Nobody'}</p>}
          {active.map((x, i) => (
            <div key={x.kick_user_id} className="adm-row rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap"
              style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', animationDelay: `${i * 50}ms` }}>
              <p className="flex-1 min-w-[120px] truncate text-xs font-black text-white" dir="ltr">{x.username}</p>
              {x.muted && <span className="text-[10px] font-black text-red-300" dir="ltr">⏱ {fmtLeft(new Date(x.mute_until).getTime() - now, ar)}</span>}
              {x.boosted && <span className="text-[10px] font-black text-amber-300" dir="ltr">×{x.multiplier}</span>}
              {x.muted && <B tone="green" className="!px-2.5 !py-1 !text-[10px]" onClick={() => void after(run('user_unmute', { user_id: x.kick_user_id }, ar ? 'تم' : 'OK'))}>{ar ? 'فك' : 'free'}</B>}
              {x.boosted && <B tone="ghost" className="!px-2.5 !py-1 !text-[10px]" onClick={() => void after(run('user_boost_clear', { user_id: x.kick_user_id }, ar ? 'تم' : 'OK'))}>{ar ? 'إزالة' : 'clear'}</B>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

/* ── الفعاليات ──────────────────────────────────────────────── */
const EventsTab: React.FC<{ ar: boolean; now: number; ev: any; busy: boolean; run: RunFn }> = ({ ar, now, ev, busy, run }) => {
  const [minutes, setMinutes] = useState('10');
  const [customMult, setCustomMult] = useState('2');
  const presets = [
    { kind: 'double', mult: 2, icon: '🔥', label: ar ? 'الدبل' : 'Double', sub: '×2', tint: '239,68,68' },
    { kind: 'triple', mult: 3, icon: '⚡', label: ar ? 'التربل' : 'Triple', sub: '×3', tint: '251,191,36' },
    { kind: 'sabotage', mult: 0.5, icon: '💔', label: ar ? 'التخريب' : 'Sabotage', sub: '×0.5', tint: '168,85,247' },
  ];
  return (
    <div className="grid gap-4">
      {ev && (
        <Panel delay={0}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-black text-white">{ev.label}</p>
              <p className="mt-1 text-3xl font-black text-red-300 adm-breathe" dir="ltr">⏳ {fmtLeft(new Date(ev.ends_at).getTime() - now, ar)}</p>
            </div>
            <B tone="red" disabled={busy} onClick={() => void run('event_stop', {}, ar ? 'توقفت الفعالية' : 'Event stopped')}>
              ⏹ {ar ? 'إيقاف' : 'Stop'}
            </B>
          </div>
        </Panel>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {presets.map((p, i) => (
          <Panel key={p.kind} delay={i * 70} className="!p-5 text-center">
            <p className="text-4xl adm-pop" style={{ animationDelay: `${i * 120}ms` }} aria-hidden="true">{p.icon}</p>
            <p className="mt-2 text-base font-black text-white">{p.label}</p>
            <p className="text-2xl font-black mt-0.5" style={{ color: `rgb(${p.tint})` }} dir="ltr">{p.sub}</p>
            <div className="mt-4">
              <B tone="gold" disabled={busy || !!ev} className="w-full"
                onClick={() => void run('event_start', { kind: p.kind, mult: p.mult, minutes: Number(minutes) || 10 }, ar ? 'بدأت الفعالية 🔥' : 'Event is live')}>
                {ar ? 'تشغيل' : 'Start'}
              </B>
            </div>
          </Panel>
        ))}
      </div>

      <Panel delay={240}>
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <span aria-hidden="true">🎚</span> {ar ? 'مدة الفعالية / مضاعف مخصص' : 'Duration / custom multiplier'}
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-36">
            <L label={ar ? 'المدة (دقائق)' : 'Minutes'}>
              <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className="adm-input text-center" />
            </L>
          </div>
          <div className="flex gap-1.5">
            {['5', '10', '30', '60'].map((v) => (
              <button key={v} type="button" onClick={() => setMinutes(v)} dir="ltr"
                className={`rounded-xl px-3.5 py-2.5 text-[12px] font-black transition-all adm-btn ${minutes === v ? '' : 'ghost text-white/50'}`}
                style={minutes === v ? { background: `linear-gradient(180deg,${GOLD_LT},${GOLD_DK})`, color: '#0B0906' } : undefined}>
                {v}
              </button>
            ))}
          </div>
          <div className="w-36">
            <L label={ar ? 'مضاعف مخصص' : 'Custom mult'}>
              <input value={customMult} onChange={(e) => setCustomMult(e.target.value.replace(/[^0-9.]/g, ''))} dir="ltr" inputMode="decimal" className="adm-input text-center" />
            </L>
          </div>
          <B tone="gold" disabled={busy || !!ev} onClick={() => void run('event_start', { kind: 'custom', mult: Number(customMult) || 2, minutes: Number(minutes) || 10 }, ar ? 'بدأت الفعالية' : 'Custom event live')}>
            ⚡ {ar ? 'فعالية مخصصة' : 'Custom event'}
          </B>
        </div>
        <p className="mt-3 text-[10px] text-white/35 font-bold">
          {ar ? 'الفعالية تضرب نقاط الجميع — وتتراكم مع تعزيز الشخص نفسه. ✕0.5 يعني نص نقطة بالضبط (يدّBank الكسر).' : 'Events multiply everyone and stack with personal boosts. ✕0.5 is exactly half a point (fraction is banked).'}
        </p>
      </Panel>
    </div>
  );
};

/* ── أكواد النقاط ───────────────────────────────────────────── */
const DropsTab: React.FC<{ ar: boolean; now: number; drop: any; busy: boolean; run: RunFn }> = ({ ar, now, drop, busy, run }) => {
  const [word, setWord] = useState('');
  const [amount, setAmount] = useState('10');
  const [perMax, setPerMax] = useState('1');
  const [minutes, setMinutes] = useState('10');
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const j = await callAdmin('drop_status');
        if (!stop) setStatus(j);
      } catch { /* ignore */ }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <div className="grid gap-4">
      {drop ? (
        <Panel delay={0}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-black text-white">🎁 {ar ? 'الكود شغال الآن' : 'Drop is live'}</p>
              <p className="mt-1 text-[12px] text-white/50 font-bold" dir="ltr">
                {status ? `${status.claims} ${ar ? 'استلام' : 'claims'} · ${status.users} ${ar ? 'شخص' : 'users'}` : '…'}
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-300 adm-breathe" dir="ltr">⏳ {fmtLeft(new Date(drop.ends_at).getTime() - now, ar)}</p>
            </div>
            <B tone="red" disabled={busy} onClick={() => void run('drop_stop', {}, ar ? 'توقف الكود' : 'Drop stopped')}>
              ⏹ {ar ? 'إيقاف' : 'Stop'}
            </B>
          </div>
        </Panel>
      ) : (
        <Panel delay={0}>
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            <span aria-hidden="true">🎁</span> {ar ? 'كود نقاط مخفي جديد' : 'New hidden drop code'}
          </h2>
          <p className="mt-1.5 text-[11px] text-white/40 font-bold leading-relaxed">
            {ar
              ? 'تحط كلمة سرية، وأول من يكتبها في الشات ياخذ النقاط — وأنت تحدد الكمية والحد لكل شخص والمدة.'
              : 'Set a secret word — chatters who type it earn points. You control amount, per-user limit and duration.'}
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <L label={ar ? 'الكلمة السرية' : 'Secret word'}>
              <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={24} dir="auto" className="adm-input" placeholder="…" />
            </L>
            <L label={ar ? 'النقاط لكل استلام' : 'Points per claim'}>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className="adm-input" />
            </L>
            <L label={ar ? 'الحد لكل شخص' : 'Max per user'}>
              <input value={perMax} onChange={(e) => setPerMax(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className="adm-input" />
            </L>
            <L label={ar ? 'المدة (دقائق)' : 'Minutes'}>
              <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className="adm-input" />
            </L>
          </div>
          <div className="mt-4">
            <B tone="gold" disabled={busy || word.trim().length < 2}
              onClick={() => { void run('drop_start', { word: word.trim(), amount: Number(amount) || 10, per_max: Number(perMax) || 1, minutes: Number(minutes) || 10 }, ar ? 'بدأ الكود 🎁' : 'Drop launched'); setWord(''); }}>
              🚀 {ar ? 'بدء الفعالية' : 'Launch drop'}
            </B>
          </div>
        </Panel>
      )}
    </div>
  );
};

/* ── أسعار الرتب ────────────────────────────────────────────── */
const RanksTab: React.FC<{ ar: boolean; busy: boolean; run: RunFn }> = ({ ar, busy, run }) => {
  const [ranks, setRanks] = useState<any[]>([]);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const j = await callAdmin('ranks_get');
        setRanks(j.ranks ?? []);
        const v: Record<number, string> = {};
        (j.ranks ?? []).forEach((r: any) => { v[r.idx] = String(r.min_points); });
        setVals(v);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Panel><p className="text-center text-white/40 text-sm">…</p></Panel>;

  return (
    <Panel>
      <h2 className="text-sm font-black text-white flex items-center gap-2">
        <span aria-hidden="true">🎖️</span> {ar ? 'أسعار الرتب — تتحدث عند الكل فوراً' : 'Rank prices — live everywhere instantly'}
      </h2>
      <p className="mt-1 text-[11px] text-white/40 font-bold">
        {ar ? 'البوت + الموقع + أمر !رتب كلها تقرأ من نفس الجدول. لازم تكون تصاعدية (كل رتبة أكبر من اللي قبلها).' : 'Bot, website and !رتب all read the same table. Must ascend.'}
      </p>
      <div className="mt-4 space-y-1.5 adm-scroll max-h-[460px] pe-1">
        {ranks.map((r, i) => (
          <div key={r.idx} className="adm-row rounded-xl px-3 py-2.5 flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', animationDelay: `${i * 40}ms` }}>
            <span className="text-lg w-8 text-center shrink-0" aria-hidden="true">{r.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate" dir="auto">{ar ? r.name_ar : r.name_en}</p>
              <p className="text-[9px] text-white/35 font-bold" dir="ltr">#{r.idx}</p>
            </div>
            <input value={vals[r.idx] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [r.idx]: e.target.value.replace(/[^0-9]/g, '') }))}
              dir="ltr" inputMode="numeric" className="adm-input w-28 text-center" aria-label={r.name_en} />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <B tone="gold" disabled={busy}
          onClick={() => void run('ranks_set', { items: ranks.map((r) => ({ idx: r.idx, min_points: Number(vals[r.idx] ?? r.min_points) })) },
            ar ? 'تم حفظ الأسعار وتحديث رتب الجميع' : 'Prices saved, everyone recomputed')}>
          💾 {ar ? 'حفظ الأسعار' : 'Save prices'}
        </B>
      </div>
    </Panel>
  );
};

/* ── السجل ──────────────────────────────────────────────────── */
const LogTab: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        setItems((await callAdmin('audit_list')).items ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);
  return (
    <Panel>
      <h2 className="text-sm font-black text-white flex items-center gap-2">
        <span aria-hidden="true">📜</span> {ar ? 'سجل كل العمليات' : 'Full audit log'}
      </h2>
      <div className="mt-3 space-y-1.5 adm-scroll max-h-[520px]">
        {loading && <p className="text-center text-white/40 text-sm">…</p>}
        {!loading && items.length === 0 && <p className="text-[11px] text-white/30">—</p>}
        {items.map((a: any, i: number) => (
          <div key={i} className="adm-row rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', animationDelay: `${Math.min(i * 40, 400)}ms` }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black" style={{ color: GOLD }} dir="auto">{a.action}</span>
              <span className="text-[10px] text-white/30 font-bold ms-auto" dir="ltr">{new Date(a.created_at).toLocaleString()}</span>
            </div>
            {a.detail && Object.keys(a.detail).length > 0 && (
              <p className="text-[10px] text-white/50 font-bold mt-0.5 break-all" dir="auto">{JSON.stringify(a.detail)}</p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
};

export default AdminDashboard;