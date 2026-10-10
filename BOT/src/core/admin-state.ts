import { getLogger } from '../logger.js';
import {
  fetchDropClaims,
  fetchModifiers,
  fetchOutbox,
  fetchSetting,
  markOutboxSent,
  recordDropClaim,
  type BotEvent,
  type DropCode,
} from '../db/admin.js';

export interface PromoDecision {
  /** True timeout: zero points, works on everyone including moderators. */
  muted: boolean;
  /** Points frozen at zero (punishment multiplier 0). */
  frozen: boolean;
  /** Integer points for this message (multipliers + fractional credit applied). */
  delta: number;
  /** Drop-code bonus for this message (0 when none). */
  bonus: number;
  /** Set when a drop code was claimed (for the announcement/note). */
  dropWord?: string;
}

const IDLE: PromoDecision = { muted: false, frozen: false, delta: 1, bonus: 0 };

function asEvent(v: unknown): BotEvent | null {
  if (!v || typeof v !== 'object') return null;
  const e = v as Record<string, unknown>;
  const mult = Number(e.mult);
  const ends = Date.parse(String(e.ends_at ?? ''));
  if (!Number.isFinite(mult) || mult <= 0 || mult > 10 || !Number.isFinite(ends)) return null;
  return { kind: String(e.kind ?? 'custom'), mult, label: String(e.label ?? ''), ends_at: String(e.ends_at) };
}

function asDrop(v: unknown): DropCode | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  const word = String(d.word ?? '').trim().toLowerCase();
  const amount = Math.trunc(Number(d.amount));
  const perMax = Math.trunc(Number(d.per_max));
  const ends = Date.parse(String(d.ends_at ?? ''));
  if (word.length < 2 || !Number.isFinite(amount) || amount < 1 || !Number.isFinite(perMax) || perMax < 1 || !Number.isFinite(ends)) {
    return null;
  }
  return { word, amount, per_max: perMax, ends_at: String(d.ends_at) };
}

/**
 * Live admin state: global events, per-user punishments/boosts, drop codes.
 *
 * Polled from Supabase every few seconds, so the dashboard takes effect
 * almost instantly without restarting the bot. Everything degrades to
 * "normal points" when the tables are unreachable.
 */
export class AdminState {
  private event: BotEvent | null = null;
  private drop: DropCode | null = null;
  private mods = new Map<string, { mult: number | null; multUntil: number; muteUntil: number }>();
  private claims = new Map<string, number>();
  private credit = new Map<string, number>();
  private claimsWord: string | null = null;
  private timer?: NodeJS.Timeout;

  /** Global event multiplier right now (1 when no event). */
  eventMult(now = Date.now()): number {
    if (!this.event) return 1;
    if (Date.parse(this.event.ends_at) <= now) return 1;
    return this.event.mult;
  }

  /** Active drop code right now (null when none). */
  activeDrop(now = Date.now()): DropCode | null {
    if (!this.drop) return null;
    if (Date.parse(this.drop.ends_at) <= now) return null;
    return this.drop;
  }

  async refresh(): Promise<void> {
    try {
      const [eventRaw, dropRaw] = await Promise.all([fetchSetting('event'), fetchSetting('drop')]);
      this.event = asEvent(eventRaw);
      const drop = asDrop(dropRaw);
      if (drop?.word !== this.claimsWord) {
        // New (or no) code: reload claim counts for it.
        this.claimsWord = drop?.word ?? null;
        this.claims = new Map();
      }
      this.drop = drop;
    } catch (err) {
      getLogger().error({ err }, 'admin state: settings refresh failed, keeping previous');
    }
  }

  /** Modifier rows are tiny; callers pass the channel they serve. */
  async refreshModifiers(channelId: number): Promise<void> {
    if (!channelId) return;
    try {
      const rows = await fetchModifiers(channelId);
      const next = new Map<string, { mult: number | null; multUntil: number; muteUntil: number }>();
      for (const r of rows) {
        next.set(`${r.channel_id}:${r.kick_user_id}`, {
          mult: r.multiplier == null ? null : Number(r.multiplier),
          multUntil: r.multiplier_until ? Date.parse(r.multiplier_until) : 0,
          muteUntil: r.mute_until ? Date.parse(r.mute_until) : 0,
        });
      }
      this.mods = next;
    } catch (err) {
      getLogger().error({ err }, 'admin state: modifiers refresh failed, keeping previous');
    }
  }

