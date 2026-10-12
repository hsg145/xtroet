/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  تحدي رايس — واجهة الأدمن
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  شخص واحد ضد الشات كله. الأدمن يتحكم بكل شي من هنا، والبوت يعلن وينفّذ.
 *
 *    running    → شغّال. النقود تعدّ وقت البث. ما في زر جمع بعد.
 *    collecting → انتهى. البوت أعلن كلمة عشوائية والناس تكتبها.
 *                 عدّاد «سجّل» يتحدث لحاله كل ثانيتين.
 *    done       → انطبقت المكافأة/العقاب. خلص.
 *
 *  منطق النقاط نفسه مو هنا: التوزيع والتربل والتخريب تنفّذهم دالة في القاعدة
 *  (apply_challenge_reward) مع قفل يمنع التكرار لو ضغطنا الزر مرتين.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { callAdmin } from './adminApi';
import { Ic, type IconName } from './AdminIcons';

const GOLD = '#D4AF37';
const GOLD_LT = '#F5DE84';
const GOLD_DK = '#9E7C21';
const EMERALD = '#10B981';
const BLOOD = '#DC2626';

type Status = 'running' | 'collecting' | 'done' | 'cancelled';
type Winner = 'challenger' | 'chat' | null;

interface Challenge {
  id: number;
  challenger: string;
  title: string;
  status: Status;
  winner: Winner;
  keyword: string | null;
  /** لو الشات كسب. */
  chat_reward_kind: ChatReward;
  chat_reward_amount: number;
  chat_reward_minutes: number;
  /** لو ناصر كسب. */
  penalty_kind: Penalty;
  penalty_minutes: number;
  started_at: string;
  ended_at: string | null;
  applied_at: string | null;
}

type ChatReward = 'none' | 'distribute' | 'double';
type Penalty = 'none' | 'sabotage';

interface Entry {
  kick_user_id: number;
  username: string;
  collected_at: string;
}

/**
 * اسم المتحدي ثابت ما يتغيّر.
 *
 * كان فيه خانة input، بس كانت تمسح الحروف العربية أثناء الكتابة
 * (`replace(/[^A-Za-z0-9_.]/g,'')`) — تكتب "ناصر" فيطلع الحقل فاضي والزر
 * يضل معطّل. فثبتّ الاسم بدل ما أخلي المستخدم يكتب شي ما يتغيّر.
 */
const CHALLENGER = 'ناصر';

const nf = (n: number) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* ── الأنماط (نفس لغة اللوحة: ذهبي على أسود) ───────────────── */

