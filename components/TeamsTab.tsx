/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  معركة الفرق — الشات ضد بعضه
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  ناصر ينشئ المعركة: الاسم + فريقان أو أكثر (يضيف قد ما يبي) + جائزة
 *  الفائز + عقاب الخاسر. كلها قبل البدء.
 *
 *    voting   → الناس تكتب اسم فريقها في الشات. صوت واحد فقط لكل شخص.
 *               العدّاد لكل فريق يتحدث لحاله كل ثانيتين.
 *    running  → انتهى التصويت. النقاط تعدّ وقت البث. ناصر يختار الفائز.
 *    done     → التوزيع/الدبل/التخريب انطبق على أعضاء الفرق فقط.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { callAdmin } from './adminApi';
import { Ic } from './AdminIcons';
import { ARENA_CSS } from './ArenaStyles';

const GOLD = '#D4AF37';
const GOLD_LT = '#F5DE84';
const GOLD_DK = '#9E7C21';
const EMERALD = '#10B981';
const BLOOD = '#DC2626';

type Status = 'voting' | 'running' | 'done' | 'cancelled';
type WinReward = 'none' | 'distribute' | 'double';
type LosePenalty = 'none' | 'sabotage';

interface Battle {
  id: number;
  title: string;
  status: Status;
  winning_option_id: number | null;
  win_reward_kind: WinReward;
  win_reward_amount: number;
  win_reward_minutes: number;
  lose_penalty_kind: LosePenalty;
  lose_penalty_minutes: number;
}

interface TeamOption {
  id: number;
  label: string;
}

