import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * لوحة إدارة البوت — للرئيس فقط.
 * دخول بكلمة سر + قفل 24 ساعة بعد 10 محاولات فاشلة لكل جهاز.
 * المميزات: نقاط/رتبة/تصفير، تايم آوت، تعزيز وعقوبات شخصية، فعاليات
 * (دبل/تربل/تخريب)، أكواد النقاط المخفية، أسعار الرتب، إعلانات الشات، سجل العمليات.
 */

type Lang = 'ar' | 'en';

const TOKEN_KEY = 'xtr_admin_token';
const EXP_KEY = 'xtr_admin_exp';
const DEV_KEY = 'xtr_admin_device';

function deviceId(): string {
  try {
    let d = localStorage.getItem(DEV_KEY);
    if (!d) {
      d = (crypto as any).randomUUID ? (crypto as any).randomUUID() : `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
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

/** tick كل ثانية — للعدادات التنازلية. */
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

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`relative overflow-hidden rounded-3xl border border-[#C9A24B]/25 bg-black/50 backdrop-blur-xl p-5 ${className}`}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A24B]/60 to-transparent" aria-hidden="true" />
    {children}
  </div>
);

const Btn: React.FC<{
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'gold' | 'green' | 'red' | 'ghost'; type?: 'button' | 'submit';
}> = ({ children, onClick, disabled, tone = 'green', type = 'button' }) => {
  const styles =
    tone === 'gold'
      ? 'background:linear-gradient(180deg,#F4D98A,#C9A24B 60%,#8a6d1f);color:#0B0906;'
      : tone === 'red'
        ? 'background:linear-gradient(180deg,#FF6B6B,#B30000);color:#fff;'
        : tone === 'ghost'
          ? 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#fff;'
          : 'background:linear-gradient(180deg,#A7F3D0,#10B981 55%,#047857);color:#04120D;';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl px-4 py-2.5 text-[13px] font-black transition-all active:scale-[0.97] disabled:opacity-50"
      style={{ ...(tone === 'ghost' ? {} : { boxShadow: '0 12px 28px -10px rgba(0,0,0,0.8)' }), ...(parseStyle(styles) as React.CSSProperties) }}
    >
      {children}
    </button>
  );
};

// tiny inline-style parser for Btn tones (keeps JSX readable)
function parseStyle(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  s.split(';').forEach((part) => {
    const [k, ...v] = part.split(':');
    if (k && v.length) out[k.trim()] = v.join(':').trim();
  });
  return out;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-[11px] font-black text-white/50">{label}</span>
    {children}
  </label>
);

const inputCls =
  'w-full rounded-2xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 text-sm font-bold text-white placeholder:text-white/25 outline-none focus:border-[#C9A24B]/60 focus:ring-2 focus:ring-[#C9A24B]/20 transition-all';

/* ── شاشة القفل ─────────────────────────────────────────────── */
const LockScreen: React.FC<{
  ar: boolean; onLogin: () => void;
}> = ({ ar, onLogin }) => {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [shake, setShake] = useState(0);
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
        setErr(ar ? 'تم قفل الدخول 24 ساعة — 10 محاولات فاشلة' : 'Locked for 24h — 10 failed attempts');
      } else {
        setLeft(typeof j.fails_left === 'number' ? j.fails_left : null);
        setErr(ar ? 'كلمة السر غلط' : 'Wrong password');
      }
      setShake((s) => s + 1);
    } catch {
      setErr(ar ? 'خطأ شبكة' : 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const locked = lockedUntil != null && lockedUntil > now;

  return (
    <Card className="max-w-md mx-auto text-center">
      <div className="mx-auto w-16 h-16 rounded-3xl flex items-center justify-center border border-[#C9A24B]/50 bg-[#0B0906]"
        style={{ boxShadow: '0 0 40px -8px rgba(201,162,75,0.6)' }}>
        <svg className="w-8 h-8 text-[#C9A24B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="4" y="10" width="16" height="10" rx="2.5" /><path d="M8 10V7a4 4 0 018 0v3" />
        </svg>
      </div>
      <h3 className="mt-4 text-xl font-black text-white">{ar ? 'لوحة الإدارة' : 'Admin Panel'}</h3>
      <p className="mt-1 text-[11px] text-white/40 font-bold">{ar ? 'للرئيس فقط — كلمة السر مطلوبة' : 'Owner only — password required'}</p>
      <form onSubmit={submit} key={shake} className="mt-5 flex flex-col gap-3 animate-shake" style={{ animation: shake ? 'adb-shake .4s' : undefined }}>
        <style>{`@keyframes adb-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}`}</style>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={ar ? 'كلمة السر' : 'Password'}
          disabled={locked}
          autoComplete="current-password"
          dir="ltr"
          className={`${inputCls} text-center tracking-[0.3em] disabled:opacity-40`}
        />
        <Btn type="submit" tone="gold" disabled={busy || locked || !pw}>
          {busy ? (ar ? 'جارٍ التحقق…' : 'Checking…') : locked ? (ar ? 'مقفل 🔒' : 'Locked 🔒') : (ar ? 'دخول' : 'Enter')}
        </Btn>
      </form>
      {locked ? (
        <p className="mt-3 text-xs font-black text-red-400" dir="ltr">🔒 {fmtLeft(lockedUntil - now, ar)}</p>
      ) : (
        left != null && <p className="mt-3 text-[11px] font-bold text-white/45">{ar ? `المحاولات المتبقية: ${left}` : `${left} attempts left`}</p>
      )}
      {err && !locked && <p className="mt-2 text-xs font-bold text-red-400/90">{err}</p>}
      {err && locked && <p className="mt-2 text-xs font-bold text-red-400/90">{err}</p>}
      <p className="mt-4 text-[10px] text-white/25">🛡 {ar ? '10 محاولات فاشلة = قفل 24 ساعة لكل جهاز' : '10 fails = 24h lock per device'}</p>
    </Card>
  );
};

/* ── اللوحة ────────────────────────────────────────────────── */
type Tab = 'home' | 'users' | 'events' | 'drops' | 'ranks' | 'log';

export const AdminDashboard: React.FC<{ lang: Lang }> = ({ lang }) => {
  const ar = lang === 'ar';
  const [authed, setAuthed] = useState(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    const e = Number(sessionStorage.getItem(EXP_KEY) || 0);
    return !!t && e > Date.now();
  });
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(authed);
  const msgTimer = useRef<number | null>(null);

  const say = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 4000);
  };

  const reload = useCallback(async () => {
    try {
      const j = await callAdmin('overview');
      setData(j);
    } catch (e: any) {
      if (String(e?.message) === 'unauthorized') {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EXP_KEY);
        setAuthed(false);
      }
    }
  }, []);

  useEffect(() => {
    if (authed) void reload();
  }, [authed, reload]);

  // تحديث تلقائي كل 20 ثانية داخل اللوحة
  useEffect(() => {
    if (!authed) return;
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
      say(false, e?.data?.error ? `${ar ? 'خطأ' : 'Error'}: ${e.data.error}` : (ar ? 'فشلت العملية' : 'Failed'));
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
    setAuthed(false);
    setData(null);
  };

  if (!authed) {
    return (
      <div className="relative w-full rounded-[28px] overflow-hidden border border-[#C9A24B]/30 bg-[#060604]/90 backdrop-blur-2xl px-5 py-10 md:p-12">
        <div className="pointer-events-none absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-[#C9A24B]/15 blur-[100px]" aria-hidden="true" />
        <LockScreen ar={ar} onLogin={() => setAuthed(true)} />
      </div>
    );
  }

  const ev = data?.event && data.event.ends_at && new Date(data.event.ends_at).getTime() > now ? data.event : null;
  const dr = data?.drop && data.drop.ends_at && new Date(data.drop.ends_at).getTime() > now ? data.drop : null;

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'home', label: ar ? 'نظرة عامة' : 'Overview', icon: '🏠' },
    { id: 'users', label: ar ? 'المستخدمون' : 'Users', icon: '👥' },
    { id: 'events', label: ar ? 'الفعاليات' : 'Events', icon: '🔥' },
    { id: 'drops', label: ar ? 'الأكواد' : 'Drops', icon: '🎁' },
    { id: 'ranks', label: ar ? 'الرتب' : 'Ranks', icon: '🎖️' },
    { id: 'log', label: ar ? 'السجل' : 'Log', icon: '📜' },
  ];

  return (
    <div className="relative w-full rounded-[28px] overflow-hidden border border-[#C9A24B]/30 bg-[#060604]/90 backdrop-blur-2xl">
      <div className="pointer-events-none absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-[#C9A24B]/15 blur-[100px]" aria-hidden="true" />
      <div className="relative h-[2px]" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#C9A24B] to-transparent" />
      </div>

      <div className="relative px-5 py-6 md:px-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">👑</span>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-white">{ar ? 'لوحة الإدارة' : 'Admin Panel'}</h3>
              <p className="text-[11px] text-[#C9A24B] font-bold">{data?.channel ? `#${data.channel.slug}` : '…'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn tone="ghost" onClick={() => void reload()}>{ar ? '↻ تحديث' : '↻ Refresh'}</Btn>
            <Btn tone="red" onClick={logout}>{ar ? 'خروج' : 'Logout'}</Btn>
          </div>
        </div>

        {/* شريط الفعالية الجارية */}
        {(ev || dr) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ev && (
              <span className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-3.5 py-1.5 text-xs font-black text-red-300">
                {ev.label || `×${ev.mult}`} <span dir="ltr">⏳ {fmtLeft(new Date(ev.ends_at).getTime() - now, ar)}</span>
                <button onClick={() => void run('event_stop', {}, ar ? 'توقفت الفعالية' : 'Event stopped')} className="underline">✕</button>
              </span>
            )}
            {dr && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-black text-emerald-300">
                🎁 {ar ? 'كود نشط' : 'active drop'} <span dir="ltr">⏳ {fmtLeft(new Date(dr.ends_at).getTime() - now, ar)}</span>
                <button onClick={() => void run('drop_stop', {}, ar ? 'توقف الكود' : 'Drop stopped')} className="underline">✕</button>
              </span>
            )}
          </div>
        )}

        {/* التبويبات */}
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-2xl px-4 py-2.5 text-[13px] font-black transition-all ${tab === t.id ? 'text-[#0B0906]' : 'text-white/60 bg-white/[0.04] border border-white/10'}`}
              style={tab === t.id ? { background: 'linear-gradient(180deg,#F4D98A,#C9A24B)' } : undefined}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {msg && (
          <p className={`mt-3 text-center text-xs font-black ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
        )}

        <div className="mt-4">
          {tab === 'home' && <HomeTab ar={ar} data={data} now={now} busy={busy} run={run} />}
          {tab === 'users' && <UsersTab ar={ar} data={data} now={now} busy={busy} run={run} reload={reload} />}
          {tab === 'events' && <EventsTab ar={ar} now={now} ev={ev} busy={busy} run={run} />}
          {tab === 'drops' && <DropsTab ar={ar} now={now} drop={dr} busy={busy} run={run} />}
          {tab === 'ranks' && <RanksTab ar={ar} busy={busy} run={run} />}
          {tab === 'log' && <LogTab ar={ar} data={data} reload={reload} />}
        </div>
      </div>
    </div>
  );
};

