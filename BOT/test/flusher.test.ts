import { describe, expect, it, vi } from 'vitest';
import { PointsEngine } from '../src/core/points.js';
import { RankStore } from '../src/core/ranks.js';
import { ChatSender, fitToKickLimits } from '../src/core/sender.js';
import { Flusher } from '../src/core/flusher.js';
import { applyPoints } from '../src/db/repo.js';

vi.mock('../src/db/repo.js', async () => {
  const actual = await vi.importActual<typeof import('../src/db/repo.js')>('../src/db/repo.js');
  return { ...actual, applyPoints: vi.fn() };
});

vi.mock('../src/kick/api.js', () => ({
  sendChatMessage: vi.fn(async () => ({ is_sent: true, message_id: 'x' })),
  KickApiError: class KickApiError extends Error {},
  backoffDelay: vi.fn(async () => undefined),
}));

vi.mock('../src/kick/oauth.js', () => ({
  tokenManager: { accessToken: vi.fn(async () => 'token') },
}));

const ranks = new RankStore();

function makeFlusher(engine: PointsEngine) {
  return new Flusher({
    channelId: 7,
    engine,
    ranks,
    intervalMs: 1000,
    onRankUps: () => undefined,
  });
}

const awardCtx = (over: Record<string, unknown> = {}) => ({
  username: 'ahmed',
  content: 'hello there',
  now: 0,
  ignored: new Set<string>(),
  selfUserIds: new Set<number>(),
  commandPrefix: '!',
  cooldownMs: 10_000,
  duplicateWindowMs: 60_000,
  minLength: 2,
  ...over,
});

describe('Flusher', () => {
  it('sends one batched RPC and clears the pending counters', async () => {
    (applyPoints as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const engine = new PointsEngine(ranks, 60_000);
    const state = await engine.ensure(7, 42, 'ahmed');
    engine.award(state, awardCtx());

    const flusher = makeFlusher(engine);
    await flusher.flush();

    expect(applyPoints).toHaveBeenCalledTimes(1);
    const [channelId, batch] = (applyPoints as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(channelId).toBe(7);
    expect(batch).toEqual([{ user_id: 42, username: 'ahmed', delta: 1, messages: 1 }]);
    expect(engine.pendingUsers).toBe(0);
    expect(state.points).toBe(1);
  });

  it('keeps the points in memory and retries when the RPC fails', async () => {
    (applyPoints as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const engine = new PointsEngine(ranks, 60_000);
    const state = await engine.ensure(7, 43, 'ali');
    engine.award(state, awardCtx());

    const flusher = makeFlusher(engine);
    await flusher.flush();

    // The viewer keeps their point (memory = database + pending) and the batch
    // is queued again for the next tick.
    expect(state.points).toBe(1);
    expect(state.pendingDelta).toBe(1);
    expect(engine.pendingUsers).toBe(1);
    expect(flusher.status).toBe('error');

    // Retry: this time it succeeds and the point lands exactly once.
    (applyPoints as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await flusher.flush();

    expect(state.points).toBe(1);
    expect(engine.pendingUsers).toBe(0);
    expect(flusher.status).toBe('ok');
    expect(flusher.lastFlush).not.toBeNull();
  });

  it('does nothing when there is nothing pending', async () => {
    (applyPoints as unknown as ReturnType<typeof vi.fn>).mockClear();
    const engine = new PointsEngine(ranks, 60_000);
    await makeFlusher(engine).flush();
    expect(applyPoints).not.toHaveBeenCalled();
  });

  it('reports rank changes returned by the database', async () => {
    const rows = [
      { kick_user_id: 42, username: 'ahmed', points: 100, message_count: 100, rank_idx: 2, prev_rank: 1 },
    ];
    (applyPoints as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
    const engine = new PointsEngine(ranks, 60_000);
    const state = await engine.ensure(7, 42, 'ahmed');
    engine.award(state, awardCtx());

    const onRankUps = vi.fn();
    const flusher = new Flusher({
      channelId: 7,
      engine,
      ranks,
      intervalMs: 1000,
      onRankUps,
    });
    await flusher.flush();
    expect(onRankUps).toHaveBeenCalledWith(rows);
  });
});

describe('ChatSender', () => {
  it('keeps the queue bounded and drops the oldest low-priority message', async () => {
    const sender = new ChatSender({ broadcasterUserId: 1, intervalMs: 1, maxSize: 5 });
    for (let i = 0; i < 20; i++) sender.send(`low ${i}`, 'low');

    // The queue never exceeds maxSize.
    expect(sender.length).toBeLessThanOrEqual(5);
    expect(sender.stats.dropped).toBeGreaterThan(0);
  });

  it('flattens newlines and respects the byte limit', () => {
    expect(fitToKickLimits('a\nb')).toBe('a b');
    const heavy = fitToKickLimits('ا'.repeat(3000));
    expect(Buffer.byteLength(heavy, 'utf8')).toBeLessThanOrEqual(2048);
  });

  it('ignores empty messages', () => {
    const sender = new ChatSender({ broadcasterUserId: 1, intervalMs: 1 });
    sender.send('');
    expect(sender.length).toBe(0);
  });
});