const nf = (n: number) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const Sec: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; tone?: string; state?: 'todo' | 'on' | 'done' }> = ({
  title, icon, children, tone = GOLD, state,
}) => (
  <section className="ch-card adm-in rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
    <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${tone}88,transparent)` }} aria-hidden="true" />
    <div className={`ch-step ${state === 'on' ? 'on' : state === 'done' ? 'done' : ''}`}>
      {icon}
      <span className="ch-bar flex-1" style={{ maxWidth: 34 }}>
        <i style={{ width: state === 'done' ? '100%' : state === 'on' ? '55%' : '0%' }} />
      </span>
      {title}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const Tile: React.FC<{ children: React.ReactNode; big?: boolean }> = ({ children, big }) => (
  <span className="adm-ico" style={big ? { width: 44, height: 44, borderRadius: 14 } : undefined}>
    {children}
  </span>
);

export const TeamsTab: React.FC<{ ar: boolean; busy: boolean }> = ({ ar, busy }) => {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [options, setOptions] = useState<TeamOption[]>([]);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [total, setTotal] = useState(0);

  // نموذج الإنشاء
  const [title, setTitle] = useState('');
  const [labels, setLabels] = useState<string[]>(['', '']);
  const [winReward, setWinReward] = useState<WinReward>('distribute');
  const [winAmount, setWinAmount] = useState('25');
  const [winMinutes, setWinMinutes] = useState('30');
  const [losePenalty, setLosePenalty] = useState<LosePenalty>('none');
  const [loseMinutes, setLoseMinutes] = useState('30');

  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmWinner, setConfirmWinner] = useState<number | null>(null);
  const dismissed = useRef<Set<number>>(new Set());
  const timer = useRef<number | null>(null);

  const say = useCallback((ok: boolean, text: string) => {
    setFlash({ ok, text });
    window.setTimeout(() => setFlash(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await callAdmin('teams_get');
      const b = j.battle ?? null;
      const finished = b?.status === 'done' || b?.status === 'cancelled';
      const hide = b !== null && finished && dismissed.current.has(b.id);
      setBattle(hide ? null : b);
      setOptions(hide ? [] : Array.isArray(j.options) ? j.options : []);
      setVotes(hide ? {} : j.votes ?? {});
      setTotal(hide ? 0 : Number(j.total) || 0);
      setLoadError(null);
    } catch (e: any) {
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

  useEffect(() => {
    void load();
    const live = battle?.status === 'voting';
    const busyState = battle?.status === 'running' || live;
    timer.current = window.setInterval(() => void load(), live ? 2000 : busyState ? 8000 : 15000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [load, battle?.status]);

  const act = async (action: string, params: Record<string, unknown>, okText: string) => {
    setSaving(true);
    try {
      await callAdmin(action, params);
      say(true, okText);
      await load();
    } catch (e: any) {
      const code = e?.data?.error;
      const map: Record<string, string> = {
        battle_already_running: ar ? 'في معركة شغّالة — خلّصها الأول' : 'A battle is already running',
        bad_title: ar ? 'اكتب اسم المعركة (حرفين على الأقل)' : 'Type a battle name (2+ chars)',
        need_two_teams: ar ? 'لازم فريقان على الأقل' : 'At least two teams required',
        too_many_teams: ar ? 'ثمانية فرق كحد أقصى' : 'Eight teams maximum',
        duplicate_teams: ar ? 'أسماء الفرق مكررة' : 'Duplicate team names',
        need_amount: ar ? 'حدّد كم نقطة للتوزيع' : 'Set the points to distribute',
        need_minutes: ar ? 'حدّد المدة بالدقائق' : 'Set a duration in minutes',
        bad_amount: ar ? 'رقم النقاط مو صحيح' : 'Invalid point amount',
        bad_minutes: ar ? 'المدة لازم بين 1 و 10080 دقيقة' : 'Duration must be 1–10080 minutes',
        not_voting: ar ? 'التصويت خلص' : 'Voting is over',
        not_running: ar ? 'المعركة مو شغّالة' : 'Battle is not running',
        no_winner: ar ? 'اختر الفائز أول' : 'Pick a winner first',
        bad_winner: ar ? 'الفائز لازم يكون أحد الفرق' : 'Winner must be one of the teams',
        not_found: ar ? 'ما لقينا المعركة' : 'Battle not found',
        already_decided: ar ? 'المعركة مقفلة — القرار نهائي' : 'Locked — the decision is final',
        db_error: ar ? 'خطأ قاعدة البيانات' : 'Database error',
      };
      say(false, map[code] || e?.data?.detail || code || (ar ? 'فشلت العملية' : 'Action failed'));
    } finally {
      setSaving(false);
    }
  };

  const status = battle?.status ?? null;
  const voting = status === 'voting';
  const running = status === 'running';
  const finished = status === 'done' || status === 'cancelled';

  const cleanLabels = labels.map((s) => s.trim()).filter((s) => [...s].length >= 2);
  const canStart =
    [...title.trim()].length >= 2 &&
    cleanLabels.length >= 2 &&
    new Set(cleanLabels.map((s) => s.toLowerCase())).size === cleanLabels.length &&
    (winReward !== 'distribute' || Number(winAmount) >= 1) &&
    (winReward !== 'double' || Number(winMinutes) >= 1) &&
    (losePenalty !== 'sabotage' || Number(loseMinutes) >= 1);

  const start = () =>
    act('teams_create', {
      title: title.trim(),
      options: cleanLabels,
      win_reward_kind: winReward,
      win_reward_amount: Number(winAmount) || 0,
      win_reward_minutes: Number(winMinutes) || 0,
      lose_penalty_kind: losePenalty,
      lose_penalty_minutes: Number(loseMinutes) || 0,
    }, ar ? 'بدأت المعركة!' : 'Battle started!');

  const maxVotes = Math.max(1, ...options.map((o) => votes[o.id] || 0));
  const winnerLabel = options.find((o) => o.id === battle?.winning_option_id)?.label;

  return (
    <div className="grid gap-4">
      <style>{ARENA_CSS}</style>
      {/* العنوان */}
      <div className="adm-card adm-in ch-card arena-hero rounded-3xl p-5 sm:p-6 border border-white/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="arena-title text-xl sm:text-2xl font-black flex items-center gap-2.5">
              <span className="adm-ico" style={{ width: 38, height: 38, borderRadius: 13 }}><Ic n="flag" size={20} /></span>
              {battle?.title?.trim() || (ar ? 'معركة الفرق' : 'Team Battle')}
            </h2>
            <p className="mt-1 text-[12px] text-white/45">
              {ar ? 'الشات ضد بعضه — فرق تصوّت، تفوز، وتُكافأ' : 'Chat against itself — teams vote, win, and get rewarded'}
            </p>
          </div>
          {status && (
            <span className="px-3 py-1.5 rounded-xl text-[11px] font-black"
              style={{
                background: voting ? 'rgba(212,175,55,.16)' : running ? 'rgba(16,185,129,.16)' : 'rgba(255,255,255,.07)',
                color: voting ? GOLD : running ? EMERALD : 'rgba(255,255,255,.5)',
                border: `1px solid ${voting ? `${GOLD}55` : running ? `${EMERALD}55` : 'rgba(255,255,255,.12)'}`,
              }}>
              {voting ? (ar ? 'تصويت' : 'VOTING')
                : running ? (ar ? 'شغّالة' : 'RUNNING')
                : status === 'done' ? (ar ? 'خلصت' : 'DONE') : (ar ? 'ملغاة' : 'CANCELLED')}
            </span>
          )}
        </div>

        {loadError && (
          <div className="mt-4 rounded-2xl px-4 py-3 text-[13px] font-black flex items-center gap-2"
            style={{ background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.45)', color: '#FCA5A5' }}>
            <Ic n="alert" size={16} /> {loadError}
          </div>
        )}

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

      {/* ── ما في معركة: الإنشاء ── */}
      {!battle && (
        <div className="grid gap-4">
          <Sec title={ar ? 'اسم المعركة' : 'Battle name'} icon={<Tile><Ic n="tag" size={14} /></Tile>} state="on" tone={GOLD}>
            <input className="ch-inp" dir="auto" value={title} maxLength={60} autoComplete="off"
              placeholder={ar ? 'مثلاً: معركة الجمعة' : 'e.g. Friday Battle'}
              onChange={(e) => setTitle(e.target.value)} />
          </Sec>

          {/* الفرق — يضيف قد ما يبي */}
          <Sec title={ar ? `الفرق (${cleanLabels.length})` : `Teams (${cleanLabels.length})`} icon={<Tile><Ic n="users" size={14} /></Tile>} state="on" tone={GOLD}>
            <div className="grid gap-2">
              {labels.map((v, i) => (
                <div key={i} className="team-row">
                  <span className="team-num" dir="ltr">{i + 1}</span>
                  <input className="ch-inp flex-1" dir="auto" value={v} maxLength={24} autoComplete="off"
                    placeholder={ar ? `اسم الفريق — مثلاً: الأحمر` : `Team name`}
                    onChange={(e) => {
                      const next = [...labels];
                      next[i] = e.target.value;
                      setLabels(next);
                    }} />
                  {labels.length > 2 && (
                    <button type="button" aria-label="remove"
                      onClick={() => setLabels(labels.filter((_, j) => j !== i))}
                      className="adm-btn ghost rounded-xl px-3 text-white/50 hover:text-white shrink-0 inline-flex items-center">
                      <Ic n="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {labels.length < 8 && (
              <button type="button"
                onClick={() => setLabels([...labels, ''])}
                className="adm-btn ghost mt-2 w-full rounded-xl py-2.5 text-[12px] font-black text-white/60 inline-flex items-center justify-center gap-1.5">
                <Ic n="plus" size={14} /> {ar ? 'أضف فريقاً' : 'Add a team'}
              </button>
            )}
            <p className="mt-2 text-[11px] text-white/35">
              {ar ? 'الناس تصوّت بكتابة اسم فريقها بالضبط في الشات — صوت واحد فقط لكل شخص.' : 'People vote by typing their exact team name in chat — one vote each.'}
            </p>
          </Sec>

          <div className="grid gap-4 sm:grid-cols-2">
            <Sec title={ar ? 'جائزة الفائز' : 'Winner reward'} icon={<Tile><Ic n="gift" size={14} /></Tile>} state="on" tone={EMERALD}>
              <div className="grid gap-2">
                {([
                  { id: 'distribute' as const, icon: 'gift' as const, label: ar ? 'توزيع نقاط' : 'Distribute points' },
                  { id: 'double' as const, icon: 'zap' as const, label: ar ? 'تربل — نقاط مضاعفة' : 'Double points' },
                  { id: 'none' as const, icon: 'none' as const, label: ar ? 'ما في جائزة' : 'No reward' },
                ]).map((o) => (
                  <button key={o.id} className={`ch-opt ch-opt-h ${winReward === o.id ? 'on' : ''}`}
                    onClick={() => setWinReward(o.id)}>
                    <span className="adm-ico shrink-0" style={{ width: 34, height: 34, borderRadius: 11 }}><Ic n={o.icon} size={17} /></span>
                    <span className="ch-opt-t"><p className="text-[12px] font-black">{o.label}</p></span>
                  </button>
                ))}
              </div>
              {winReward === 'distribute' && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {ar ? 'نقاط لكل فائز' : 'Points each winner'}
                  </span>
                  <input className="ch-inp" dir="ltr" type="number" min={1} max={1000000} value={winAmount}
                    onChange={(e) => setWinAmount(e.target.value.replace(/[^0-9]/g, ''))} />
                </label>
              )}
              {winReward === 'double' && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {ar ? 'المدة بالدقائق' : 'Duration (minutes)'}
                  </span>
                  <input className="ch-inp" dir="ltr" type="number" min={1} max={10080} value={winMinutes}
                    onChange={(e) => setWinMinutes(e.target.value.replace(/[^0-9]/g, ''))} />
                </label>
              )}
            </Sec>

            <Sec title={ar ? 'عقاب الخاسر' : 'Loser penalty'} icon={<Tile><Ic n="trendDown" size={14} /></Tile>} state="on" tone={BLOOD}>
              <div className="grid gap-2">
                {([
                  { id: 'sabotage' as const, icon: 'trendDown' as const, label: ar ? 'تخريب — نص نقطة' : 'Sabotage — half a point' },
                  { id: 'none' as const, icon: 'none' as const, label: ar ? 'ما في عقاب' : 'No penalty' },
                ]).map((o) => (
                  <button key={o.id} className={`ch-opt ch-opt-h ${losePenalty === o.id ? 'on' : ''}`}
                    onClick={() => setLosePenalty(o.id)}>
                    <span className="adm-ico shrink-0" style={{ width: 34, height: 34, borderRadius: 11 }}><Ic n={o.icon} size={17} /></span>
                    <span className="ch-opt-t"><p className="text-[12px] font-black">{o.label}</p></span>
                  </button>
                ))}
              </div>
              {losePenalty === 'sabotage' && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {ar ? 'مدة العقاب بالدقائق' : 'Penalty duration (minutes)'}
                  </span>
                  <input className="ch-inp" dir="ltr" type="number" min={1} max={10080} value={loseMinutes}
                    onChange={(e) => setLoseMinutes(e.target.value.replace(/[^0-9]/g, ''))} />
                </label>
              )}
            </Sec>
          </div>

          <button className="adm-btn w-full rounded-2xl py-4 text-[15px] font-black inline-flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
            disabled={!canStart || saving}
            onClick={() => void start()}>
            {saving ? (ar ? 'جاري…' : '…') : (<><Ic n="flag" size={16} /> {ar ? 'ابدأ التصويت' : 'Start voting'}</>)}
          </button>
        </div>
      )}

      {/* ── معركة نشطة ── */}
      {battle && !finished && (
        <>
          {/* الفرق والأصوات الحية */}
          <Sec title={ar ? `الفرق — ${total} صوت` : `Teams — ${total} votes`} icon={<Tile><Ic n="users" size={14} /></Tile>} state="on" tone={GOLD}>
            <div className="grid gap-2.5">
              {options.map((o, i) => {
                const v = votes[o.id] || 0;
                const pct = Math.round((v / maxVotes) * 100);
                const isWinner = battle.winning_option_id === o.id;
                const isLead = v > 0 && v === maxVotes && !isWinner;
                return (
                  <div key={o.id} className={`rounded-2xl p-3.5 ch-pop ${isLead ? 'vote-lead' : ''}`}
                    style={{
                      background: isWinner ? 'rgba(212,175,55,.10)' : 'rgba(255,255,255,.03)',
                      border: `1px solid ${isWinner || isLead ? 'rgba(212,175,55,.5)' : 'rgba(255,255,255,.08)'}`,
                      animationDelay: `${i * 60}ms`,
                    }}>
                    <div className="flex items-center gap-2.5">
                      <span className="team-num" dir="ltr">{i + 1}</span>
                      <p className="flex-1 min-w-0 truncate text-sm font-black" dir="auto">{o.label}</p>
                      {isWinner && <Ic n="crown" size={15} />}
                      {isLead && !isWinner && voting && (
                        <span className="adm-livedot w-2 h-2 rounded-full shrink-0" style={{ background: EMERALD, boxShadow: `0 0 10px ${EMERALD}` }} />
                      )}
                      <p className="arena-title text-xl font-black" dir="ltr">{nf(v)}</p>
                    </div>
                    <div className="ch-bar mt-2.5"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
            {voting && (
              <p className="mt-3 text-center text-[12px] text-white/45">
                {ar ? 'الناس تصوّت الآن بكتابة اسم فريقها — صوت واحد فقط.' : 'Voting is open — one vote per person.'}
              </p>
            )}
          </Sec>

          {/* التصويت → ابدأ الفعالية */}
          {voting && (
            <button className="adm-btn w-full rounded-2xl py-3.5 text-[14px] font-black inline-flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
              disabled={saving || total === 0}
              onClick={() => void act('teams_start', { id: battle.id }, ar ? 'بدأت الفعالية!' : 'Activity started!')}>
              {saving ? (ar ? 'جاري…' : '…') : (<><Ic n="play" size={16} /> {ar ? 'ابدأ الفعالية' : 'Start the activity'} ({nf(total)})</>)}
            </button>
          )}

          {/* اختيار الفائز */}
          {running && (
            <Sec title={ar ? 'أي فريق فاز؟' : 'Which team won?'} icon={<Tile><Ic n="trophy" size={14} /></Tile>} state="on" tone={GOLD}>
              <p className="mb-3 text-center text-[11px] font-black text-amber-300/80 flex items-center justify-center gap-1.5">
                <Ic n="alert" size={13} />
                {ar ? 'هذا القرار نهائي — ما بتقدر ترجع عنه' : 'Final — this cannot be undone'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => (
                  <button key={o.id} className="ch-opt" disabled={saving}
                    onClick={() => setConfirmWinner(o.id)}>
                    <p className="text-[14px] font-black" dir="auto">{o.label}</p>
                    <p className="mt-0.5 text-[11px] text-white/45" dir="ltr">{nf(votes[o.id] || 0)} {ar ? 'صوت' : 'votes'}</p>
                  </button>
                ))}
              </div>
            </Sec>
          )}

          {/* إنهاء وتطبيق */}
          {running && battle.winning_option_id && (
            <Sec title={ar ? 'إنهاء وتطبيق' : 'Finish and apply'} icon={<Tile><Ic n="check" size={14} /></Tile>} state="on" tone={GOLD}>
              <div className="rounded-2xl p-4 text-center"
                style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.09)' }}>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                  {ar ? 'الفائز' : 'Winner'}
                </p>
                <p className="mt-1.5 text-lg font-black flex items-center justify-center gap-2">
                  <Ic n="trophy" size={19} /> <span dir="auto">{winnerLabel}</span>
                </p>
                <p className="mt-1 text-[11px] text-white/35">
                  {battle.win_reward_kind === 'distribute'
                    ? `${battle.win_reward_amount} ${ar ? 'نقطة لكل فائز' : 'points each winner'}`
                    : battle.win_reward_kind === 'double'
                      ? `${ar ? 'تربل ×2' : 'double ×2'} (${battle.win_reward_minutes}${ar ? ' دقيقة' : ' min'})`
                      : (ar ? 'ما في جائزة' : 'No reward')}
                  {' · '}
                  {battle.lose_penalty_kind === 'sabotage'
                    ? `${ar ? 'تخريب الخاسرين' : 'sabotage losers'} ×0.5 (${battle.lose_penalty_minutes}${ar ? ' دقيقة' : ' min'})`
                    : (ar ? 'ما في عقاب' : 'No penalty')}
                </p>
              </div>
              <button className="adm-btn mt-4 w-full rounded-2xl py-3.5 text-[14px] font-black inline-flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
                disabled={saving}
                onClick={() => void act('teams_apply', { id: battle.id },
                  ar ? 'انطبقت النتيجة!' : 'Result applied!')}>
                {saving ? (ar ? 'جاري…' : 'Working…') : (<><Ic n="check" size={16} /> {ar ? 'إنهاء وتطبيق' : 'Finish & apply'}</>)}
              </button>
            </Sec>
          )}

          {/* شريط القفل */}
          {running && battle.winning_option_id && (
            <div className="adm-card adm-in rounded-3xl p-4 flex items-center gap-3"
              style={{ background: 'rgba(16,185,129,.10)', border: '1px solid rgba(16,185,129,.38)' }}>
              <span className="adm-ico green" style={{ width: 38, height: 38, borderRadius: 12 }}><Ic n="lock" size={19} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black text-emerald-300">
                  {ar ? `النتيجة: ${winnerLabel}` : `Result: ${winnerLabel}`}
                </p>
                <p className="mt-0.5 text-[11px] text-white/45">
                  {ar ? 'مقفلة — ما بينفع تلغيها أو ترجع عن القرار.' : 'Locked — cannot be cancelled or reversed.'}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── خلصت ── */}
      {battle && finished && (
        <Sec title={ar ? 'انتهت المعركة' : 'Battle over'} icon={<Tile><Ic n="trophy" size={14} /></Tile>} state="done" tone={battle.status === 'done' ? EMERALD : 'rgba(255,255,255,.4)'}>
          <div className="text-center py-4">
            <div className="flex justify-center">
              <span className="adm-ico green" style={{ width: 54, height: 54, borderRadius: 17 }}>
                <Ic n={battle.status === 'done' ? 'trophy' : 'ban'} size={26} />
              </span>
            </div>
            <p className="mt-2 text-sm font-black">
              {battle.status === 'cancelled'
                ? (ar ? 'أُلغيت المعركة' : 'Battle cancelled')
                : (ar ? `فاز فريق ${winnerLabel}` : `Team ${winnerLabel} won`)}
            </p>
          </div>
          <button className="adm-btn mt-2 w-full rounded-2xl py-3 text-[13px] font-black inline-flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(180deg,${GOLD_LT},${GOLD} 58%,${GOLD_DK})`, color: '#0B0906' }}
            onClick={() => {
              if (battle) dismissed.current.add(battle.id);
              setBattle(null);
              setOptions([]);
              setVotes({});
              setTotal(0);
              setTitle('');
              setLabels(['', '']);
            }}>
            <Ic n="flag" size={15} /> {ar ? 'ابدأ معركة جديدة' : 'Start a new battle'}
          </button>
          {battle && (
            <button className="mt-2 w-full rounded-2xl py-2 text-[11px] font-black"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.10)', color: 'rgba(255,255,255,.45)' }}
              onClick={() => {
                dismissed.current.delete(battle.id);
                void load();
              }}>
              {ar ? 'ارجع لنتيجة آخر معركة' : 'Back to the last result'}
            </button>
          )}
        </Sec>
      )}

      {/* نافذة تأكيد الفائز */}
      {confirmWinner !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)' }}
          onClick={() => setConfirmWinner(null)}>
          <div className="adm-card ch-card w-full max-w-sm rounded-3xl p-6 text-center ch-pop"
            style={{ border: '1px solid rgba(212,175,55,.45)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center">
              <span className="adm-ico" style={{ width: 58, height: 58, borderRadius: 19 }}><Ic n="trophy" size={28} /></span>
            </div>
            <p className="mt-3 text-lg font-black" dir="auto">
              {options.find((o) => o.id === confirmWinner)?.label}
            </p>
            <p className="mt-2 text-[13px] text-white/55">
              {battle?.win_reward_kind === 'distribute'
                ? `${battle.win_reward_amount} ${ar ? 'نقطة لكل فائز' : 'points each winner'}`
                : battle?.win_reward_kind === 'double'
                  ? `${ar ? 'تربل ×2' : 'double ×2'} (${battle.win_reward_minutes}${ar ? ' دقيقة' : ' min'})`
                  : (ar ? 'ما في جائزة' : 'No reward')}
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
                onClick={() => {
                  const id = battle?.id;
                  const w = confirmWinner;
                  setConfirmWinner(null);
                  if (id && w) void act('teams_end', { id, option_id: w }, ar ? 'تثبّت الفائز!' : 'Winner locked in!');
                }}>
                {saving ? '…' : ar ? 'أكيد' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};