const CSS = `
.ch-card{position:relative;overflow:hidden}
.ch-card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 80% at 50% -20%,rgba(212,175,55,.14),transparent 60%)}
.ch-vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem}
.ch-side{position:relative;padding:1.15rem .9rem;border-radius:1.15rem;text-align:center;
  border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);
  transition:transform .35s cubic-bezier(.16,1,.3,1),border-color .35s,box-shadow .35s}
.ch-side.win{border-color:${GOLD}AA;background:linear-gradient(180deg,rgba(212,175,55,.16),rgba(212,175,55,.04));
  box-shadow:0 0 0 1px ${GOLD}33,0 18px 44px -22px ${GOLD}99}
.ch-side.lose{opacity:.42;filter:grayscale(.55)}
.ch-vs-badge{font-size:1.55rem;line-height:1;filter:drop-shadow(0 3px 10px rgba(0,0,0,.7));
  animation:chPulse 2.4s ease-in-out infinite}
@keyframes chPulse{0%,100%{transform:scale(1);opacity:.92}50%{transform:scale(1.12);opacity:1}}
.ch-key{display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 1.35rem;border-radius:1rem;
  font-weight:900;font-size:1.35rem;letter-spacing:.02em;direction:ltr;
  background:linear-gradient(180deg,${GOLD_LT},${GOLD} 55%,${GOLD_DK});color:#0B0906;
  box-shadow:0 14px 40px -12px ${GOLD}CC,inset 0 1px 0 rgba(255,255,255,.4);
  animation:chGlow 1.8s ease-in-out infinite}
@keyframes chGlow{0%,100%{box-shadow:0 14px 40px -14px ${GOLD}AA,inset 0 1px 0 rgba(255,255,255,.4)}
  50%{box-shadow:0 16px 52px -10px ${GOLD}EE,inset 0 1px 0 rgba(255,255,255,.5)}}
.ch-count{font-size:3rem;font-weight:900;line-height:1;direction:ltr;
  background:linear-gradient(180deg,#fff,${GOLD});-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;filter:drop-shadow(0 6px 18px rgba(212,175,55,.35))}
.ch-pop{animation:chPop .45s cubic-bezier(.16,1,.3,1)}
@keyframes chPop{0%{transform:scale(.82);opacity:.2}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
.ch-list{display:flex;flex-direction:column;gap:.4rem;max-height:330px;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:rgba(212,175,55,.35) transparent}
.ch-list::-webkit-scrollbar{width:6px}
.ch-list::-webkit-scrollbar-thumb{background:rgba(212,175,55,.35);border-radius:99px}
.ch-chip{display:flex;align-items:center;gap:.55rem;padding:.5rem .7rem;border-radius:.8rem;
  background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);
  font-size:12px;font-weight:700;animation:chRow .35s ease both}
@keyframes chRow{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.ch-bar{height:5px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.ch-bar>i{display:block;height:100%;border-radius:99px;
  background:linear-gradient(90deg,${GOLD_DK},${GOLD},${GOLD_LT});transition:width .5s ease}
.ch-opt{position:relative;padding:.85rem .95rem;border-radius:1rem;cursor:pointer;text-align:start;
  border:1.5px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);
  transition:all .28s cubic-bezier(.16,1,.3,1)}
.ch-opt:hover{transform:translateY(-2px);border-color:rgba(212,175,55,.45)}
.ch-opt.on{border-color:${GOLD};background:linear-gradient(180deg,rgba(212,175,55,.17),rgba(212,175,55,.04));
  box-shadow:0 12px 34px -18px ${GOLD}AA}
.ch-opt.on::after{content:"✓";position:absolute;top:.5rem;inset-inline-end:.7rem;font-weight:900;color:${GOLD}}
.ch-inp{width:100%;padding:.65rem .85rem;border-radius:.85rem;font-weight:700;font-size:14px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);color:#fff;outline:none;
  transition:border-color .25s,box-shadow .25s}
.ch-inp:focus{border-color:${GOLD};box-shadow:0 0 0 3px ${GOLD}2E}
.ch-step{display:flex;align-items:center;gap:.55rem;font-size:11px;font-weight:900;
  letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.ch-step.on{color:${GOLD}}
.ch-step.done{color:${EMERALD}}
`;

/* ── القسم الصغير ──────────────────────────────────────────── */

