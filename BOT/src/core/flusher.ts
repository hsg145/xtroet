import { applyPoints, type RankChangeRow } from '../db/repo.js';
import { getLogger } from '../logger.js';
import type { PointsBatchItem, PointsEngine } from './points.js';
import type { RankStore } from './ranks.js';

export type FlushStatus = 'idle' | 'ok' | 'error';

/**
 * Batched writer: every tick it sends ONE RPC with only the users that have
 * pending deltas. On failure the deltas go back into the engine and are
 * retried next tick, so points are never lost and never double counted.
 */
export class Flusher {
  private timer?: NodeJS.Timeout;
  private intervalMs: number;
  private channelId: number;
  private engine: PointsEngine;
  private ranks: RankStore;
  private running = false;
  private lastFlushAt: Date | null = null;
  private lastStatus: FlushStatus = 'idle';
  private lastError: string | null = null;
  private onRankUps: (rows: RankChangeRow[]) => void;

  constructor(opts: {
    channelId: number;
    engine: PointsEngine;
    ranks: RankStore;
    intervalMs: number;
    onRankUps: (rows: RankChangeRow[]) => void;
  }) {
    this.channelId = opts.channelId;
    this.engine = opts.engine;
    this.ranks = opts.ranks;
    this.intervalMs = opts.intervalMs;
    this.onRankUps = opts.onRankUps;
  }

  get lastFlush(): Date | null {
    return this.lastFlushAt;
  }

  get status(): FlushStatus {
    return this.lastStatus;
  }

  get error(): string | null {
    return this.lastError;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.flush();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Run one flush. Safe to call concurrently; overlapping calls are skipped. */
  async flush(): Promise<void> {
    if (this.running) return;
    const batch = this.engine.drainBatch();
    if (batch.length === 0) return;

    this.running = true;

    try {
      const rows = await applyPoints(this.channelId, batch);
      this.lastFlushAt = new Date();
      this.lastStatus = 'ok';
      this.lastError = null;
      const log = getLogger();
      if (batch.length === 1) log.debug({ user: batch[0]!.user_id, delta: batch[0]!.delta }, 'points flushed');
      else log.debug({ users: batch.length }, 'points flushed');
      if (rows.length > 0) this.onRankUps(rows);
    } catch (err) {
      this.engine.restoreBatch(batch);
      this.lastStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      getLogger().error(
        { err, users: batch.length, points: batch.reduce((sum, b) => sum + b.delta, 0) },
        'flush failed, points kept in memory for retry — if this repeats, paste supabase/migrations/002_fix_rpc.sql in the Supabase SQL editor',
      );
    } finally {
      this.running = false;
    }
  }

  /** Used on SIGINT/SIGTERM and by tests. */
  async flushNow(): Promise<void> {
    await this.flush();
  }

  rank(idx: number) {
    return this.ranks.rankByIdx(idx);
  }

  get interval(): number {
    return this.intervalMs;
  }
}

export type { PointsBatchItem };