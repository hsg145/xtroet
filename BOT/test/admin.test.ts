import { describe, expect, it } from 'vitest';
import { promoForTest, type PromoDecision } from '../src/core/admin-state.js';
import { PointsEngine, type AwardContext } from '../src/core/points.js';
import { RankStore } from '../src/core/ranks.js';

const ranks = new RankStore();

const ctx = (over: Partial<AwardContext> = {}): AwardContext => ({
  username: 'ahmed',
  content: 'hello world',
  now: 1_000_000,
  channelId: 7,
  ignored: new Set(),
  selfUserIds: new Set(),
  commandPrefix: '!',
  cooldownMs: 0,
  duplicateWindowMs: 60_000,
  minLength: 2,
  ...over,
});

async function freshEngine() {
  const engine = new PointsEngine(new RankStore(), 60 * 60 * 1000);
  const s = await engine.ensure(7, 42, 'ahmed');
  return { engine, s };
}

describe('dashboard promos in the points engine', () => {
  it('a muted user earns nothing (timeout works on anyone)', async () => {
    const { engine, s } = await freshEngine();
    const d = engine.award(s, ctx({ promo: promoForTest({ muted: true }) }));
    expect(d.awarded).toBe(false);
    if (!d.awarded) expect(d.reason).toBe('muted');
    expect(s.points).toBe(0);
    expect(s.pendingDelta).toBe(0);
  });

  it('a frozen user (multiplier 0) earns nothing', async () => {
    const { engine, s } = await freshEngine();
    const d = engine.award(s, ctx({ promo: promoForTest({ userMult: 0 }) }));
    expect(d.awarded).toBe(false);
    if (!d.awarded) expect(d.reason).toBe('frozen');
    expect(s.points).toBe(0);
  });

  it('a double event awards two points per message', async () => {
    const { engine, s } = await freshEngine();
    const d = engine.award(s, ctx({ promo: promoForTest({ eventMult: 2 }) }));
    expect(d.awarded).toBe(true);
    expect(s.points).toBe(2);
    expect(s.pendingDelta).toBe(2);
  });

  it('a per-user boost stacks on the event', async () => {
    const { engine, s } = await freshEngine();
    const d = engine.award(s, ctx({ promo: promoForTest({ eventMult: 2, userMult: 3 }) }));
    expect(d.awarded).toBe(true);
    expect(s.points).toBe(6);
  });

  it('half-point sabotage is exact over time (0,1,0,1…)', async () => {
    const { engine, s } = await freshEngine();
    const promo = promoForTest({ eventMult: 0.5 });
    const totals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const d = engine.award(s, ctx({ content: `msg ${i}`, promo }));
      expect(d.awarded).toBe(true);
      totals.push(s.points);
    }
    expect(totals).toEqual([0, 1, 1, 2]);
  });

  it('a drop-code bonus bypasses the duplicate rule but still counts', async () => {
    const { engine, s } = await freshEngine();
    const promo = (): PromoDecision => ({ muted: false, frozen: false, delta: 1, bonus: 10, dropWord: 'codeword' });
    const first = engine.award(s, ctx({ content: 'codeword', promo }));
    expect(first.awarded).toBe(true);
    const second = engine.award(s, ctx({ content: 'codeword', promo }));
    expect(second.awarded).toBe(true);
    expect(s.points).toBe(22);
    if (second.awarded) expect(second.note).toBe('drop:codeword');
  });

  it('no promo hook means plain +1 point (backwards compatible)', async () => {
    const { engine, s } = await freshEngine();
    const d = engine.award(s, ctx({ promo: undefined, channelId: undefined }));
    expect(d.awarded).toBe(true);
    expect(s.points).toBe(1);
  });
});

void ranks;
