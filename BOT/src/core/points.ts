import { fetchMember } from '../db/repo.js';
import { crossedRanks, type Rank, type RankStore } from './ranks.js';

export interface UserState {
  userId: number;
  username: string;
  points: number;
  /** Points not yet written to the database. */
  pendingDelta: number;
  /** Messages not yet written to the database. */
  pendingMessages: number;
  messageCount: number;
  rankIndex: number;
  /** 0 means "never awarded yet". */
  lastAwardAt: number;
  lastMessageHash: string;
  /** 0 means "no previous message". */
  lastMessageAt: number;
  /** Last time the entry was read or written; -1 = never. Drives TTL eviction. */
  seenAt: number;
  /** true once the DB load has completed (successfully or not). */
  loaded: boolean;
}

export type AwardDecision =
  | { awarded: true; state: UserState; rankUps: Rank[] }
  | { awarded: false; reason: string };

export interface AwardContext {
  username: string;
  content: string;
  now?: number;
  /** Ignore-user list (lowercase). */
  ignored: Set<string>;
  /** user ids that must never earn points (this bot, broadcaster). */
  selfUserIds: Set<number>;
  commandPrefix: string;
  cooldownMs: number;
  duplicateWindowMs: number;
  minLength: number;
}

export type PointsBatchItem = {
  user_id: number;
  username: string;
  delta: number;
  messages: number;
};