const Sec: React.FC<{ title: string; icon: IconName; children: React.ReactNode; tone?: string; step?: string; state?: 'todo' | 'on' | 'done' }> = ({
  title, icon, children, tone = GOLD, state,
}) => (
  <section className="ch-card adm-in rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
    <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${tone}88,transparent)` }} aria-hidden="true" />
    <div className={`ch-step ${state === 'on' ? 'on' : state === 'done' ? 'done' : ''}`}>
      <span className="adm-ico" style={{ width: 26, height: 26, borderRadius: 9 }}><Ic n={icon} size={14} /></span>
      <span className="ch-bar flex-1" style={{ maxWidth: 34 }}>
        <i style={{ width: state === 'done' ? '100%' : state === 'on' ? '55%' : '0%' }} />
      </span>
      {title}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

/* ── التبويب ────────────────────────────────────────────────── */

export const ChallengeTab: React.FC<{ ar: boolean; now: number; busy: boolean }> = ({ ar, now, busy }) => {
  const [ch, setCh] = useState<Challenge | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [count, setCount] = useState(0);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('25');
  const [minutes, setMinutes] = useState('30');
  const [penaltyMinutes, setPenaltyMinutes] = useState('30');
  const [chatReward, setChatReward] = useState<ChatReward>('distribute');
  const [penalty, setPenalty] = useState<Penalty>('none');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * الفعاليات المكتملة اللي ضغطنا "تحدٍ جديد" بعدها.
   *
   * من غيرها، الاستطلاع كل ٨ ثواني يجيب آخر فعالية من القاعدة — وهي
   * نفسها المكتملة — ويرجّعك لشاشة "انتهى" بدل ما يوريك نموذج الإنشاء.
   * فنتجاهلها لحد ما تبدأ واحدة جديدة فعلاً.
   */
  const dismissed = useRef<Set<number>>(new Set());
  const timer = useRef<number | null>(null);

  const say = useCallback((ok: boolean, text: string) => {
    setFlash({ ok, text });
    window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await callAdmin('challenge_get');
      const c = j.challenge ?? null;
      // فعالية مكتملة رفضنا نعرضها = ما في شي نعرضه، نبيّن نموذج الإنشاء.
      const finished = c?.status === 'done' || c?.status === 'cancelled';
      const hide = c !== null && finished && dismissed.current.has(c.id);

      setCh(hide ? null : c);
      setEntries(hide ? [] : Array.isArray(j.entries) ? j.entries : []);
      setCount(hide ? 0 : Number(j.count) || 0);
      setLoadError(null);
    } catch (e: any) {
      // ما نبلع الخطأ. لو الـ migration ناقصة، المستخدم لازم يشوف السبب
      // بدل ما يظن إن ما في فعالية أصلاً.
      const d = e?.data;
      if (String(e?.message) === 'unauthorized') {
        sessionStorage.removeItem('xtr_admin_token');
        sessionStorage.removeItem('xtr_admin_exp');
        location.reload();
        return;
      }
      setLoadError(d?.detail || d?.error || 'ما قدرنا نوصل للقاعدة');
    }
  }, []);

  /* تحدٍ في الجمع: تحديث كل ثانيتين — العدّاد لازم يقفز مع الشات.
     ما في نسخة نشطة: 15 ثانية تكفي، أقل ما نضغط على القاعدة بلا داعي. */
  useEffect(() => {
    void load();
    const live = ch?.status === 'collecting';
    const busy = ch?.status === 'running' || live;
    timer.current = window.setInterval(() => void load(), live ? 2000 : busy ? 8000 : 15_000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load, ch?.status]);

  const act = async (action: string, params: Record<string, unknown>, okText: string) => {
    setSaving(true);
    try {
      await callAdmin(action, params);
      say(true, okText);
      await load();
    } catch (e: any) {
      const code = e?.data?.error;
      const map: Record<string, string> = {
        challenge_already_running: ar ? 'في فعالية شغّالة حالياً — أوقفها الأول' : 'An activity is already running',
        bad_title: ar ? 'اكتب اسم الفعالية (حرفين على الأقل)' : 'Type an activity name (2 chars minimum)',
        bad_challenger: ar ? 'اسم المتحدي لازم 2–24 حرف' : 'Challenger must be 2–24 chars',
        bad_chat_reward: ar ? 'خيار الجائزة مو صحيح' : 'Invalid chat reward',
        bad_penalty: ar ? 'خيار العقاب مو صحيح' : 'Invalid penalty',
        need_amount: ar ? 'حدّد كم نقطة للتوزيع' : 'Set the points to distribute',
        need_minutes: ar ? 'حدّد المدة بالدقائق' : 'Set a duration in minutes',
        bad_amount: ar ? 'رقم النقاط مو صحيح' : 'Invalid point amount',
        bad_minutes: ar ? 'المدة لازم بين 1 و 10080 دقيقة' : 'Duration must be 1–10080 minutes',
        not_running: ar ? 'الفعالية مو شغّالة' : 'The activity is not running',
        not_collecting: ar ? 'مو في مرحلة جمع الكلمة' : 'Not in the collecting phase',
        not_active: ar ? 'الفعالية خلصت' : 'Already finished',
        already_decided: ar ? 'الفعالية مقفلة — القرار نهائي' : 'Locked — the decision is final',
        not_found: ar ? 'ما لقينا الفعالية' : 'Activity not found',
        db_error: ar ? 'خطأ قاعدة البيانات' : 'Database error',
      };
      // لو الكود مو معروف، ورّيه ما قالته القاعدة بدل "فشلت العملية" —
      // هذا اللي خلّى زر الإلغاء يبان فاشل بلا سبب.
      say(false, map[code] || e?.data?.detail || code || (ar ? 'فشلت العملية' : 'Action failed'));
    } finally {
      setSaving(false);
    }
  };

  const status = ch?.status ?? null;
  const winner = ch?.winner ?? null;
  const collecting = status === 'collecting';
  const running = status === 'running';
  const finished = status === 'done' || status === 'cancelled';

  // ما نقدر نبدأ قبل ما كل اختيار يكون مكتمل — ونمنع طلب ناقص من أصله.
  const canStart =
    [...title.trim()].length >= 2 &&
    (chatReward !== 'distribute' || Number(amount) >= 1) &&
    (chatReward !== 'double' || Number(minutes) >= 1) &&
    (penalty !== 'sabotage' || Number(penaltyMinutes) >= 1);

  const start = () =>
    act('challenge_create', {
      title: title.trim(),
      challenger: CHALLENGER,
      chat_reward_kind: chatReward,
      chat_reward_amount: Number(amount) || 0,
      chat_reward_minutes: Number(minutes) || 0,
      penalty_kind: penalty,
      penalty_minutes: Number(penaltyMinutes) || 0,
    }, ar ? 'بدأت الفعالية!' : 'Activity started!');

  /**
   * اختيار الفائز. القرار نهائي — فنسأل مرة قبل ما نثبّته، وبعدها ما فيه
   * رجعة: القفل يصير في القاعدة نفسها (challenge_end ترفض أي status غير
   * running، وchallenge_cancel ترفض بعد ما يتسجّل winner).
   */
  const [confirmWinner, setConfirmWinner] = useState<Winner>(null);
  const decide = (w: Exclude<Winner, null>) => setConfirmWinner(w);
  const commitWinner = async () => {
    const w = confirmWinner;
    setConfirmWinner(null);
    if (!w || !ch) return;
    await act('challenge_end', { id: ch.id, winner: w },
      w === 'chat' ? (ar ? 'كسب الشات — الكلمة السرية جاية!' : 'The chat won!') : (ar ? 'كسب ناصر — الكلمة السرية جاية!' : 'Nasser won!'));
  };

  return (
    <div className="grid gap-4">
      <style>{CSS}</style>

      {loadError && (
        <div className="adm-card adm-in rounded-3xl p-5 border"
          style={{ background: 'rgba(220,38,38,.12)', borderColor: 'rgba(220,38,38,.45)' }}>
          <p className="text-sm font-black text-red-300">
            {ar ? 'ما قدرنا نقرأ التحدي من القاعدة' : 'Could not read the challenge from the database'}
          </p>
          <p className="mt-1.5 text-[12px] text-white/60" dir="auto">{loadError}</p>
        </div>
      )}

      {/* العنوان */}
      <div className="adm-card adm-in ch-card rounded-3xl p-5 sm:p-6 border border-white/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
              <span className="adm-ico" style={{ width: 36, height: 36, borderRadius: 12 }}><Ic n="swords" size={19} /></span>
              {ch?.title?.trim() || (ar ? 'تحدي رايس' : 'Raees Challenge')}
            </h2>
            <p className="mt-1 text-[12px] text-white/45">
              {ar ? 'شخص واحد ضد الشات كله — أنت تقرر كل شي من هنا' : 'One person against the whole chat — you control everything from here'}
            </p>
          </div>
          {status && (
            <span className="px-3 py-1.5 rounded-xl text-[11px] font-black"
              style={{
                background: running ? 'rgba(212,175,55,.16)' : collecting ? 'rgba(16,185,129,.16)' : 'rgba(255,255,255,.07)',
                color: running ? GOLD : collecting ? EMERALD : 'rgba(255,255,255,.5)',
                border: `1px solid ${running ? `${GOLD}55` : collecting ? `${EMERALD}55` : 'rgba(255,255,255,.12)'}`,
              }}>
              {running ? (ar ? 'شغّال' : 'RUNNING')
                : collecting ? (ar ? 'وقت الكلمة' : 'COLLECTING')
                : status === 'done' ? (ar ? 'خلص' : 'DONE') : (ar ? 'ملغي' : 'CANCELLED')}
            </span>
          )}
        </div>

        {flash && (
          <div className="mt-4 rounded-2xl px-4 py-3 text-[13px] font-black ch-pop flex items-center gap-2"
            style={{
              background: flash.ok ? 'rgba(16,185,129,.14)' : 'rgba(220,38,38,.14)',
              color: flash.ok ? '#A7F3D0' : '#FCA5A5',
              border: `1px solid ${flash.ok ? 'rgba(16,185,129,.4)' : 'rgba(220,38,38,.4)'}`,
            }}>
            <Ic n={flash.ok ? 'check' : 'alert'} size={16} />
            {flash.text}
          </div>
        )}
      </div>

      {/* سجل بسيط */}
      <p className="text-[11px] text-white/35 text-center -mt-1">
        {ar ? 'النقاط تُحتسب وقت البث فقط — شوف قسم "نقاط البث"' : 'Points only count during a live broadcast'}
      </p>

      {/* ── ما في فعالية: الإنشاء ── */}
      {!ch && (
        <div className="grid gap-4">
          {/* 1) الاسم */}
          <Sec title={ar ? 'اسم الفعالية' : 'Activity name'} icon="tag" state="on" tone={GOLD}>
            <input className="ch-inp" dir="auto" value={title} maxLength={60} autoComplete="off"
              placeholder={ar ? 'مثلاً: كأس التفاعل' : 'e.g. Interaction Cup'}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canStart && !saving) void start();
              }} />
            <div className="mt-3 flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: 'rgba(212,175,55,.10)', border: '1px solid rgba(212,175,55,.34)' }}>
              <span className="adm-ico" style={{ width: 40, height: 40, borderRadius: 13 }}><Ic n="crown" size={21} /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                  {ar ? 'المتحدي' : 'Challenger'}
                </p>
                <p className="truncate text-sm font-black text-white" dir="rtl">{CHALLENGER}</p>
              </div>
            </div>
          </Sec>

          {/* 2) الجوائز والعقوبات — تتحدد قبل ما تبدأ */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Sec title={ar ? 'لو الشات كسب' : 'If the chat wins'} icon="gift" state="on" tone={EMERALD}>
              <div className="grid gap-2">
                {([
                  { id: 'distribute' as ChatReward, icon: 'gift' as const, label: ar ? 'توزيع نقاط' : 'Distribute points' },
                  { id: 'double' as ChatReward, icon: 'zap' as const, label: ar ? 'تربل — نقاط مضاعفة' : 'Double points' },
                  { id: 'none' as ChatReward, icon: 'none' as const, label: ar ? 'ما في جائزة' : 'No reward' },
                ]).map((o) => (
                  <button key={o.id} className={`ch-opt ${chatReward === o.id ? 'on' : ''}`}
                    onClick={() => setChatReward(o.id)}>
                    <span className="adm-ico" style={{ width: 32, height: 32, borderRadius: 10 }}><Ic n={o.icon} size={16} /></span>
                    <p className="mt-1.5 text-[12px] font-black">{o.label}</p>
                  </button>
                ))}
              </div>

              {chatReward === 'distribute' && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {ar ? 'نقاط لكل واحد' : 'Points each'}
                  </span>
                  <input className="ch-inp" dir="ltr" type="number" min={1} max={1000000} value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
                </label>
              )}

              {chatReward === 'double' && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {ar ? 'المدة بالدقائق' : 'Duration (minutes)'}
                  </span>
                  <input className="ch-inp" dir="ltr" type="number" min={1} max={10080} value={minutes}
                    onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} />
                </label>
              )}
            </Sec>

            <Sec title={ar ? 'لو ناصر كسب' : 'If Nasser wins'} icon="swords" state="on" tone={BLOOD}>
              <div className="grid gap-2">
                {([
                  { id: 'sabotage' as Penalty, icon: 'trendDown' as const, label: ar ? 'تخريب — نص نقطة' : 'Sabotage — half a point' },
                  { id: 'none' as Penalty, icon: 'none' as const, label: ar ? 'ما في عقاب' : 'No penalty' },
                ]).map((o) => (
                  <button key={o.id} className={`ch-opt ${penalty === o.id ? 'on' : ''}`}
                    onClick={() => setPenalty(o.id)}>
                    <span className="adm-ico" style={{ width: 32, height: 32, borderRadius: 10 }}><Ic n={o.icon} size={16} /></span>
                    <p className="mt-1.5 text-[12px] font-black">{o.label}</p>
                  </button>
                ))}
              </div>

              {penalty === 'sabotage' && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {ar ? 'مدة العقاب بالدقائق' : 'Penalty duration (minutes)'}
                  </span>
                  <input className="ch-inp" dir="ltr" type="number" min={1} max={10080} value={penaltyMinutes}
                    onChange={(e) => setPenaltyMinutes(e.target.value.replace(/[^0-9]/g, ''))} />
                  <span className="mt-1.5 block text-[11px] text-white/35">
                    {ar ? 'كل رسالة صارت نص نقطة ×0.5 بدل نقطة كاملة' : 'Each message counts 0.5 instead of 1'}
                  </span>
                </label>
              )}
            </Sec>
          </div>

          <button className="adm-btn w-full rounded-2xl py-4 text-[15px] font-black inline-flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
            disabled={!canStart || saving}
            onClick={() => void start()}>
            {saving ? (ar ? 'جاري…' : '…') : (<><Ic n="swords" size={16} /> {ar ? 'ابدأ الفعالية' : 'Start the activity'}</>)}
          </button>

          <p className="text-center text-[11px] text-white/35">
            {ar ? 'البوت بيعلنها بالشات فوراً، وبيختار كلمة سرية ما تشوفها إلا لما توقفها.'
              : 'The bot announces it in chat instantly and picks a secret keyword you only see when it ends.'}
          </p>
        </div>
      )}

      {/* ── تحدي جارٍ ── */}
      {ch && !finished && (
        <>
          {/* لوح المتنافسين */}
          <Sec title={ar ? 'المتنافسان' : 'The contenders'} icon="swords" state="on" tone={GOLD}>
            <div className="ch-vs">
              <div className={`ch-side ${winner === 'challenger' ? 'win' : winner === 'chat' ? 'lose' : ''}`}>
                <div className="ch-vs-badge flex justify-center" aria-hidden="true"><span className="adm-ico" style={{ width: 44, height: 44, borderRadius: 14 }}><Ic n="crown" size={22} /></span></div>
                <p className="mt-2 text-sm font-black" dir="ltr">@{ch.challenger}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-white/40">
                  {ar ? 'المتحدي' : 'Challenger'}
                </p>
              </div>

              <div className="text-2xl font-black text-white/25" aria-hidden="true">VS</div>

              <div className={`ch-side ${winner === 'chat' ? 'win' : winner === 'challenger' ? 'lose' : ''}`}>
                <div className="ch-vs-badge flex justify-center" aria-hidden="true"><span className="adm-ico" style={{ width: 44, height: 44, borderRadius: 14 }}><Ic n="users" size={22} /></span></div>
                <p className="mt-2 text-sm font-black">{ar ? 'الشات كله' : 'The whole chat'}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-white/40">
                  {ar ? 'الخصم' : 'The chat'}
                </p>
              </div>
            </div>

            {running && (
              <p className="mt-4 text-center text-[12px] text-white/45">
                {ar ? 'النقاط تعدّ الآن. لمّا تخلص، اختر الفائز واضغط "أوقف".'
                  : 'Points are counting. When done, pick the winner and press End.'}
              </p>
            )}
          </Sec>

          {/* اختيار الفائز — القرار نهائي بمجرد الضغط، فنتأكد قبله */}
          {running && (
            <Sec title={ar ? 'من كسب؟' : 'Who won?'} icon="trophy" state="on" tone={GOLD}>
              <p className="mb-3 text-center text-[11px] font-black text-amber-300/80 flex items-center justify-center gap-1.5">
                <Ic n="alert" size={13} />
                {ar ? 'هذا القرار نهائي — ما بتقدر ترجع عنه بعد الضغط'
                  : 'Final — this cannot be undone once you press it'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="ch-opt" disabled={saving}
                  onClick={() => decide('challenger')}>
                  <span className="adm-ico" style={{ width: 36, height: 36, borderRadius: 12 }}><Ic n="crown" size={18} /></span>
                  <p className="mt-1.5 text-[13px] font-black">{ar ? 'ناصر كسب' : 'Nasser won'}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">
                    {ch.penalty_kind === 'sabotage'
                      ? ar ? `يطبق تخريب ×0.5 لمدة ${ch.penalty_minutes} دقيقة` : `sabotage ×0.5 for ${ch.penalty_minutes} min`
                      : (ar ? 'ما في عقاب' : 'no penalty')}
                  </p>
                </button>
                <button className="ch-opt" disabled={saving}
                  onClick={() => decide('chat')}>
                  <span className="adm-ico" style={{ width: 36, height: 36, borderRadius: 12 }}><Ic n="spark" size={18} /></span>
                  <p className="mt-1.5 text-[13px] font-black">{ar ? 'الشات كسب' : 'The chat won'}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">
                    {ch.chat_reward_kind === 'distribute'
                      ? ar ? `يوزع ${ch.chat_reward_amount} نقطة لكل واحد` : `${ch.chat_reward_amount} points each`
                      : ch.chat_reward_kind === 'double'
                        ? ar ? `تربل ×2 لمدة ${ch.chat_reward_minutes} دقيقة` : `double ×2 for ${ch.chat_reward_minutes} min`
                        : (ar ? 'ما في جائزة' : 'no reward')}
                  </p>
                </button>
              </div>
            </Sec>
          )}

          {/* مرحلة الكلمة */}
          {collecting && (
            <Sec title={ar ? 'الكلمة السرية' : 'The secret keyword'} icon="key" state="on" tone={EMERALD}>
              <div className="text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">
                  {ar ? 'كل واحد يكتب' : 'Everyone writes'}
                </p>
                <div className="my-3"><span className="ch-key">{ch.keyword ?? '…'}</span></div>
                <p className="ch-count ch-pop" key={count}>{nf(count)}</p>
                <p className="text-[11px] font-black uppercase tracking-wider text-white/40">
                  {ar ? 'سجّلوا' : 'collected'}
                </p>
              </div>

              <div className="ch-list mt-4 pe-1">
                {entries.length === 0 && (
                  <p className="py-6 text-center text-[12px] text-white/30 flex items-center justify-center gap-1.5">
                    <Ic n="pulse" size={13} />
                    {ar ? 'ما أحد كتب لسه… البوت شايف' : 'Nobody yet… the bot is watching'}
                  </p>
                )}
                {entries.map((e, i) => (
                  <div key={e.kick_user_id} className="ch-chip" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <span className="text-[10px] font-black text-white/25" dir="ltr">{i + 1}</span>
                    <span className="flex-1 truncate" dir="ltr">@{e.username}</span>
                    <span className="text-[10px] text-white/30" dir="ltr">
                      {new Date(e.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {/* التطبيق — الخيار انحدد وقت البداية، هنا بس ضغطة واحدة */}
          {collecting && (
            <Sec title={ar ? 'إنهاء وتطبيق' : 'Finish and apply'} icon="check" state="on" tone={GOLD}>
              <div className="rounded-2xl p-4 text-center"
                style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.09)' }}>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                  {winner === 'chat' ? (ar ? 'الشات كسب' : 'The chat won') : (ar ? 'ناصر كسب' : 'Nasser won')}
                </p>
                <p className="mt-1.5 text-lg font-black flex items-center justify-center gap-2">
                  <Ic n={winner === 'chat' ? (ch.chat_reward_kind === 'distribute' ? 'gift' : ch.chat_reward_kind === 'double' ? 'zap' : 'none') : (ch.penalty_kind === 'sabotage' ? 'trendDown' : 'none')} size={20} />
                  {winner === 'chat'
                    ? ch.chat_reward_kind === 'distribute' ? `${ch.chat_reward_amount} نقطة لكل واحد`
                      : ch.chat_reward_kind === 'double' ? `تربل ×2 لمدة ${ch.chat_reward_minutes} دقيقة`
                        : 'ما في جائزة'
                    : ch.penalty_kind === 'sabotage' ? `تخريب ×0.5 لمدة ${ch.penalty_minutes} دقيقة`
                      : 'ما في عقاب'}
                </p>
                <p className="mt-1 text-[11px] text-white/35">
                  {ar ? 'انتصف على كل من كتب الكلمة' : 'applies to everyone who typed the keyword'}
                </p>
              </div>

              <button className="adm-btn mt-4 w-full rounded-2xl py-3.5 text-[14px] font-black inline-flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
                disabled={saving}
                onClick={() => void act('challenge_apply', { id: ch.id },
                  ar ? `انفّذ على ${count} واحد` : `Applied to ${count} people`)}>
                {saving ? (ar ? 'جاري…' : 'Working…') : (<><Ic n="check" size={16} /> {ar ? 'إيقاف وتطبيق' : 'Stop & apply'} ({nf(count)})</>)}
              </button>
            </Sec>
          )}
        </>
      )}

      {/* شريط القفل — يظهر بمجرد ما يتسجّل الفائز */}
      {collecting && winner && (
        <div className="adm-card adm-in rounded-3xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(16,185,129,.10)', border: '1px solid rgba(16,185,129,.38)' }}>
          <span className="adm-ico green" style={{ width: 38, height: 38, borderRadius: 12 }}><Ic n="lock" size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black text-emerald-300">
              {winner === 'chat' ? (ar ? 'النتيجة: الشات كسب' : 'Result: the chat won') : (ar ? 'النتيجة: ناصر كسب' : 'Result: Nasser won')}
            </p>
            <p className="mt-0.5 text-[11px] text-white/45">
              {ar ? 'الفعالية مقفلة — ما بينفع تلغيها أو ترجع عن القرار.' : 'Locked — this activity can no longer be cancelled or reversed.'}
            </p>
          </div>
        </div>
      )}

      {/* ── خلص ── */}
      {ch && finished && (
        <Sec title={ar ? 'انتهى التحدي' : 'Challenge finished'} icon="trophy" state="done" tone={ch.status === 'done' ? EMERALD : 'rgba(255,255,255,.4)'}>
          <div className="text-center py-4">
            <div className="flex justify-center"><span className="adm-ico green" style={{ width: 54, height: 54, borderRadius: 17 }}><Ic n={ch.status === 'done' ? 'trophy' : 'ban'} size={26} /></span></div>
            <p className="mt-2 text-sm font-black">
              {ch.status === 'cancelled'
                ? (ar ? 'أُلغي التحدي' : 'Challenge cancelled')
                : ch.winner === 'challenger'
                  ? (ar ? `كسب @${ch.challenger}` : `@${ch.challenger} won`)
                  : (ar ? 'كسب الشات' : 'The chat won')}
            </p>
            {ch.status === 'done' && count > 0 && (
              <p className="mt-1 text-[12px] text-white/45">
                {ch.winner === 'chat'
                  ? ch.chat_reward_kind === 'distribute'
                    ? ar ? `وُزّعت ${nf(ch.chat_reward_amount)} نقطة على ${nf(count)} واحد` : `${nf(ch.chat_reward_amount)} points to ${nf(count)} people`
                    : ch.chat_reward_kind === 'double'
                      ? ar ? 'تربل — نقاط مضاعفة' : 'Double points'
                      : (ar ? 'ما في جائزة' : 'No reward given')
                  : ch.penalty_kind === 'sabotage'
                    ? ar ? 'تخريب — نص نقطة على الرسالة' : 'Sabotage — half a point per message'
                    : (ar ? 'ما في عقاب' : 'No penalty')}
              </p>
            )}
          </div>
          <button className="adm-btn mt-2 w-full rounded-2xl py-3 text-[13px] font-black inline-flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
            onClick={() => {
              // لا تستدعِ load() هنا: هي رجّعنا لنفس الشاشة المكتملة.
              // نتجاهلها في الاستطلاع ونبيّن نموذج الإنشاء مباشرة.
              if (ch) dismissed.current.add(ch.id);
              setCh(null);
              setEntries([]);
              setCount(0);
              setTitle('');
            }}>
            <Ic n="swords" size={15} /> {ar ? 'ابدأ فعالية جديدة' : 'Start a new activity'}
          </button>
          {ch && (
            <button className="mt-2 w-full rounded-2xl py-2 text-[11px] font-black"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.10)', color: 'rgba(255,255,255,.45)' }}
              onClick={() => {
                dismissed.current.delete(ch.id);
                void load();
              }}>
              {ar ? 'ارجع لنتيجة آخر فعالية' : 'Back to the last result'}
            </button>
          )}
        </Sec>
      )}

      {/* نافذة تأكيد الفائز — القرار ما بينترجع */}
      {confirmWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)' }}
          onClick={() => setConfirmWinner(null)}>
          <div className="adm-card ch-card w-full max-w-sm rounded-3xl p-6 text-center ch-pop"
            style={{ border: '1px solid rgba(212,175,55,.45)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center"><span className="adm-ico" style={{ width: 58, height: 58, borderRadius: 19 }}><Ic n={confirmWinner === 'chat' ? 'spark' : 'crown'} size={28} /></span></div>
            <p className="mt-3 text-lg font-black">
              {confirmWinner === 'chat' ? (ar ? 'الشات كسب' : 'The chat won') : (ar ? 'ناصر كسب' : 'Nasser won')}
            </p>
            <p className="mt-2 text-[13px] text-white/55">
              {confirmWinner === 'chat'
                ? ch?.chat_reward_kind === 'distribute' ? ar ? `يتوزع ${ch.chat_reward_amount} نقطة على كل من كتب الكلمة` : `${ch.chat_reward_amount} points to everyone who typed it`
                  : ch?.chat_reward_kind === 'double' ? ar ? `تربل ×2 لمدة ${ch.chat_reward_minutes} دقيقة` : `double ×2 for ${ch.chat_reward_minutes} minutes`
                    : (ar ? 'ما في جائزة' : 'No reward')
                : ch?.penalty_kind === 'sabotage' ? ar ? `تخريب — نص نقطة ×0.5 لمدة ${ch.penalty_minutes} دقيقة` : `Sabotage — half a point for ${ch.penalty_minutes} minutes`
                  : (ar ? 'ما في عقاب' : 'No penalty')}
            </p>
            <p className="mt-3 rounded-xl px-3 py-2 text-[11px] font-black"
              style={{ background: 'rgba(220,38,38,.14)', color: '#FCA5A5' }}>
              {ar ? 'ما بتقدر ترجع عن هذا القرار' : 'This decision cannot be undone'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="adm-btn rounded-2xl py-3 text-[13px] font-black"
                style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#fff' }}
                onClick={() => setConfirmWinner(null)}>
                {ar ? 'تراجع' : 'Back'}
              </button>
              <button className="adm-btn rounded-2xl py-3 text-[13px] font-black"
                style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
                disabled={saving}
                onClick={() => void commitWinner()}>
                {saving ? '…' : ar ? 'أأكيد' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};