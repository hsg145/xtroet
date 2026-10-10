import { getSupabase } from './supabase.js';

export interface BotEvent {
  kind: string;
  mult: number;
  label: string;
  ends_at: string;
}

export interface DropCode {
  word: string;
  amount: number;
  per_max: number;
  ends_at: string;
}

export interface ModifierRow {
  channel_id: number;
  kick_user_id: number;
  multiplier: number | null;
  multiplier_until: string | null;
  mute_until: string | null;
}

export interface OutboxRow {
  id: number;
  channel_id: number;
  text: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[supabase] ${context}: ${error?.message ?? 'unknown error'}`);
}

/** Read one bot_settings key (event / drop). Returns null when unset. */
export async function fetchSetting(key: string): Promise<any | null> {
  const { data, error } = await getSupabase().from('bot_settings').select('value').eq('key', key).maybeSingle();
  if (error) fail(`fetch setting ${key}`, error);
  const v = (data as { value: any } | null)?.value ?? null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length === 0) return null;
  return v;
}

/** All member modifiers for a channel (usually a handful of rows). */
export async function fetchModifiers(channelId: number): Promise<ModifierRow[]> {
  const { data, error } = await getSupabase()
    .from('member_modifiers')
    .select('channel_id, kick_user_id, multiplier, multiplier_until, mute_until')
    .eq('channel_id', channelId);
  if (error) fail('fetch modifiers', error);
  return (data ?? []) as ModifierRow[];
}

/** Claim counts for one drop word: user_id -> times claimed. */
export async function fetchDropClaims(channelId: number, word: string): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const { data, error } = await getSupabase()
    .from('drop_claims')
    .select('kick_user_id, count')
    .eq('channel_id', channelId)
    .eq('word', word);
  if (error) fail('fetch drop claims', error);
  for (const row of (data ?? []) as Array<{ kick_user_id: number; count: number }>) {
    out.set(Number(row.kick_user_id), Number(row.count) || 0);
  }
  return out;
}

/** Best-effort claim increment (never throws — a game must not crash the bot). */
export async function recordDropClaim(channelId: number, word: string, userId: number): Promise<void> {
  try {
    const db = getSupabase();
    const { data } = await db
      .from('drop_claims')
      .select('count')
      .eq('channel_id', channelId)
      .eq('word', word)
      .eq('kick_user_id', userId)
      .maybeSingle();
    const count = Number((data as { count: number } | null)?.count ?? 0) + 1;
    await db.from('drop_claims').upsert(
      { channel_id: channelId, word, kick_user_id: userId, count, updated_at: new Date().toISOString() },
      { onConflict: 'channel_id,word,kick_user_id' },
    );
  } catch {
    // Swallowed on purpose: the in-memory count already enforced the limit.
  }
}

/** Unsent chat announcements queued by the dashboard (oldest first). */
export async function fetchOutbox(channelId: number, limit = 10): Promise<OutboxRow[]> {
  const { data, error } = await getSupabase()
    .from('bot_outbox')
    .select('id, channel_id, text')
    .eq('channel_id', channelId)
    .is('sent_at', null)
    .order('id', { ascending: true })
    .limit(limit);
  if (error) fail('fetch outbox', error);
  return (data ?? []) as OutboxRow[];
}

export async function markOutboxSent(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from('bot_outbox').update({ sent_at: new Date().toISOString() }).in('id', ids);
  if (error) fail('mark outbox sent', error);
}