/** Normalized hash used for the duplicate-message rule. */
export function hashMessage(content: string): string {
  let h = 5381;
  const s = content.trim().replace(/\s+/g, ' ').toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/**
 * Instant in-memory points engine. Award rules live here, persistence is the
 * flusher's job. On a cache miss the state is loaded from the DB (default 0).
 */
export class PointsEngine {
  private cache = new Map<number, UserState>();
  private inflight = new Map<number, Promise<UserState>>();
  private ttlMs: number;
  private maxEntries: number;
  private ranks: RankStore;

  constructor(ranks: RankStore, ttlMs: number, maxEntries = 100_000) {
    this.ranks = ranks;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get pendingUsers(): number {
    let n = 0;
    for (const s of this.cache.values()) if (s.pendingDelta !== 0) n++;
    return n;
  }

  get cachedUsers(): number {
    return this.cache.size;
  }

  /**
   * Take everything unpersisted as one batch and clear the pending counters.
   * If the write fails, call restoreBatch() with the same items.
   */
  drainBatch(): PointsBatchItem[] {
    const batch: PointsBatchItem[] = [];
    for (const s of this.cache.values()) {
      if (s.pendingDelta === 0 && s.pendingMessages === 0) continue;
      batch.push({
        user_id: s.userId,
        username: s.username,
        delta: s.pendingDelta,
        messages: s.pendingMessages,
      });
      s.pendingDelta = 0;
      s.pendingMessages = 0;
    }
    return batch;
  }

/**
   * Give a failed batch back so the next tick retries it (never lose points).
   *
   * `points` stays as the viewer sees it: it always means "database + pending",
   * so only the pending counters need to come back. If a user's cache entry was
   * evicted while the write was in flight, a fresh entry is recreated with the
   * same totals so the points are not silently dropped.
   */
  restoreBatch(batch: PointsBatchItem[]): void {
    for (const item of batch) {
      const existing = this.cache.get(item.user_id);
      if (existing) {
        existing.pendingDelta += item.delta;
        existing.pendingMessages += item.messages;
        this.touch(existing);
        continue;
      }
      // Evicted mid-flight: re-seed so the next drain still carries the points.
      const revived = this.fresh(item.user_id);
      revived.username = item.username;
      revived.points = item.delta;
      revived.messageCount = item.messages;
      revived.pendingDelta = item.delta;
      revived.pendingMessages = item.messages;
      revived.loaded = true;
      revived.rankIndex = this.ranks.rankForPoints(item.delta).idx;
      this.touch(revived);
    }
  }

  private fresh(userId: number): UserState {
    return {
      userId,
      username: '',
      points: 0,
      pendingDelta: 0,
      pendingMessages: 0,
      messageCount: 0,
      rankIndex: 1,
      lastAwardAt: -1,
      lastMessageHash: '',
      lastMessageAt: -1,
      seenAt: Date.now(),
      loaded: false,
    };
  }

  private touch(state: UserState): void {
    state.seenAt = Date.now();
    this.cache.delete(state.userId);
    this.cache.set(state.userId, state);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  /** Drop entries untouched for longer than the TTL, never ones with pending points. */
  private sweep(now: number): void {
    for (const [key, state] of this.cache) {
      if (state.pendingDelta !== 0 || state.pendingMessages !== 0) continue;
      if (state.seenAt >= 0 && now - state.seenAt > this.ttlMs) this.cache.delete(key);
    }
  }

  /** Load (or create) the in-memory state for a user. Never throws. */
  async ensure(channelId: number, userId: number, username = ''): Promise<UserState> {
    const now = Date.now();
    this.sweep(now);

    const cached = this.cache.get(userId);
    if (cached && cached.loaded) {
      if (username) cached.username = username;
      this.touch(cached);
      return cached;
    }

    const existing = this.inflight.get(userId);
    if (existing) return existing;

    const promise = (async (): Promise<UserState> => {
      const state = this.fresh(userId);
      state.username = username;
      try {
        const row = await fetchMember(channelId, userId);
        if (row) {
          state.points = row.points ?? 0;
          state.messageCount = row.message_count ?? 0;
          state.rankIndex = row.rank_idx ?? 1;
        }
      } catch {
        // DB unreachable: keep zeros in memory; the flusher will retry writes.
      } finally {
        state.loaded = true;
        this.inflight.delete(userId);
      }
      this.touch(state);
      return state;
    })();

    this.inflight.set(userId, promise);
    return promise;
  }

  /** Apply every award rule and, if it passes, add exactly one point. */
  award(state: UserState, ctx: AwardContext): AwardDecision {
    const now = ctx.now ?? Date.now();
    const content = ctx.content.trim();

    if (ctx.selfUserIds.has(state.userId)) return { awarded: false, reason: 'self' };
    if (ctx.ignored.has(ctx.username.toLowerCase())) return { awarded: false, reason: 'ignored' };
    if (ctx.commandPrefix && content.startsWith(ctx.commandPrefix)) {
      return { awarded: false, reason: 'command' };
    }
    if ([...content].length < ctx.minLength) return { awarded: false, reason: 'too_short' };
    if (state.lastAwardAt >= 0 && now - state.lastAwardAt < ctx.cooldownMs) {
      return { awarded: false, reason: 'cooldown' };
    }
    const hash = hashMessage(content);
    if (
      hash === state.lastMessageHash &&
      state.lastMessageAt >= 0 &&
      now - state.lastMessageAt < ctx.duplicateWindowMs
    ) {
      return { awarded: false, reason: 'duplicate' };
    }

    const fromPoints = state.points;
    state.points += 1;
    state.pendingDelta += 1;
    state.pendingMessages += 1;
    state.messageCount += 1;
    state.lastAwardAt = now;
    state.lastMessageHash = hash;
    state.lastMessageAt = now;

    const rank = this.ranks.rankForPoints(state.points);
    state.rankIndex = rank.idx;
    const rankUps = crossedRanks(this.ranks.all(), fromPoints, state.points);

    return { awarded: true, state, rankUps };
  }

  /** Direct, mutable access to a cached state (used by the flusher). */
  cacheState(userId: number): UserState | undefined {
    return this.cache.get(userId);
  }

  /** Keep the cache in sync after an admin command wrote to the DB. */
  overridePoints(userId: number, points: number, rankIdx: number): void {
    const s = this.cache.get(userId);
    if (!s) return;
    s.points = points;
    s.pendingDelta = 0;
    s.pendingMessages = 0;
    s.rankIndex = rankIdx;
  }

  rename(userId: number, username: string): void {
    const s = this.cache.get(userId);
    if (s) s.username = username;
  }

  drop(userId: number): void {
    this.cache.delete(userId);
  }
}