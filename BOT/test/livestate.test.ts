/**
 * اختبارات بوابة البث — أهم ملف في المشروع من ناحية النزاهة.
 *
 * كل حالة هنا تمثل محاولة كسب نقاط بدون بث حقيقي، ولازم البوابة ترفضها.
 * ما في شبكة: كل الفحوصات تمر عبر applyEvaluation بنتيجة جاهزة.
 */
import { describe, expect, it, vi } from 'vitest';
import { evaluateStream, LiveGate, parseStartTime, type StreamEvaluation } from '../src/core/livestate.js';

const CH = 6095331;

/** يبني استجابة كيك بحالة بث محددة. */
function payload(stream: Record<string, unknown>, broadcaster = CH) {
  return { broadcaster_user_id: broadcaster, slug: 'xtroet', stream };
}

/** بث حيّ كامل الأدلة — الحالة اللي لازم تفتح البوابة. */
const STREAM_ON = {
  url: 'https://…/live.m3u8',
  key: 'abc123',
  is_live: true,
  start_time: '2026-10-11T15:00:00Z',
  viewer_count: 42,
};

/** البث مقفول — ما يرد Start بالشكل اللي يخلي البوابة تنحل. */
const STREAM_OFF = {
  url: '',
  key: '',
  is_live: false,
  is_mature: false,
  language: '',
  start_time: '0001-01-01T00:00:00Z',
  viewer_count: 0,
  thumbnail: '',
};

function gateWith(opts: Partial<{ required: boolean; confirmChecks: number; maxStaleMs: number; offlineGraceMs: number }> = {}) {
  return new LiveGate({
    probe: async () => null,
    slug: 'xtroet',
    channelId: () => CH,
    required: opts.required ?? true,
    pollMs: 60_000,
    maxStaleMs: opts.maxStaleMs ?? 90_000,
    offlineGraceMs: opts.offlineGraceMs ?? 30_000,
    confirmChecks: opts.confirmChecks ?? 2,
  });
}

const open = (g: LiveGate, now: number) =>
  g.applyEvaluation(evaluateStream(payload(STREAM_ON), CH), now);
const close = (g: LiveGate, now: number) =>
  g.applyEvaluation(evaluateStream(payload(STREAM_OFF), CH), now);

describe('parseStartTime', () => {
  it('rejects Kick\'s zero date (what an offline stream returns)', () => {
    expect(parseStartTime('0001-01-01T00:00:00Z')).toBeNull();
    expect(parseStartTime('')).toBeNull();
    expect(parseStartTime(null)).toBeNull();
    expect(parseStartTime('not-a-date')).toBeNull();
  });

  it('accepts a real start time', () => {
    expect(parseStartTime('2026-10-11T15:00:00Z')).toBe(Date.parse('2026-10-11T15:00:00Z'));
  });
});

describe('evaluateStream', () => {
  it('calls a complete broadcast live-strong', () => {
    const ev = evaluateStream(payload(STREAM_ON), CH);
    expect(ev.verdict).toBe('live-strong');
    expect(ev.startedAt).toBe(Date.parse('2026-10-11T15:00:00Z'));
    expect(ev.viewerCount).toBe(42);
    expect(ev.sessionKey).toContain('abc123');
  });

  it('calls an offline stream offline, NOT live', () => {
    // The exact shape Kick returns when nobody is broadcasting.
    expect(evaluateStream(payload(STREAM_OFF), CH).verdict).toBe('offline');
  });

  it('refuses is_live=true when start_time is the zero date', () => {
    // A "live" stream with no real start time is the classic fake broadcast.
    const ev = evaluateStream(
      payload({ ...STREAM_ON, start_time: '0001-01-01T00:00:00Z' }),
      CH,
    );
    expect(ev.verdict).toBe('offline');
  });

  it('refuses is_live=true when the playback url is missing', () => {
    const ev = evaluateStream(payload({ ...STREAM_ON, url: '' }), CH);
    expect(ev.verdict).toBe('live-weak');
    expect(ev.reason).toContain('url');
  });

  it('refuses is_live=true when the stream key is missing', () => {
    const ev = evaluateStream(payload({ ...STREAM_ON, key: '' }), CH);
    expect(ev.verdict).toBe('live-weak');
    expect(ev.reason).toContain('key');
  });

  it('does not accept a truthy non-boolean is_live', () => {
    for (const v of ['true', 1, 'yes']) {
      expect(evaluateStream(payload({ ...STREAM_ON, is_live: v }), CH).verdict).toBe('offline');
    }
  });

  it('rejects a broadcast belonging to a different channel', () => {
    const ev = evaluateStream(payload(STREAM_ON, 999), CH);
    expect(ev.verdict).toBe('wrong-channel');
  });

  it('rejects a response with no stream object at all', () => {
    expect(evaluateStream({ broadcaster_user_id: CH, slug: 'xtroet' }, CH).verdict).toBe('no-stream');
    expect(evaluateStream(null, CH).verdict).toBe('no-stream');
  });
});

