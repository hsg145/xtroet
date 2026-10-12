/**
 * طبقة قاعدة بيانات "معركة الفرق".
 *
 * الشات ينقسم لفرق، وكل واحد له صوت واحد فقط. الضمانة الحقيقية هي
 * primary key على (battle_id, kick_user_id) — أول صوت يُحسب والباقي
 * يُتجاهل من القاعدة نفسها.
 */

import { getSupabase } from './supabase.js';

export type BattleStatus = 'voting' | 'running' | 'done' | 'cancelled';

export interface BattleRow {
  id: number;
  channel_id: number;
  title: string;
  status: BattleStatus;
  winning_option_id: number | null;
  win_reward_kind: 'none' | 'distribute' | 'double';
  win_reward_amount: number;
  win_reward_minutes: number;
  lose_penalty_kind: 'none' | 'sabotage';
  lose_penalty_minutes: number;
  started_at: string;
  ended_at: string | null;
  applied_at: string | null;
}

export interface OptionRow {
  id: number;
  battle_id: number;
  label: string;
  position: number;
}

export interface VoteRow {
  kick_user_id: number;
  option_id: number;
  username: string;
  voted_at: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[supabase] ${context}: ${error?.message ?? 'unknown error'}`);
}

function asStatus(v: unknown): BattleStatus {
  return v === 'voting' || v === 'running' || v === 'done' || v === 'cancelled' ? v : 'voting';
}

const mins = (v: unknown) => Math.max(0, Math.trunc(Number(v)) || 0);

export function normalizeBattle(row: Record<string, unknown> | null): BattleRow | null {
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const win = row.winning_option_id == null ? null : Number(row.winning_option_id);
  return {
    id,
    channel_id: Number(row.channel_id) || 0,
    title: String(row.title ?? '').trim(),
    status: asStatus(row.status),
    winning_option_id: win != null && Number.isFinite(win) && win > 0 ? win : null,
    win_reward_kind: row.win_reward_kind === 'distribute' || row.win_reward_kind === 'double' ? row.win_reward_kind : 'none',
    win_reward_amount: mins(row.win_reward_amount),
    win_reward_minutes: mins(row.win_reward_minutes),
    lose_penalty_kind: row.lose_penalty_kind === 'sabotage' ? 'sabotage' : 'none',
    lose_penalty_minutes: mins(row.lose_penalty_minutes),
    started_at: String(row.started_at ?? ''),
    ended_at: row.ended_at ? String(row.ended_at) : null,
    applied_at: row.applied_at ? String(row.applied_at) : null,
  };
}

const COLUMNS =
  'id, channel_id, title, status, winning_option_id, win_reward_kind, win_reward_amount, win_reward_minutes, lose_penalty_kind, lose_penalty_minutes, started_at, ended_at, applied_at';

/** المعركة النشطة (voting أو running) — واحدة فقط لكل قناة. */
export async function fetchActiveBattle(channelId: number): Promise<BattleRow | null> {
  const { data, error } = await getSupabase()
    .from('team_battles')
    .select(COLUMNS)
    .eq('channel_id', channelId)
    .in('status', ['voting', 'running'])
    .order('id', { ascending: false })
    .limit(1);
  if (error) fail('fetch active battle', error);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.length > 0 ? normalizeBattle(rows[0]!) : null;
}

/** خيارات (فرق) المعركة بالترتيب. */
export async function fetchOptions(battleId: number): Promise<OptionRow[]> {
  const { data, error } = await getSupabase()
    .from('team_options')
    .select('id, battle_id, label, position')
    .eq('battle_id', battleId)
    .order('position', { ascending: true });
  if (error) fail('fetch team options', error);
  return ((data ?? []) as OptionRow[]).map((r) => ({
    id: Number(r.id),
    battle_id: Number(r.battle_id),
    label: String(r.label ?? ''),
    position: Number(r.position) || 0,
  }));
}

/**
 * سجّل صوتاً. لا يرمي أبداً — التصويت يجب ألا يكسر الشات.
 *
 * أول صوت يُحسب والباقي يُتجاهل (ON CONFLICT DO NOTHING على المفتاح
 * الأساسي). تغيير الرأي غير مسموح عمداً: صوت واحد فقط.
 */
export async function recordVote(
  battleId: number,
  optionId: number,
  userId: number,
  username: string,
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from('team_votes')
      .upsert(
        { battle_id: battleId, option_id: optionId, kick_user_id: userId, username, voted_at: new Date().toISOString() },
        { onConflict: 'battle_id,kick_user_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
  } catch {
    // نتجاهل بصمت — الذاكرة في TeamBattleState هي للردّ السريع فقط.
  }
}

/** عدد الأصوات لكل خيار: option_id -> count. */
export async function countVotes(battleId: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const v of await fetchVotes(battleId)) {
    out.set(v.option_id, (out.get(v.option_id) ?? 0) + 1);
  }
  return out;
}

/** كل الأصوات — لتحميل الذاكرة عند بدء متأخر. */
export async function fetchVotes(battleId: number): Promise<VoteRow[]> {
  try {
    const { data, error } = await getSupabase()
      .from('team_votes')
      .select('kick_user_id, option_id, username, voted_at')
      .eq('battle_id', battleId)
      .limit(5000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as VoteRow[]).map((r) => ({
      kick_user_id: Number(r.kick_user_id),
      option_id: Number(r.option_id),
      username: String(r.username ?? ''),
      voted_at: String(r.voted_at ?? ''),
    }));
  } catch {
    return [];
  }
}