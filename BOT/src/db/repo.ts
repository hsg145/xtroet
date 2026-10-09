import type { Rank } from '../core/ranks.js';
import { getSupabase } from './supabase.js';

export interface RankRow {
  idx: number;
  key: string;
  name_ar: string;
  name_en: string;
  emoji: string;
  min_points: number;
}

export interface MemberRow {
  kick_user_id: number;
  username: string;
  points: number;
  message_count: number;
  rank_idx: number;
}

export interface LeaderboardRow extends MemberRow {
  channel_id: number;
  rank_name_ar: string;
  rank_name_en: string;
  rank_emoji: string;
  position: number;
}

export interface PointsBatchItem {
  user_id: number;
  username: string;
  delta: number;
  messages: number;
}

export interface RankChangeRow {
  kick_user_id: number;
  username: string;
  points: number;
  message_count: number;
  rank_idx: number;
  prev_rank: number;
}

export interface TokenRow {
  channel_id: number;
  broadcaster_user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  updated_at: string;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[supabase] ${context}: ${error?.message ?? 'unknown error'}`);
}

/**
 * Upsert a channel row.
 *
 * `channels` has TWO unique constraints: the primary key on `id` and a unique
 * index on `slug`. Conflicting on `id` alone is not enough: if the same slug
 * already exists under a different id, Postgres raises 23505 on the slug index.
 * That happens when a channel slug is reused or a channel is recreated, so the
 * slug is released first when it belongs to a different row.
 */
export async function upsertChannel(id: number, slug: string): Promise<void> {
  const db = getSupabase();

  // Free the slug if it currently points at a different channel id.
  const { error: releaseErr } = await db.from('channels').delete().eq('slug', slug).neq('id', id);
  if (releaseErr) fail('release channels slug', releaseErr);

  const { error } = await db.from('channels').upsert({ id, slug }, { onConflict: 'id' });
  if (error) fail('upsert channels', error);
}

export async function fetchRanks(): Promise<RankRow[]> {
  const { data, error } = await getSupabase().from('ranks').select('*').order('idx');
  if (error) fail('fetch ranks', error);
  return (data ?? []) as RankRow[];
}

export async function fetchMember(channelId: number, userId: number): Promise<MemberRow | null> {
  const { data, error } = await getSupabase()
    .from('members')
    .select('kick_user_id, username, points, message_count, rank_idx')
    .eq('channel_id', channelId)
    .eq('kick_user_id', userId)
    .maybeSingle();
  if (error) fail('fetch member', error);
  return (data as MemberRow | null) ?? null;
}

/** Single batched RPC. Returns only the rows whose rank changed. */
export async function applyPoints(channelId: number, batch: PointsBatchItem[]): Promise<RankChangeRow[]> {
  if (batch.length === 0) return [];
  const { data, error } = await getSupabase().rpc('apply_points', {
    p_channel_id: channelId,
    p_batch: batch,
  });
  if (error) fail('apply_points', error);
  return (data ?? []) as RankChangeRow[];
}

export async function setPoints(
  channelId: number,
  userId: number,
  username: string,
  points: number,
  resetMessages = false,
): Promise<RankChangeRow[]> {
  const { data, error } = await getSupabase().rpc('set_points', {
    p_channel_id: channelId,
    p_user_id: userId,
    p_username: username,
    p_points: Math.max(0, Math.trunc(points)),
    p_reset_messages: resetMessages,
  });
  if (error) fail('set_points', error);
  return (data ?? []) as RankChangeRow[];
}

export async function fetchLeaderboard(channelId: number, limit = 5): Promise<LeaderboardRow[]> {
  const { data, error } = await getSupabase()
    .from('leaderboard')
    .select('*')
    .eq('channel_id', channelId)
    .order('position', { ascending: true })
    .limit(limit);
  if (error) fail('fetch leaderboard', error);
  return (data ?? []) as LeaderboardRow[];
}

/** Position of one member, or null when they have no row yet. */
export async function fetchPosition(channelId: number, userId: number): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('leaderboard')
    .select('position')
    .eq('channel_id', channelId)
    .eq('kick_user_id', userId)
    .maybeSingle();
  if (error) fail('fetch position', error);
  const row = data as { position: number } | null;
  return row?.position ?? null;
}

export async function findMemberByUsername(channelId: number, username: string): Promise<MemberRow | null> {
  const { data, error } = await getSupabase()
    .from('members')
    .select('kick_user_id, username, points, message_count, rank_idx')
    .eq('channel_id', channelId)
    .ilike('username', username)
    .limit(1)
    .maybeSingle();
  if (error) fail('find member by username', error);
  return (data as MemberRow | null) ?? null;
}

export async function saveToken(row: {
  channel_id: number;
  broadcaster_user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
}): Promise<void> {
  const { error } = await getSupabase()
    .from('kick_tokens')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'channel_id' });
  if (error) fail('save kick_tokens', error);
}

export async function loadToken(channelId: number): Promise<TokenRow | null> {
  const { data, error } = await getSupabase().from('kick_tokens').select('*').eq('channel_id', channelId).maybeSingle();
  if (error) fail('load kick_tokens', error);
  return (data as TokenRow | null) ?? null;
}

export async function loadAnyToken(): Promise<TokenRow | null> {
  const { data, error } = await getSupabase().from('kick_tokens').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) fail('load kick_tokens', error);
  return (data as TokenRow | null) ?? null;
}

export type { Rank };