describe('LiveGate — the no-broadcast, no-points rule', () => {
  const T0 = 1_760_000_000_000;

  it('awards nothing before the very first check (fail-closed on boot)', () => {
    const g = gateWith();
    const v = g.allowsAward(T0);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('offline');
  });

  it('awards nothing while no one is broadcasting', () => {
    const g = gateWith();
    close(g, T0);
    expect(g.allowsAward(T0).allowed).toBe(false);
  });

  it('awards once a broadcast is verified', () => {
    const g = gateWith();
    open(g, T0);
    expect(g.allowsAward(T0).allowed).toBe(true);
  });

  it('stops awarding the moment the broadcast is confirmed ended', () => {
    const g = gateWith({ offlineGraceMs: 0 });
    open(g, T0);
    close(g, T0 + 1_000);
    expect(g.allowsAward(T0 + 1_000).allowed).toBe(false);
  });

  it('needs a weak signal twice before believing it', () => {
    const g = gateWith({ confirmChecks: 2 });
    const weak = (): StreamEvaluation =>
      evaluateStream(payload({ ...STREAM_ON, url: '' }), CH);

    g.applyEvaluation(weak(), T0);
    expect(g.allowsAward(T0).allowed, 'first weak signal must not open the gate').toBe(false);

    g.applyEvaluation(weak(), T0 + 20_000);
    expect(g.allowsAward(T0 + 20_000).allowed, 'second consecutive weak signal opens it').toBe(true);
  });

  it('resets the confirmation counter when the weak signal breaks', () => {
    const g = gateWith({ confirmChecks: 2 });
    const weak = (): StreamEvaluation => evaluateStream(payload({ ...STREAM_ON, url: '' }), CH);

    g.applyEvaluation(weak(), T0);
    close(g, T0 + 10_000); // broadcast breaks the chain
    g.applyEvaluation(weak(), T0 + 20_000);
    expect(g.allowsAward(T0 + 20_000).allowed).toBe(false);
    expect(g.snapshot().pendingConfirm).toBe(1);
  });

  it('survives one lost poll thanks to the offline grace period', () => {
    const g = gateWith({ offlineGraceMs: 30_000 });
    open(g, T0);
    close(g, T0 + 20_000); // Kick briefly says offline
    expect(g.allowsAward(T0 + 20_000).allowed, 'a single blip must not cut people off').toBe(true);
  });

  it('closes for good once the grace period expires', () => {
    const g = gateWith({ offlineGraceMs: 30_000 });
    open(g, T0);
    close(g, T0 + 31_000);
    expect(g.allowsAward(T0 + 31_000).allowed).toBe(false);
  });

  it('closes when the verified verdict goes stale', () => {
    const g = gateWith({ maxStaleMs: 90_000 });
    open(g, T0);
    // No polls succeeded after this — the answer is no longer trustworthy.
    expect(g.allowsAward(T0 + 90_001).allowed).toBe(false);
    expect(g.allowsAward(T0 + 90_001).reason).toBe('stale');
  });

  it('keeps awarding while polls keep succeeding', () => {
    const g = gateWith({ maxStaleMs: 90_000 });
    open(g, T0);
    for (let t = 20_000; t <= 400_000; t += 20_000) open(g, T0 + t);
    expect(g.allowsAward(T0 + 400_000).allowed).toBe(true);
  });
});

