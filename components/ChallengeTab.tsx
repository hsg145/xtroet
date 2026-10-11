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

const GOLD = '#D4AF37';
const GOLD_LT = '#F5DE84';
const GOLD_DK = '#9E7C21';
const EMERALD = '#10B981';
const BLOOD = '#DC2626';

type Status = 'running' | 'collecting' | 'done' | 'cancelled';
type Winner = 'challenger' | 'chat' | null;
type RewardKind = 'none' | 'distribute' | 'double' | 'sabotage';

interface Challenge {
  id: number;
  challenger: string;
  status: Status;
  winner: Winner;
  keyword: string | null;
  reward_kind: RewardKind;
  reward_amount: number;
  reward_minutes: number;
  started_at: string;
  ended_at: string | null;
  applied_at: string | null;
}

interface Entry {
  kick_user_id: number;
  username: string;
  collected_at: string;
}

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

const Sec: React.FC<{ title: string; icon: string; children: React.ReactNode; tone?: string; step?: string; state?: 'todo' | 'on' | 'done' }> = ({
  title, icon, children, tone = GOLD, state,
}) => (
  <section className="ch-card adm-in rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
    <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${tone}88,transparent)` }} aria-hidden="true" />
    <div className={`ch-step ${state === 'on' ? 'on' : state === 'done' ? 'done' : ''}`}>
      <span aria-hidden="true">{icon}</span>
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
  const [challenger, setChallenger] = useState('');
  const [amount, setAmount] = useState('25');
  const [minutes, setMinutes] = useState('30');
  const [reward, setReward] = useState<RewardKind>('distribute');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const timer = useRef<number | null>(null);

  const say = useCallback((ok: boolean, text: string) => {
    setFlash({ ok, text });
    window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await callAdmin('challenge_get');
      setCh(j.challenge ?? null);
      setEntries(Array.isArray(j.entries) ? j.entries : []);
      const n = Number(j.count) || 0;
      // نخلي liveCount يساوي دائماً آخر عدد مقروء — الحركة تعتمد على
      // تغيّر القيمة، فخلّينا نحط الأرقام الصحيحة وما نعمل تقدير.
      setCount(n);
      setLiveCount(n);
    } catch {
      /* البوت لسّ ما قرأ القاعدة بعد، أو الشبكة تلعثمت — ننتظر */
    }
  }, []);

  /* تحدٍ في الجمع: تحديث كل ثانيتين — العدّاد لازم يقفز مع الشات. */
  useEffect(() => {
    void load();
    const live = ch?.status === 'collecting';
    timer.current = window.setInterval(() => void load(), live ? 2000 : 8000);
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
        challenge_already_running: ar ? 'في تحدٍ شغّال حالياً — أوقفه الأول' : 'A challenge is already running',
        bad_challenger: ar ? 'اسم المتحدي لازم 2–24 حرف' : 'Challenger must be 2–24 chars',
        need_amount: ar ? 'حدّد كم نقطة للتوزيع' : 'Set the points to distribute',
        need_minutes: ar ? 'حدّد المدة بالدقائق' : 'Set a duration in minutes',
        not_running: ar ? 'التحدي مو شغّال' : 'Challenge is not running',
        not_collecting: ar ? 'مو في مرحلة جمع' : 'Not in the collecting phase',
      };
      say(false, map[code] || (ar ? 'فشلت العملية' : 'Action failed'));
    } finally {
      setSaving(false);
    }
  };

  const status = ch?.status ?? null;
  const winner = ch?.winner ?? null;
  const collecting = status === 'collecting';
  const running = status === 'running';
  const finished = status === 'done' || status === 'cancelled';

  const REWARDS: Array<{ id: RewardKind; icon: string; ar: string; en: string; hint: string }> = [
    { id: 'none', icon: '😐', ar: 'ما في شيء', en: 'Nothing', hint: 'ما مكافأة ولا عقاب' },
    { id: 'distribute', icon: '🎁', ar: 'توزيع نقاط', en: 'Distribute', hint: `${amount || 0} نقطة لكل واحد` },
    { id: 'double', icon: '⚡', ar: 'تربل', en: 'Double', hint: 'نقاط مضاعفة ×2' },
    { id: 'sabotage', icon: '💥', ar: 'تخريب', en: 'Sabotage', hint: 'نصف نقطة ×0.5' },
  ];

  return (
    <div className="grid gap-4">
      <style>{CSS}</style>

      {/* العنوان */}
      <div className="adm-card adm-in ch-card rounded-3xl p-5 sm:p-6 border border-white/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
              <span aria-hidden="true">⚔️</span>
              {ar ? 'تحدي رايس' : 'Raees Challenge'}
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
          <div className="mt-4 rounded-2xl px-4 py-3 text-[13px] font-black ch-pop"
            style={{
              background: flash.ok ? 'rgba(16,185,129,.14)' : 'rgba(220,38,38,.14)',
              color: flash.ok ? '#A7F3D0' : '#FCA5A5',
              border: `1px solid ${flash.ok ? 'rgba(16,185,129,.4)' : 'rgba(220,38,38,.4)'}`,
            }}>
            {flash.text}
          </div>
        )}
      </div>

      {/* سجل بسيط */}
      <p className="text-[11px] text-white/35 text-center -mt-1">
        {ar ? 'النقاط تُحتسب وقت البث فقط — شوف قسم "نقاط البث"' : 'Points only count during a live broadcast'}
      </p>

      {/* ── ما في تحدٍ: إنشاء ── */}
      {!ch && (
        <Sec title={ar ? 'ابدأ تحدياً جديداً' : 'Start a challenge'} icon="🚀" state="on" tone={GOLD}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                {ar ? 'اسم المتحدي (ناصر / رايس)' : 'Challenger (username)'}
              </span>
              <input className="ch-inp" dir="ltr" value={challenger} maxLength={24} autoComplete="off"
                placeholder="xtroet"
                onChange={(e) => setChallenger(e.target.value.replace(/[^A-Za-z0-9_.]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && challenger.trim().length >= 2 && !saving) {
                    void act('challenge_create', { challenger: challenger.trim() }, ar ? 'بدأ التحدي!' : 'Challenge started!');
                  }
                }} />
            </label>
            <button className="adm-btn rounded-2xl px-6 py-2.5 text-[13px] font-black"
              style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
              disabled={saving || challenger.trim().length < 2}>
              ⚔️ {ar ? 'ابدأ' : 'Start'}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-white/40">
            {ar ? 'البوت بيعلنه في الشات فوراً، وبيختار كلمة سرية عشوائية ما تشوفها إلا لما يوقف التحدي.'
              : 'The bot announces it in chat instantly and picks a secret keyword you only see when it ends.'}
          </p>
        </Sec>
      )}

      {/* ── تحدي جارٍ ── */}
      {ch && !finished && (
        <>
          {/* لوح المتنافسين */}
          <Sec title={ar ? 'المتنافسان' : 'The contenders'} icon="⚔️" state="on" tone={GOLD}>
            <div className="ch-vs">
              <div className={`ch-side ${winner === 'challenger' ? 'win' : winner === 'chat' ? 'lose' : ''}`}>
                <div className="ch-vs-badge" aria-hidden="true">👑</div>
                <p className="mt-2 text-sm font-black" dir="ltr">@{ch.challenger}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-white/40">
                  {ar ? 'المتحدي' : 'Challenger'}
                </p>
              </div>

              <div className="text-2xl font-black text-white/25" aria-hidden="true">VS</div>

              <div className={`ch-side ${winner === 'chat' ? 'win' : winner === 'challenger' ? 'lose' : ''}`}>
                <div className="ch-vs-badge" aria-hidden="true">👥</div>
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

          {/* زر إيقاف + اختيار الفائز */}
          {running && (
            <Sec title={ar ? 'من كسب؟' : 'Who won?'} icon="🏁" state="on" tone={GOLD}>
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="ch-opt" disabled={saving}
                  onClick={() => void act('challenge_end', { id: ch.id, winner: 'challenger' },
                    ar ? 'انتهى التحدي — المتحدي كسب!' : 'Ended — the challenger won!')}>
                  <p className="text-2xl" aria-hidden="true">👑</p>
                  <p className="mt-1 text-[13px] font-black">{ar ? 'ناصر / رايس كسب' : 'The challenger won'}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">
                    {ar ? 'تختار أنت العقاب' : 'you pick the penalty'}
                  </p>
                </button>
                <button className="ch-opt" disabled={saving}
                  onClick={() => void act('challenge_end', { id: ch.id, winner: 'chat' },
                    ar ? 'انتهى التحدي — الشات كسب!' : 'Ended — the chat won!')}>
                  <p className="text-2xl" aria-hidden="true">🎉</p>
                  <p className="mt-1 text-[13px] font-black">{ar ? 'الشات كسب' : 'The chat won'}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">
                    {ar ? 'هدية للمشاركين' : 'a gift for the participants'}
                  </p>
                </button>
              </div>
              <button className="mt-3 w-full rounded-2xl py-2.5 text-[12px] font-black"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.13)', color: 'rgba(255,255,255,.65)' }}
                disabled={saving}
                onClick={() => void act('challenge_cancel', { id: ch.id }, ar ? 'أُلغي التحدي' : 'Challenge cancelled')}>
                🚫 {ar ? 'ألغِ التحدي' : 'Cancel challenge'}
              </button>
            </Sec>
          )}

          {/* مرحلة الكلمة */}
          {collecting && (
            <Sec title={ar ? 'الكلمة السرية' : 'The secret keyword'} icon="🔑" state="on" tone={EMERALD}>
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
                  <p className="py-6 text-center text-[12px] text-white/30">
                    {ar ? 'ما أحد كتب لسه… البوت شايف 🎯' : 'Nobody yet… the bot is watching 🎯'}
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

          {/* المكافأة / العقاب */}
          {collecting && (
            <Sec title={ar ? 'المكافأة أو العقاب' : 'Reward or penalty'} icon="🎖️" state="on" tone={EMERALD}>
              <p className="mb-3 text-[12px] text-white/50">
                {winner === 'chat'
                  ? ar ? 'الشات كسب → اللي يكتب الكلمة ينال المكافأة' : 'The chat won → participants get the reward'
                  : ar ? 'المتحدي كسب → تقدر تعاقب الشات أو تكرّمه' : 'The challenger won → punish or reward the chat'}
              </p>

              <div className="grid gap-2 sm:grid-cols-4">
                {REWARDS.map((r) => (
                  <button key={r.id} className={`ch-opt ${reward === r.id ? 'on' : ''}`}
                    disabled={saving} onClick={() => setReward(r.id)}>
                    <p className="text-xl" aria-hidden="true">{r.icon}</p>
                    <p className="mt-1 text-[12px] font-black">{ar ? r.ar : r.en}</p>
                    <p className="mt-0.5 text-[10px] text-white/40">{r.hint}</p>
                  </button>
                ))}
              </div>

              {(reward === 'distribute' || reward === 'double' || reward === 'sabotage') && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {reward === 'distribute' && (
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                        {ar ? 'نقاط لكل واحد' : 'Points each'}
                      </span>
                      <input className="ch-inp" dir="ltr" type="number" min={1} max={1000000} value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
                    </label>
                  )}
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                      {ar ? 'المدة بالدقائق' : 'Duration (minutes)'}
                    </span>
                    <input className="ch-inp" dir="ltr" type="number" min={1} max={10080} value={minutes}
                      onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} />
                  </label>
                </div>
              )}

              <button className="mt-4 w-full rounded-2xl py-3 text-[14px] font-black"
                style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
                disabled={saving}
                onClick={() => void act('challenge_apply', {
                  id: ch.id,
                  reward_kind: reward,
                  reward_amount: Number(amount) || 0,
                  reward_minutes: Number(minutes) || 0,
                }, ar ? `انفّذ على ${count} واحد` : `Applied to ${count} people`)}>
                {saving ? (ar ? 'جاري…' : 'Working…') : `🎯 ${ar ? 'إيقاف وتطبيق' : 'Stop & apply'} (${nf(count)})`}
              </button>
            </Sec>
          )}
        </>
      )}

      {/* ── خلص ── */}
      {ch && finished && (
        <Sec title={ar ? 'انتهى التحدي' : 'Challenge finished'} icon="🏁" state="done" tone={ch.status === 'done' ? EMERALD : 'rgba(255,255,255,.4)'}>
          <div className="text-center py-4">
            <p className="text-3xl" aria-hidden="true">{ch.status === 'done' ? '🏆' : '🚫'}</p>
            <p className="mt-2 text-sm font-black">
              {ch.status === 'cancelled'
                ? (ar ? 'أُلغي التحدي' : 'Challenge cancelled')
                : ch.winner === 'challenger'
                  ? (ar ? `كسب @${ch.challenger}` : `@${ch.challenger} won`)
                  : (ar ? 'كسب الشات' : 'The chat won')}
            </p>
            {ch.status === 'done' && count > 0 && (
              <p className="mt-1 text-[12px] text-white/45">
                {ch.reward_kind === 'distribute'
                  ? ar ? `وُزّعت ${nf(ch.reward_amount)} نقطة على ${nf(count)} واحد` : `${nf(ch.reward_amount)} points to ${nf(count)} people`
                  : ch.reward_kind === 'double'
                    ? ar ? 'تربل — نقاط مضاعفة' : 'Double points'
                    : ch.reward_kind === 'sabotage'
                      ? ar ? 'تخريب — نص نقطة' : 'Sabotage — half a point'
                      : (ar ? 'ما صار شيء' : 'Nothing applied')}
              </p>
            )}
          </div>
          <button className="mt-2 w-full rounded-2xl py-2.5 text-[12px] font-black"
            style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
            onClick={() => { setCh(null); setEntries([]); setCount(0); setChallenger(''); void load(); }}>
            ⚔️ {ar ? 'تحدٍ جديد' : 'New challenge'}
          </button>
        </Sec>
      )}
    </div>
  );
};