type RunFn = (action: string, params: Record<string, unknown>, okText: string) => Promise<void>;

/* ── نظرة عامة ──────────────────────────────────────────────── */
const HomeTab: React.FC<{ ar: boolean; data: any; now: number; busy: boolean; run: RunFn }> = ({ ar, data, busy, run }) => {
  const [text, setText] = useState('');
  const s = data?.stats;
  const cards = [
    { label: ar ? 'الأعضاء' : 'Members', value: s ? nf(s.members) : '…', icon: '👥' },
    { label: ar ? 'مجموع النقاط' : 'Total points', value: s ? nf(s.totalPoints) : '…', icon: '💰' },
    { label: ar ? 'مكتومين الآن' : 'Muted now', value: s ? nf(s.mutes) : '…', icon: '⏱' },
    { label: ar ? 'معززين/معاقبين' : 'Boosted', value: s ? nf(s.boosts) : '…', icon: '⚡' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
            <p className="text-xl" aria-hidden="true">{c.icon}</p>
            <p className="mt-1 text-xl font-black text-white" dir="ltr">{c.value}</p>
            <p className="mt-0.5 text-[10px] font-black text-white/40">{c.label}</p>
          </div>
        ))}
      </div>
      <Card>
        <h4 className="text-sm font-black text-white">📣 {ar ? 'إعلان سريع في الشات' : 'Quick chat announcement'}</h4>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={400}
            placeholder={ar ? 'اكتب الإعلان…' : 'Announcement text…'} className={`${inputCls} flex-1`} />
          <Btn tone="gold" disabled={busy || text.trim().length < 2}
            onClick={() => { void run('announce', { text: text.trim() }, ar ? 'تم إرسال الإعلان' : 'Sent'); setText(''); }}>
            {ar ? 'إرسال' : 'Send'}
          </Btn>
        </div>
      </Card>
      <Card>
        <h4 className="text-sm font-black text-white">📜 {ar ? 'أحدث العمليات' : 'Recent actions'}</h4>
        <div className="mt-2 space-y-1.5">
          {(data?.recent ?? []).length === 0 && <p className="text-[11px] text-white/35">—</p>}
          {(data?.recent ?? []).map((a: any, i: number) => (
            <p key={i} className="text-[11px] text-white/55 font-bold" dir="auto">
              <span className="text-[#C9A24B]">{a.action}</span> · {new Date(a.created_at).toLocaleString()}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
};

/* ── المستخدمون ─────────────────────────────────────────────── */
const UsersTab: React.FC<{ ar: boolean; data: any; now: number; busy: boolean; run: RunFn; reload: () => Promise<void> }> = ({ ar, now, busy, run }) => {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const [finding, setFinding] = useState(false);
  const [mods, setMods] = useState<any[]>([]);
  const [amount, setAmount] = useState('100');
  const [muteMin, setMuteMin] = useState('1');
  const [boostMult, setBoostMult] = useState('2');
  const [boostMin, setBoostMin] = useState('10');

  const loadMods = useCallback(async () => {
    try {
      const j = await callAdmin('modifiers_list');
      setMods(j.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadMods();
  }, [loadMods]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setFinding(true);
    setRes(null);
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
      } catch { /* keep old */ }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form onSubmit={search} className="flex flex-col sm:flex-row gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? 'اسم الشخص في كيك…' : 'Kick username…'}
            dir="ltr" className={`${inputCls} flex-1`} />
          <Btn type="submit" tone="gold" disabled={finding || !q.trim()}>{finding ? '…' : (ar ? 'بحث' : 'Search')}</Btn>
        </form>
        {res?.notFound && <p className="mt-2 text-xs text-white/45">{ar ? 'ما لقيته — لازم يكتب في الشات أول' : 'Not found — they must chat first'}</p>}
      </Card>

      {m && (
        <Card>
          <div className="flex items-center gap-4 flex-wrap">
            {res.avatar
              ? <img src={res.avatar} alt={m.username} className="w-16 h-16 rounded-full object-cover border-2 border-[#C9A24B]/60" />
              : <span className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-black text-white/60">{(m.username || '?').charAt(0).toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black text-white truncate" dir="ltr">{m.username}</p>
              <p className="text-xs text-white/50 font-bold" dir="ltr">
                {nf(m.points)} {ar ? 'نقطة' : 'pts'} · {res.rank ? (ar ? res.rank.name_ar : res.rank.name_en) : ''} · #{res.position ?? '—'}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {res.modifier?.mute_until && new Date(res.modifier.mute_until).getTime() > now && (
                  <span className="rounded-full bg-red-500/15 border border-red-400/40 px-2.5 py-0.5 text-[10px] font-black text-red-300" dir="ltr">
                    ⏱ {fmtLeft(new Date(res.modifier.mute_until).getTime() - now, ar)}
                  </span>
                )}
                {res.modifier?.multiplier != null && res.modifier?.multiplier_until && new Date(res.modifier.multiplier_until).getTime() > now && (
                  <span className="rounded-full bg-amber-500/15 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-black text-amber-300" dir="ltr">
                    ×{res.modifier.multiplier} ⏳ {fmtLeft(new Date(res.modifier.multiplier_until).getTime() - now, ar)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 p-3">
              <p className="text-xs font-black text-white mb-2">💰 {ar ? 'النقاط' : 'Points'}</p>
              <div className="flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ''))}
                  dir="ltr" inputMode="numeric" className={inputCls} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn disabled={busy} onClick={() => void after(run('user_points', { user_id: m.kick_user_id, username: m.username, mode: 'add', amount: Number(amount) || 0 }, ar ? 'تمت الإضافة' : 'Added'))}>+ {ar ? 'إضافة' : 'Add'}</Btn>
                <Btn disabled={busy} onClick={() => void after(run('user_points', { user_id: m.kick_user_id, username: m.username, mode: 'set', amount: Number(amount) || 0 }, ar ? 'تم التعيين' : 'Set'))}>= {ar ? 'تعيين' : 'Set'}</Btn>
                <Btn disabled={busy} tone="red" onClick={() => void after(run('user_reset', { user_id: m.kick_user_id, username: m.username }, ar ? 'تم التصفير' : 'Reset'))}>♻️ {ar ? 'تصفير' : 'Reset'}</Btn>
              </div>
              <div className="mt-2 flex gap-2">
                <select id="adm-rank" className={`${inputCls} flex-1`} defaultValue="">
                  <option value="">{ar ? 'اختر رتبة…' : 'Pick rank…'}</option>
                  {(res.ranks ?? []).map((r: any) => (
                    <option key={r.idx} value={r.idx}>{ar ? r.name_ar : r.name_en} — {nf(r.min_points)}</option>
                  ))}
                </select>
                <Btn disabled={busy} tone="gold" onClick={() => {
                  const sel = document.getElementById('adm-rank') as HTMLSelectElement | null;
                  const v = Number(sel?.value || 0);
                  if (v > 0) void after(run('user_rank', { user_id: m.kick_user_id, username: m.username, rank_idx: v }, ar ? 'تم تغيير الرتبة' : 'Rank changed'));
                }}>{ar ? 'تطبيق' : 'Apply'}</Btn>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 p-3">
              <p className="text-xs font-black text-white mb-2">⏱ {ar ? 'تايم آوت (يوقف النقاط — حتى للمشرفين)' : 'Timeout (stops points — even mods)'}</p>
              <div className="flex gap-2">
                {['1', '5', '15', '60'].map((v) => (
                  <button key={v} type="button" onClick={() => setMuteMin(v)}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs font-black border ${muteMin === v ? 'border-red-400/60 bg-red-500/15 text-red-200' : 'border-white/10 bg-white/[0.04] text-white/55'}`} dir="ltr">{v}m</button>
                ))}
                <input value={muteMin} onChange={(e) => setMuteMin(e.target.value.replace(/[^0-9]/g, ''))}
                  dir="ltr" inputMode="numeric" placeholder="min" className={`${inputCls} w-20 text-center`} />
              </div>
              <div className="mt-2 flex gap-2">
                <Btn disabled={busy} tone="red" onClick={() => void after(run('user_mute', { user_id: m.kick_user_id, username: m.username, minutes: Number(muteMin) || 1 }, ar ? 'تم التايم آوت' : 'Muted'))}>
                  ⏱ {ar ? 'تايم آوت' : 'Timeout'}
                </Btn>
                <Btn disabled={busy} tone="ghost" onClick={() => void after(run('user_unmute', { user_id: m.kick_user_id }, ar ? 'تم فك الكتم' : 'Unmuted'))}>
                  {ar ? 'فك الكتم' : 'Unmute'}
                </Btn>
              </div>
              <p className="text-xs font-black text-white mt-3 mb-2">⚡ {ar ? 'تعزيز / عقوبة' : 'Boost / punish'}</p>
              <div className="flex gap-2">
                <select value={boostMult} onChange={(e) => setBoostMult(e.target.value)} className={`${inputCls} flex-1`} dir="ltr">
                  <option value="3">×3 {ar ? 'تربل' : 'triple'}</option>
                  <option value="2">×2 {ar ? 'دبل' : 'double'}</option>
                  <option value="0.5">×0.5 {ar ? 'نصف نقطة' : 'half'}</option>
                  <option value="0">0 🧊 {ar ? 'تجميد' : 'freeze'}</option>
                </select>
                <input value={boostMin} onChange={(e) => setBoostMin(e.target.value.replace(/[^0-9]/g, ''))}
                  dir="ltr" inputMode="numeric" placeholder="min" className={`${inputCls} w-20 text-center`} />
              </div>
              <div className="mt-2 flex gap-2">
                <Btn disabled={busy} tone="gold" onClick={() => void after(run('user_boost', { user_id: m.kick_user_id, username: m.username, mult: Number(boostMult), minutes: Number(boostMin) || 10 }, ar ? 'تم التطبيق' : 'Applied'))}>
                  {ar ? 'تطبيق' : 'Apply'}
                </Btn>
                <Btn disabled={busy} tone="ghost" onClick={() => void after(run('user_boost_clear', { user_id: m.kick_user_id }, ar ? 'تمت الإزالة' : 'Cleared'))}>
                  {ar ? 'إزالة' : 'Clear'}
                </Btn>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black text-white">🚨 {ar ? 'المكتومين والمعززين الآن' : 'Active mutes & boosts'}</h4>
          <button onClick={() => void loadMods()} className="text-[11px] font-black text-[#C9A24B]">↻</button>
        </div>
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {mods.filter((x) => x.muted || x.boosted).length === 0 && <p className="text-[11px] text-white/35">{ar ? 'لا يوجد أحد' : 'Nobody'}</p>}
          {mods.filter((x) => x.muted || x.boosted).map((x) => (
            <div key={`${x.kick_user_id}`} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2">
              <p className="flex-1 truncate text-xs font-black text-white" dir="ltr">{x.username}</p>
              {x.muted && <span className="text-[10px] font-black text-red-300" dir="ltr">⏱ {fmtLeft(new Date(x.mute_until).getTime() - now, ar)}</span>}
              {x.boosted && <span className="text-[10px] font-black text-amber-300" dir="ltr">×{x.multiplier}</span>}
              {x.muted && <button onClick={() => void after(run('user_unmute', { user_id: x.kick_user_id }, ar ? 'تم' : 'OK'))} className="text-[10px] font-black text-emerald-300 underline">{ar ? 'فك' : 'free'}</button>}
              {x.boosted && <button onClick={() => void after(run('user_boost_clear', { user_id: x.kick_user_id }, ar ? 'تم' : 'OK'))} className="text-[10px] font-black text-emerald-300 underline">{ar ? 'إزالة' : 'clear'}</button>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

/* ── الفعاليات العامة ───────────────────────────────────────── */
const EventsTab: React.FC<{ ar: boolean; now: number; ev: any; busy: boolean; run: RunFn }> = ({ ar, now, ev, busy, run }) => {
  const [minutes, setMinutes] = useState('10');
  const [customMult, setCustomMult] = useState('2');
  const presets = [
    { kind: 'double', mult: 2, icon: '🔥', label: ar ? 'الدبل ×2' : 'Double ×2' },
    { kind: 'triple', mult: 3, icon: '⚡', label: ar ? 'التربل ×3' : 'Triple ×3' },
    { kind: 'sabotage', mult: 0.5, icon: '💔', label: ar ? 'التخريب ×0.5' : 'Sabotage ×0.5' },
  ];
  return (
    <div className="flex flex-col gap-4">
      {ev && (
        <Card>
          <p className="text-sm font-black text-white">{ev.label}</p>
          <p className="mt-1 text-2xl font-black text-red-300" dir="ltr">⏳ {fmtLeft(new Date(ev.ends_at).getTime() - now, ar)}</p>
          <div className="mt-3"><Btn tone="red" disabled={busy} onClick={() => void run('event_stop', {}, ar ? 'توقفت' : 'Stopped')}>{ar ? 'إيقاف الفعالية' : 'Stop event'}</Btn></div>
        </Card>
      )}
      <div className="grid sm:grid-cols-3 gap-2.5">
        {presets.map((p) => (
          <Card key={p.kind} className="text-center">
            <p className="text-3xl" aria-hidden="true">{p.icon}</p>
            <p className="mt-1 text-sm font-black text-white">{p.label}</p>
            <div className="mt-3"><Btn tone="gold" disabled={busy || !!ev} onClick={() => void run('event_start', { kind: p.kind, mult: p.mult, minutes: Number(minutes) || 10 }, ar ? 'بدأت الفعالية 🔥' : 'Event live')}>
              {ar ? 'تشغيل' : 'Start'}
            </Btn></div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label={ar ? 'المدة (دقائق)' : 'Minutes'}>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className={`${inputCls} w-28 text-center`} />
          </Field>
          <Field label={ar ? 'مضاعف مخصص (0.25 - 10)' : 'Custom mult (0.25 - 10)'}>
            <input value={customMult} onChange={(e) => setCustomMult(e.target.value.replace(/[^0-9.]/g, ''))} dir="ltr" inputMode="decimal" className={`${inputCls} w-28 text-center`} />
          </Field>
          <Btn tone="gold" disabled={busy || !!ev} onClick={() => void run('event_start', { kind: 'custom', mult: Number(customMult) || 2, minutes: Number(minutes) || 10 }, ar ? 'بدأت' : 'Started')}>
            ⚡ {ar ? 'فعالية مخصصة' : 'Custom event'}
          </Btn>
        </div>
        <p className="mt-2 text-[10px] text-white/35 font-bold">{ar ? 'الفعالية تضرب نقاط الجميع — وتتراكم مع تعزيز الشخص نفسه.' : 'Events multiply everyone — stacking with personal boosts.'}</p>
      </Card>
    </div>
  );
};

/* ── أكواد النقاط المخفية ───────────────────────────────────── */
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
    <div className="flex flex-col gap-4">
      {drop ? (
        <Card>
          <p className="text-sm font-black text-white">🎁 {ar ? 'كود نشط الآن' : 'Drop is live'} — <span className="text-emerald-300" dir="ltr">{status ? `${status.claims} claimed / ${status.users} users` : '…'}</span></p>
          <p className="mt-1 text-2xl font-black text-emerald-300" dir="ltr">⏳ {fmtLeft(new Date(drop.ends_at).getTime() - now, ar)}</p>
          <div className="mt-3"><Btn tone="red" disabled={busy} onClick={() => void run('drop_stop', {}, ar ? 'توقف' : 'Stopped')}>{ar ? 'إيقاف الكود' : 'Stop drop'}</Btn></div>
        </Card>
      ) : (
        <Card>
          <h4 className="text-sm font-black text-white">🎁 {ar ? 'كود نقاط مخفي جديد' : 'New hidden drop'}</h4>
          <p className="mt-1 text-[11px] text-white/40 font-bold">{ar ? 'تحط كلمة سرية، أول من يكتبها في الشات ياخذ النقاط — وأنت تحدد الكمية والحد لكل شخص والمدة.' : 'Set a secret word — chatters who type it earn points. You set amount, per-user limit and duration.'}</p>
          <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
            <Field label={ar ? 'الكلمة السرية' : 'Secret word'}>
              <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={24} dir="auto" className={inputCls} placeholder="…" />
            </Field>
            <Field label={ar ? 'النقاط لكل استلام' : 'Points per claim'}>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className={inputCls} />
            </Field>
            <Field label={ar ? 'الحد لكل شخص' : 'Max per user'}>
              <input value={perMax} onChange={(e) => setPerMax(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className={inputCls} />
            </Field>
            <Field label={ar ? 'المدة (دقائق)' : 'Minutes'}>
              <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} dir="ltr" inputMode="numeric" className={inputCls} />
            </Field>
          </div>
          <div className="mt-3">
            <Btn tone="gold" disabled={busy || word.trim().length < 2}
              onClick={() => { void run('drop_start', { word: word.trim(), amount: Number(amount) || 10, per_max: Number(perMax) || 1, minutes: Number(minutes) || 10 }, ar ? 'بدأ الكود 🎁' : 'Drop live'); setWord(''); }}>
              🚀 {ar ? 'بدء الفعالية' : 'Launch drop'}
            </Btn>
          </div>
        </Card>
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

  if (loading) return <p className="text-center text-white/40 text-sm">…</p>;

  return (
    <Card>
      <h4 className="text-sm font-black text-white">🎖️ {ar ? 'أسعار الرتب (تتحدث عند الكل فوراً: البوت + الموقع)' : 'Rank prices (live everywhere)'}</h4>
      <div className="mt-3 space-y-1.5 max-h-[420px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {ranks.map((r) => (
          <div key={r.idx} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2">
            <span className="text-lg w-8 text-center" aria-hidden="true">{r.emoji}</span>
            <p className="flex-1 text-xs font-black text-white truncate" dir="auto">{ar ? r.name_ar : r.name_en}</p>
            <input value={vals[r.idx] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [r.idx]: e.target.value.replace(/[^0-9]/g, '') }))}
              dir="ltr" inputMode="numeric" className={`${inputCls} w-28 text-center`} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Btn tone="gold" disabled={busy} onClick={() => void run('ranks_set', {
          items: ranks.map((r) => ({ idx: r.idx, min_points: Number(vals[r.idx] ?? r.min_points) })),
        }, ar ? 'تم حفظ الأسعار وتحديث الجميع' : 'Prices saved')}>
          💾 {ar ? 'حفظ (لازم تصاعدي)' : 'Save (must ascend)'}
        </Btn>
      </div>
    </Card>
  );
};

/* ── السجل ──────────────────────────────────────────────────── */
const LogTab: React.FC<{ ar: boolean; data: any; reload: () => Promise<void> }> = ({ ar, reload }) => {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const j = await callAdmin('audit_list');
        setItems(j.items ?? []);
      } catch { /* ignore */ }
    })();
  }, [reload]);
  return (
    <Card>
      <h4 className="text-sm font-black text-white">📜 {ar ? 'سجل العمليات (آخر 50)' : 'Audit log (last 50)'}</h4>
      <div className="mt-2 space-y-1.5 max-h-[420px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {items.length === 0 && <p className="text-[11px] text-white/35">—</p>}
        {items.map((a: any, i: number) => (
          <div key={i} className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2">
            <p className="text-[11px] font-black text-[#C9A24B]" dir="auto">{a.action}</p>
            <p className="text-[10px] text-white/40 font-bold" dir="ltr">{new Date(a.created_at).toLocaleString()}</p>
            {a.detail && Object.keys(a.detail).length > 0 && (
              <p className="text-[10px] text-white/55 font-bold truncate" dir="auto">{JSON.stringify(a.detail)}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default AdminDashboard;
