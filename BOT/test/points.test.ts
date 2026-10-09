import { beforeEach, describe, expect, it } from 'vitest';
import { CooldownMap } from '../src/core/cooldown.js';
import { hashMessage, PointsEngine, type AwardContext } from '../src/core/points.js';
import { RankStore } from '../src/core/ranks.js';

const ranks = new RankStore();
const engine = new PointsEngine(ranks, 60 * 60 * 1000);

const ctx = (over: Partial<AwardContext> = {}): AwardContext => ({
  username: 'ahmed',
  content: 'hello world',
  now: 1_000_000,
  ignored: new Set(['botrix', 'kickbot', 'nightbot']),
  selfUserIds: new Set([999]),
  commandPrefix: '!',
  cooldownMs: 10_000,
  duplicateWindowMs: 60_000,
  minLength: 2,
  ...over,
});

async function stateFor(userId: number) {
  return engine.ensure(0, userId, 'ahmed');
}

beforeEach(() => {
  engine.drop(1);
  engine.drop(2);
  engine.drop(3);
  engine.drop(999);
});

describe('hashMessage', () => {
  it('ignores case and extra whitespace', () => {
    expect(hashMessage('  Hello   World ')).toBe(hashMessage('hello world'));
  });

  it('differs for different text', () => {
    expect(hashMessage('hello')).not.toBe(hashMessage('world'));
  });
});

describe('PointsEngine.award', () => {
  it('awards one point for a normal message', async () => {
    const s = await stateFor(1);
    const d = engine.award(s, ctx());
    expect(d.awarded).toBe(true);
    expect(s.points).toBe(1);
    expect(s.pendingDelta).toBe(1);
    expect(s.pendingMessages).toBe(1);
  });

  it('rejects commands', async () => {
    const s = await stateFor(1);
    const d = engine.award(s, ctx({ content: '!رتبة' }));
    expect(d).toEqual({ awarded: false, reason: 'command' });
    expect(s.points).toBe(0);
  });

  it('rejects ignored usernames case-insensitively', async () => {
    const s = await stateFor(1);
    expect(engine.award(s, ctx({ username: 'BotRix' })).awarded).toBe(false);
    expect(engine.award(s, ctx({ username: 'NIGHTBOT' })).awarded).toBe(false);
  });

  it('rejects the bot itself', async () => {
    const s = await stateFor(999);
    const d = engine.award(s, ctx({ username: 'ranksbot', selfUserIds: new Set([999]) }));
    expect(d).toEqual({ awarded: false, reason: 'self' });
  });

  it('rejects messages shorter than the minimum length', async () => {
    const s = await stateFor(1);
    expect(engine.award(s, ctx({ content: 'a' }))).toEqual({ awarded: false, reason: 'too_short' });
    expect(engine.award(s, ctx({ content: '  a  ' }))).toEqual({ awarded: false, reason: 'too_short' });
  });

  it('enforces the per-user cooldown', async () => {
    const s = await stateFor(1);
    expect(engine.award(s, ctx({ now: 0 })).awarded).toBe(true);

    // 9s later, still inside the 10s cooldown, and a different message.
    const blocked = engine.award(s, ctx({ now: 9_000, content: 'another message' }));
    expect(blocked).toEqual({ awarded: false, reason: 'cooldown' });
    expect(s.points).toBe(1);

    // 11s later, allowed again.
    expect(engine.award(s, ctx({ now: 11_000, content: 'yet another message' })).awarded).toBe(true);
    expect(s.points).toBe(2);
  });

  it('blocks an identical repeat inside the duplicate window', async () => {
    const s = await stateFor(1);
    expect(engine.award(s, ctx({ now: 0, content: 'same message' })).awarded).toBe(true);

    // Past the 10s cooldown but inside the 60s duplicate window.
    const blocked = engine.award(s, ctx({ now: 20_000, content: 'same message' }));
    expect(blocked).toEqual({ awarded: false, reason: 'duplicate' });
    expect(s.points).toBe(1);

    // Same text after the duplicate window expires.
    expect(engine.award(s, ctx({ now: 90_000, content: 'same message' })).awarded).toBe(true);
    expect(s.points).toBe(2);
  });

  it('detects a rank-up the instant the point is added', async () => {
    const s = await stateFor(1);
    // Start 99 points from a loaded DB row.
    s.points = 99;
    s.pendingDelta = 0;

    const d = engine.award(s, ctx({ now: 0 }));
    expect(d.awarded).toBe(true);
    expect(d.awarded && d.rankUps.map((r) => r.key)).toEqual(['solo_cadet']);
    expect(s.rankIndex).toBe(2);
  });

  it('reports every rank crossed when points jump (announce the final one)', async () => {
    const s = await stateFor(1);
    // 4999 -> 5000 is the first_sergeant boundary.
    s.points = 4999;
    s.pendingDelta = 0;

    const d = engine.award(s, ctx({ now: 0 }));
    expect(d.awarded).toBe(true);
    const ups = d.awarded ? d.rankUps : [];
    expect(ups.map((r) => r.key)).toEqual(['first_sergeant']);
    expect(ups[ups.length - 1]!.key).toBe('first_sergeant');
    expect(s.points).toBe(5000);
    expect(s.rankIndex).toBe(9);
  });

  it('reports several crossed ranks for a big admin jump', async () => {
    const s = await stateFor(1);
    s.points = 0;
    s.pendingDelta = 0;

    const d = engine.award(s, ctx({ now: 0 }));
    expect(d.awarded).toBe(true);
    const ups = d.awarded ? d.rankUps : [];
    // 0 -> 1 crosses nothing: the first threshold is 100.
    expect(ups).toHaveLength(0);
  });
});