describe('LiveGate — network failures', () => {
  const T0 = 1_760_000_000_000;

  it('keeps the last verified state while Kick is unreachable', async () => {
    const g = new LiveGate({
      probe: async () => { throw new Error('network down'); },
      slug: 'xtroet',
      channelId: () => CH,
      required: true,
      pollMs: 60_000,
      maxStaleMs: 90_000,
      offlineGraceMs: 30_000,
      confirmChecks: 2,
    });

    open(g, T0);
    await g.pollOnce();
    expect(g.snapshot().pollsFailed).toBe(1);
    expect(g.allowsAward(T0 + 1_000).allowed, 'one failed poll is not enough to stop everyone').toBe(true);
  });

  it('closes anyway once the state goes stale', async () => {
    const g = new LiveGate({
      probe: async () => { throw new Error('network down'); },
      slug: 'xtroet',
      channelId: () => CH,
      required: true,
      pollMs: 60_000,
      maxStaleMs: 90_000,
      offlineGraceMs: 30_000,
      confirmChecks: 2,
    });

    open(g, T0);
    await g.pollOnce();
    expect(g.allowsAward(T0 + 90_001).allowed, 'an old unverified answer must never keep paying out').toBe(false);
  });

  it('closes when the channel cannot be resolved yet', () => {
    const g = new LiveGate({
      probe: async () => null,
      slug: 'xtroet',
      channelId: () => 0,
      required: true,
      pollMs: 60_000,
      maxStaleMs: 90_000,
      offlineGraceMs: 0,
      confirmChecks: 1,
    });
    expect(g.allowsAward(Date.now())).toEqual({ allowed: false, reason: 'no-channel' });
  });

  it('never lets a poll throw', async () => {
    const g = new LiveGate({
      probe: async () => { throw new Error('boom'); },
      slug: 'xtroet',
      channelId: () => CH,
      required: true,
      pollMs: 60_000,
      maxStaleMs: 90_000,
      offlineGraceMs: 0,
      confirmChecks: 1,
    });
    await expect(g.pollOnce()).resolves.toBeUndefined();
  });
});

describe('LiveGate — change notifications', () => {
  const T0 = 1_760_000_000_000;

  it('fires exactly once per broadcast start', () => {
    // grace 0 so the close below is an immediate, unambiguous transition.
    const g = gateWith({ confirmChecks: 1, offlineGraceMs: 0 });
    const changes: boolean[] = [];
    g.onChange((snap) => changes.push(snap.live));

    open(g, T0);
    open(g, T0 + 20_000);
    open(g, T0 + 40_000);
    expect(changes, 're-checking the same live stream must not re-announce it').toEqual([true]);

    close(g, T0 + 60_000);
    expect(changes).toEqual([true, false]);
  });

  it('does not announce the end while the grace period holds the gate open', () => {
    const g = gateWith({ confirmChecks: 1, offlineGraceMs: 30_000 });
    const changes: boolean[] = [];
    g.onChange((snap) => changes.push(snap.live));

    open(g, T0);
    close(g, T0 + 10_000);
    expect(changes, 'a single blip is absorbed, not announced as an end').toEqual([true]);

    close(g, T0 + 45_000);
    expect(changes).toEqual([true, false]);
  });

  it('a listener that throws does not break the gate', () => {
    const g = gateWith();
    g.onChange(() => { throw new Error('bad listener'); });
    expect(() => open(g, Date.now())).not.toThrow();
    expect(g.allowsAward(Date.now()).allowed).toBe(true);
  });
});

describe('LiveGate — maintenance switch', () => {
  it('LIVE_REQUIRED=false always allows (owner override)', () => {
    const g = gateWith({ required: false });
    const v = g.allowsAward(Date.now());
    expect(v).toEqual({ allowed: true, reason: 'disabled' });
  });

  it('is closed by default, so a missing flag cannot silently open it', () => {
    // Guard against someone dropping LIVE_REQUIRED from the .env by accident:
    // the zod default in config.ts is true, so the gate is armed.
    const g = gateWith();
    expect(g.snapshot().required).toBe(true);
    expect(g.allowsAward(Date.now()).allowed).toBe(false);
  });
});

describe('LiveGate — polling lifecycle', () => {
  it('shares one in-flight poll between concurrent callers', async () => {
    let calls = 0;
    const g = new LiveGate({
      probe: async () => {
        calls += 1;
        return payload(STREAM_ON);
      },
      slug: 'xtroet',
      channelId: () => CH,
      required: true,
      pollMs: 60_000,
      maxStaleMs: 90_000,
      offlineGraceMs: 0,
      confirmChecks: 1,
    });
    await Promise.all([g.pollOnce(), g.pollOnce(), g.pollOnce()]);
    expect(calls, 'three concurrent polls must hit Kick once').toBe(1);
    expect(g.snapshot().pollsOk).toBe(1);
  });

  it('start/stop toggle the interval', () => {
    vi.useFakeTimers();
    const g = new LiveGate({
      probe: async () => payload(STREAM_ON),
      slug: 'xtroet',
      channelId: () => CH,
      required: true,
      pollMs: 20_000,
      maxStaleMs: 90_000,
      offlineGraceMs: 0,
      confirmChecks: 1,
    });
    g.start();
    expect(g.isRunning).toBe(true);
    g.start(); // must be idempotent
    g.stop();
    expect(g.isRunning).toBe(false);
    vi.useRealTimers();
  });
});