  /** Load claim counts for the active drop word (called after refresh). */
  async refreshClaims(channelId: number): Promise<void> {
    const drop = this.activeDrop();
    if (!channelId || !drop) return;
    try {
      const map = await fetchDropClaims(channelId, drop.word);
      this.claims = new Map([...map.entries()].map(([uid, n]) => [`${drop.word}:${uid}`, n]));
    } catch (err) {
      getLogger().error({ err }, 'admin state: claims refresh failed, keeping previous');
    }
  }

  /**
   * Decide the points for one message. Synchronous on purpose: it only reads
   * the in-memory snapshot (DB writes for drop claims are fire-and-forget).
   */
  promo(channelId: number, userId: number, content: string, now = Date.now()): PromoDecision {
    const mod = this.mods.get(`${channelId}:${userId}`);
    if (mod && mod.muteUntil > now) return { muted: true, frozen: false, delta: 0, bonus: 0 };

    const userMult = mod && mod.mult != null && mod.multUntil > now ? mod.mult : 1;
    if (userMult === 0) return { muted: false, frozen: true, delta: 0, bonus: 0 };

    const eff = this.eventMult(now) * userMult;

    // Fractional credit (0.5x sabotage/half-point): bank the fraction until
    // it becomes a whole point. Exact over time, DB stays integer.
    let delta: number;
    if (eff === 1) {
      delta = 1;
    } else if (eff > 1) {
      delta = Math.max(1, Math.round(eff));
    } else {
      const key = `${channelId}:${userId}`;
      const acc = (this.credit.get(key) ?? 0) + eff;
      delta = Math.floor(acc);
      this.credit.set(key, acc - delta);
    }

    // Drop code: exact word match claims the bonus (limit per user enforced).
    let bonus = 0;
    let dropWord: string | undefined;
    const drop = this.activeDrop(now);
    if (drop && content.trim().replace(/\s+/g, ' ').toLowerCase() === drop.word) {
      const ck = `${drop.word}:${userId}`;
      const used = this.claims.get(ck) ?? 0;
      if (used < drop.per_max) {
        bonus = drop.amount;
        dropWord = drop.word;
        this.claims.set(ck, used + 1);
        void recordDropClaim(channelId, drop.word, userId);
      }
    }

    return { muted: false, frozen: false, delta, bonus, dropWord };
  }

  /** Drain queued dashboard announcements into chat. Call every few seconds. */
  async drainOutbox(channelId: number, send: (text: string) => void): Promise<void> {
    if (!channelId) return;
    let rows;
    try {
      rows = await fetchOutbox(channelId);
    } catch (err) {
      getLogger().error({ err }, 'admin state: outbox fetch failed');
      return;
    }
    if (rows.length === 0) return;
    for (const row of rows) send(row.text);
    try {
      await markOutboxSent(rows.map((r) => r.id));
    } catch (err) {
      getLogger().error({ err }, 'admin state: outbox ack failed');
    }
  }

  startRefresh(channelId: number, intervalMs = 15_000): void {
    this.stopRefresh();
    const tick = (): void => {
      this.refresh()
        .then(() => this.refreshModifiers(channelId))
        .then(() => this.refreshClaims(channelId))
        .catch(() => undefined);
    };
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  stopRefresh(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Test helper: build decisions without a database. */
export function promoForTest(opts: {
  eventMult?: number;
  userMult?: number | null;
  muted?: boolean;
}): (channelId: number, userId: number, content: string) => PromoDecision {
  const credit = new Map<string, number>();
  return (channelId, userId) => {
    if (opts.muted) return { muted: true, frozen: false, delta: 0, bonus: 0 };
    const um = opts.userMult ?? 1;
    if (um === 0) return { muted: false, frozen: true, delta: 0, bonus: 0 };
    const eff = (opts.eventMult ?? 1) * um;
    if (eff >= 1) return { muted: false, frozen: false, delta: Math.max(1, Math.round(eff)), bonus: 0 };
    const key = `${channelId}:${userId}`;
    const acc = (credit.get(key) ?? 0) + eff;
    const delta = Math.floor(acc);
    credit.set(key, acc - delta);
    return { muted: false, frozen: false, delta, bonus: 0 };
  };
}