describe('PointsEngine batching', () => {
  it('drains pending deltas and restores them on failure', async () => {
    const a = await engine.ensure(0, 2, 'a');
    const b = await engine.ensure(0, 3, 'b');
    engine.award(a, ctx({ now: 0 }));
    engine.award(a, ctx({ now: 20_000, content: 'another' }));
    engine.award(b, ctx({ now: 0, username: 'b' }));

    expect(engine.pendingUsers).toBe(2);

    const batch = engine.drainBatch();
    expect(batch.length).toBe(2);
    expect(batch.find((i) => i.user_id === 2)?.delta).toBe(2);
    expect(a.points).toBe(2);

    // Simulate a failed RPC: pending goes back, points stay visible.
    engine.restoreBatch(batch);
    expect(a.points).toBe(2);
    expect(a.pendingDelta).toBe(2);
    expect(engine.pendingUsers).toBe(2);

    // A retry re-sends exactly the same deltas: no loss, no double count.
    expect(engine.drainBatch()).toEqual(batch);
    expect(a.points).toBe(2);
    expect(a.pendingDelta).toBe(0);
  });

  it('never double counts when a flush is retried', async () => {
    const a = await engine.ensure(0, 2, 'a');
    engine.award(a, ctx({ now: 0 }));
    engine.award(a, ctx({ now: 20_000, content: 'two' }));

    const first = engine.drainBatch();
    expect(first[0]!.delta).toBe(2);

    // Successful write: nothing pending, and a later award starts from 2.
    expect(engine.pendingUsers).toBe(0);
    engine.award(a, ctx({ now: 40_000, content: 'three' }));
    expect(engine.drainBatch()[0]!.delta).toBe(1);
    expect(a.points).toBe(3);
  });
});

