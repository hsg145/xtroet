/**
 * طبقة قاعدة بيانات "تحدي رايس".
 *
 * شخص واحد ضد الشات كله. المنطق كله (الحالة، الكلمة، التوزيع) عند الأدمن
 * في الموقع — البوت يقرأ ويكتب فقط، فما فيه قرار يخص النتيجة.
 */

import { getSupabase } from './supabase.js';

export type ChallengeStatus = 'running' | 'collecting' | 'done' | 'cancelled';
export type ChallengeWinner = 'challenger' | 'chat' | null;
export type RewardKind = 'none' | 'distribute' | 'double' | 'sabotage';

export interface ChallengeRow {
  id: number;
  channel_id: number;
  challenger: string;
  status: ChallengeStatus;
  winner: ChallengeWinner;
  keyword: string | null;
  reward_kind: RewardKind;
  reward_amount: number;
  reward_minutes: number;
  note: string;
  started_at: string;
  ended_at: string | null;
  collected_at: string | null;
  applied_at: string | null;
}

export interface EntryRow {
  kick_user_id: number;
  username: string;
  collected_at: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[supabase] ${context}: ${error?.message ?? 'unknown error'}`);
}

function asStatus(v: unknown): ChallengeStatus {
  return v === 'running' || v === 'collecting' || v === 'done' || v === 'cancelled' ? v : 'running';
}

function asReward(v: unknown): RewardKind {
  return v === 'distribute' || v === 'double' || v === 'sabotage' || v === 'none' ? v : 'none';
}

/** يقرأ صف بعينه ويتحقق إن الأرقام تعني شيئاً (جدولنا ما يخزّن JSON). */
export function normalizeChallenge(row: Record<string, unknown> | null): ChallengeRow | null {
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const winner = row.winner === 'challenger' || row.winner === 'chat' ? row.winner : null;
  return {
    id,
    channel_id: Number(row.channel_id) || 0,
    challenger: String(row.challenger ?? '').trim(),
    status: asStatus(row.status),
    winner,
    keyword: typeof row.keyword === 'string' && row.keyword.trim() !== '' ? row.keyword.trim() : null,
    reward_kind: asReward(row.reward_kind),
    reward_amount: Math.max(0, Math.trunc(Number(row.reward_amount)) || 0),
    reward_minutes: Math.max(0, Math.trunc(Number(row.reward_minutes)) || 0),
    note: String(row.note ?? ''),
    started_at: String(row.started_at ?? ''),
    ended_at: row.ended_at ? String(row.ended_at) : null,
    collected_at: row.collected_at ? String(row.collected_at) : null,
    applied_at: row.applied_at ? String(row.applied_at) : null,
  };
}

const COLUMNS =
  'id, channel_id, challenger, status, winner, keyword, reward_kind, reward_amount, reward_minutes, note, started_at, ended_at, collected_at, applied_at';

/** التحدي الجارِ (running أو collecting) — واحد فقط لكل قناة. */
export async function fetchActiveChallenge(channelId: number): Promise<ChallengeRow | null> {
  const { data, error } = await getSupabase()
    .from('challenges')
    .select(COLUMNS)
    .eq('channel_id', channelId)
    .in('status', ['running', 'collecting'])
    .order('id', { ascending: false })
    .limit(1);
  if (error) fail('fetch active challenge', error);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.length > 0 ? normalizeChallenge(rows[0]!) : null;
}

/** آخر تحدي سواء خلص أو لا — للداشبورد. */
export async function fetchLatestChallenge(channelId: number): Promise<ChallengeRow | null> {
  const { data, error } = await getSupabase()
    .from('challenges')
    .select(COLUMNS)
    .eq('channel_id', channelId)
    .order('id', { ascending: false })
    .limit(1);
  if (error) fail('fetch latest challenge', error);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.length > 0 ? normalizeChallenge(rows[0]!) : null;
}

/**
 * سجّل واحد كتب الكلمة. ما يرمي.
 *
 * الضمانة الحقيقية ضد التكرار هي primary key على (challenge_id, kick_user_id):
 * لو واحد كتب الكلمة عشر مرات، Postgres يتجاهل التسعة بعد الأولى. البوت
 * ما يعتمد على ذاكرته أبداً — لو ضاعت أو اتأخرت، التكرار مستحيل.
 * الذاكرة في ChallengeState مجرد سرعة للردّ الفوري على الشات.
 */
export async function recordEntry(
  challengeId: number,
  userId: number,
  username: string,
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from('challenge_entries')
      .upsert(
        { challenge_id: challengeId, kick_user_id: userId, username, collected_at: new Date().toISOString() },
        { onConflict: 'challenge_id,kick_user_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
  } catch {
    // ما يشوف رسالة خطأ بسبب فشل الكتابة — نتجاهل ونكمل.
  }
}

/** كم واحد كتب الكلمة، وكم واحد إضافي حاول يكرر. */
export async function countEntries(challengeId: number): Promise<number> {
  const { count, error } = await getSupabase()
    .from('challenge_entries')
    .select('kick_user_id', { count: 'exact', head: true })
    .eq('challenge_id', challengeId);
  if (error) fail('count challenge entries', error);
  return Number(count ?? 0);
}

/** كل من كتب الكلمة، الأحدث أولاً. */
export async function fetchEntries(challengeId: number, limit = 500): Promise<EntryRow[]> {
  const { data, error } = await getSupabase()
    .from('challenge_entries')
    .select('kick_user_id, username, collected_at')
    .eq('challenge_id', challengeId)
    .order('collected_at', { ascending: false })
    .limit(limit);
  if (error) fail('fetch challenge entries', error);
  return ((data ?? []) as EntryRow[]).map((r) => ({
    kick_user_id: Number(r.kick_user_id),
    username: String(r.username ?? ''),
    collected_at: String(r.collected_at ?? ''),
  }));
}