describe('burst traffic — every message earns a point', () => {
  /** No cooldown and no duplicate window: every message counts. */
  const noLimit = () => ctx({ now: 0, cooldownMs: 0, duplicateWindowMs: 0 });

  it('awards 100 points for 100 messages from one user in the same instant', async () => {
    const s = await engine.ensure(0, 900, 'spammer');
    let awarded = 0;
    for (let i = 0; i < 100; i++) {
      // Identical timestamp for all 100: the worst case for a cooldown.
      if (engine.award(s, { ...noLimit(), content: `msg ${i}`, now: 5000 }).awarded) awarded++;
    }
    expect(awarded).toBe(100);
    expect(s.points).toBe(100);

    const batch = engine.drainBatch();
    expect(batch.length).toBe(1);
    expect(batch[0]!.delta).toBe(100);
    expect(batch[0]!.messages).toBe(100);
  });

  it('awards a point to 100 different users arriving at once', async () => {
    let awarded = 0;
    await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const s = await engine.ensure(0, 5000 + i, `user${i}`);
        if (engine.award(s, { ...noLimit(), username: `user${i}`, content: `hi ${i}` }).awarded) awarded++;
      }),
    );
    expect(awarded).toBe(100);

    const batch = engine.drainBatch();
    expect(batch.length).toBe(100);
    expect(batch.reduce((sum, b) => sum + b.delta, 0)).toBe(100);
  });

  it('does not lose points when a flush fails after the cache entry was evicted', async () => {
    const shortTtl = new PointsEngine(new RankStore(), 0);
    const s = await shortTtl.ensure(0, 9100, 'risky');
    shortTtl.award(s, { ...noLimit(), username: 'risky', content: 'one' });

    const batch = shortTtl.drainBatch();
    expect(batch[0]!.delta).toBe(1);

    // The entry vanishes while the RPC is in flight (TTL / eviction).
    shortTtl.drop(9100);
    shortTtl.restoreBatch(batch);

    // The retry must still carry the point.
    const retried = shortTtl.drainBatch();
    expect(retried.length).toBe(1);
    expect(retried[0]!.delta).toBe(1);
    expect(retried[0]!.username).toBe('risky');
  });

  it('still never awards points for a command', async () => {
    const s = await engine.ensure(0, 9200, 'cmder');
    const d = engine.award(s, { ...noLimit(), username: 'cmder', content: '!رتبة' });
    expect(d.awarded).toBe(false);
    if (!d.awarded) expect(d.reason).toBe('command');
  });

  it('still honours a cooldown when one is configured', async () => {
    const s = await engine.ensure(0, 9300, 'spammy');
    expect(engine.award(s, ctx({ now: 0 })).awarded).toBe(true);
    // Same instant, cooldown 10s -> blocked.
    expect(engine.award(s, ctx({ now: 0, content: 'two' })).awarded).toBe(false);
    // Past the window -> awarded again.
    expect(engine.award(s, ctx({ now: 11_000, content: 'three' })).awarded).toBe(true);
  });
});

describe('CooldownMap', () => {
  it('blocks until the window passes', () => {
    const c = new CooldownMap(5000);
    expect(c.take(1, 0)).toBe(true);
    expect(c.take(1, 4999)).toBe(false);
    expect(c.take(1, 5000)).toBe(true);
  });

  it('is per key', () => {
    const c = new CooldownMap(5000);
    expect(c.take(1, 0)).toBe(true);
    expect(c.take(2, 0)).toBe(true);
  });

  it('allows() does not consume the slot', () => {
    const c = new CooldownMap(5000);
    expect(c.allows(1, 0)).toBe(true);
    expect(c.allows(1, 0)).toBe(true);
    expect(c.take(1, 0)).toBe(true);
    expect(c.allows(1, 100)).toBe(false);
  });

  it('zero cooldown allows everything', () => {
    const c = new CooldownMap(0);
    expect(c.take(1, 0)).toBe(true);
    expect(c.take(1, 0)).toBe(true);
  });

  it('sweeps entries past the TTL', () => {
    const c = new CooldownMap(1000, 3);
    for (let i = 1; i <= 10; i++) c.take(i, 0);
    expect(c.size).toBeLessThanOrEqual(10);
    expect(c.take(1, 5000)).toBe(true);
  });
});