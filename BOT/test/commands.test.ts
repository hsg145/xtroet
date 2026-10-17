import { describe, expect, it, vi } from 'vitest';
import { Commands, normalizeArabic, parseCommand, parseTarget, COMMAND_ALIASES } from '../src/core/commands.js';
import type { ChatSender } from '../src/core/sender.js';
import { CooldownMap } from '../src/core/cooldown.js';
import type { LiveGate } from '../src/core/livestate.js';
import type { PointsEngine } from '../src/core/points.js';
import type { RankStore } from '../src/core/ranks.js';
import type { NormalizedMessage } from '../src/kick/types.js';

describe('normalizeArabic', () => {
  it('strips tashkeel', () => {
    expect(normalizeArabic('رَتَبَة')).toBe('رتبه');
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
  });

  it('strips tatweel', () => {
    expect(normalizeArabic('رتـــبة')).toBe('رتبه');
  });

  it('folds alef variants', () => {
    expect(normalizeArabic('أ')).toBe(normalizeArabic('ا'));
    expect(normalizeArabic('إ')).toBe(normalizeArabic('ا'));
    expect(normalizeArabic('آ')).toBe(normalizeArabic('ا'));
  });

  it('folds alef maqsura to ya and ta marbuta to ha', () => {
    expect(normalizeArabic('مصطفى')).toBe(normalizeArabic('مصطفي'));
    expect(normalizeArabic('رتبة')).toBe('رتبه');
  });

  it('lowercases and trims', () => {
    expect(normalizeArabic('  TOP  ')).toBe('top');
    expect(normalizeArabic('Rank')).toBe('rank');
  });
});

describe('command aliases', () => {
  const parse = (input: string) => parseCommand(input, '!', COMMAND_ALIASES);

  it('maps !رتبتي to the rank command (the primary spelling)', () => {
    expect(COMMAND_ALIASES['رتبتي']).toBe('rank');
    for (const input of ['!رتبتي', '!رتبتي  ', ' !رتبتي']) {
      expect(parse(input)?.name, input).toBe('rank');
    }
  });

  it('does not confuse !رتب (ladder) with !رتبتي (own rank)', () => {
    expect(parse('!رتبتي')?.name).toBe('rank');
    expect(parse('!رتب')?.name).toBe('ranks');
  });

it('matches !رتبتي and rejects the removed !رتبة form', () => {
    for (const input of ['!رتبتي', '!رتبتيك', '!رتبتي  ', ' !رتبتي']) {
      expect(parse(input)?.name, input).toBe('rank');
    }
    // The short form was removed on purpose.
    expect(parse('!رتبة')?.name).toBe('unknown');
  });

  it('matches !توب and its aliases', () => {
    for (const input of ['!توب', '!Top', '!TOP', '!top', '!المتصدرين', '!المتصدرون']) {
      expect(parse(input)?.name, input).toBe('top');
    }
  });

  it('matches the ranks list command', () => {
    for (const input of ['!رتب', '!ranks', '!الرتب']) {
      expect(parse(input)?.name, input).toBe('ranks');
    }
  });

  it('matches admin commands and their Arabic aliases', () => {
    expect(parse('!addpts foo 50')?.name).toBe('addpts');
    expect(parse('!اضافة foo 50')?.name).toBe('addpts');
    expect(parse('!setpts foo 50')?.name).toBe('setpts');
    expect(parse('!تعيين foo 50')?.name).toBe('setpts');
    expect(parse('!resetuser foo')?.name).toBe('resetuser');
    expect(parse('!تصفير foo')?.name).toBe('resetuser');
    expect(parse('!ranksbot')?.name).toBe('status');
  });

  it('keeps arguments separate', () => {
    const m = parse('!رتبتي @someone');
    expect(m?.name).toBe('rank');
    expect(m?.args).toEqual(['@someone']);
  });

  it('reports unknown commands without throwing', () => {
    const m = parse('!نقاط');
    expect(m?.name).toBe('unknown');
  });

  it('never registers !نقاط or !points (BotRix owns them)', () => {
    expect(COMMAND_ALIASES['نقاط']).toBeUndefined();
    expect(COMMAND_ALIASES['نقاط ']).toBeUndefined();
    expect(COMMAND_ALIASES.points).toBeUndefined();
    expect(parse('!نقاط')?.name).toBe('unknown');
    expect(parse('!points')?.name).toBe('unknown');
  });

  it('registers !نقاطي ("my points") as the rank command', () => {
    expect(COMMAND_ALIASES['نقاطي']).toBe('rank');
    for (const input of ['!نقاطي', '!نقاطي  ', ' !نقاطي', '!نقاطى']) {
      expect(parse(input)?.name, input).toBe('rank');
    }
  });

  it('keeps !نقاط (BotRix) and !نقاطي (ours) apart', () => {
    // They differ by one letter, so the shorter form must NOT swallow ours.
    expect(parse('!نقاط')?.name).toBe('unknown');
    expect(parse('!نقاطي')?.name).toBe('rank');
  });

  it('ignores messages without the prefix', () => {
    expect(parse('مرحبا')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('!')).toBeNull();
  });

  it('respects a custom prefix', () => {
    expect(parseCommand('.رتبتي', '.', COMMAND_ALIASES)?.name).toBe('rank');
    expect(parseCommand('!رتبتي', '.', COMMAND_ALIASES)).toBeNull();
  });
});

describe('parseTarget', () => {
  it('strips @ and normalizes', () => {
    expect(parseTarget('@Ahmed')).toBe('ahmed');
    expect(parseTarget('  @مصطفى ')).toBe('مصطفي');
  });

  it('returns null for empty input', () => {
    expect(parseTarget(undefined)).toBeNull();
    expect(parseTarget('  @  ')).toBeNull();
  });
});

/**
 * The live-only notice used to follow EVERY `!رتبتي`, and a channel where people
 * ask for their rank constantly turned into a wall of identical messages. It is
 * now a reminder, at most once per LIVE_NOTICE_INTERVAL_MS.
 */
describe('live-only notice throttling', () => {
  function build(intervalMs: number) {
    const sent: string[] = [];
    const deps = {
      channelId: 6095331,
      broadcasterUserId: 6095331,
      engine: {
        ensure: vi.fn(async (_c: number, _u: number, username: string) => ({ username, points: 0 })),
      } as unknown as PointsEngine,
      ranks: { all: () => [{ idx: 1, key: 'cadet', name_ar: 'كاديت', name_en: 'Cadet', emoji: '▪️', min_points: 0 }] } as unknown as RankStore,
      sender: { send: (t: string) => sent.push(t) } as unknown as ChatSender,
      live: { allowsAward: () => ({ allowed: true, reason: 'live' }) } as unknown as LiveGate,
      statusInfo: () => ({
        uptime: '0s',
        queue: 0,
        pending: 0,
        lastFlush: 'لم',
        lastEvent: 'لم',
        subscriptionOk: true,
      }),
    };
    const commands = new Commands(deps);
    const inner = commands as unknown as {
      e: { LIVE_NOTICE_INTERVAL_MS: number };
      deps: { live: LiveGate };
      userCooldown: unknown;
      globalCooldown: unknown;
    };
    // The interval is read from the cached env, so patch it per test.
    inner.e.LIVE_NOTICE_INTERVAL_MS = intervalMs;
    // The per-user and global command cooldowns would swallow most of the
    // commands in this test; they are not what is under test here.
    inner.userCooldown = new CooldownMap(0);
    inner.globalCooldown = new CooldownMap(0);
    return { commands, sent };
  }

  const msg = (id: number) =>
    ({ messageId: `m${id}`, userId: id, username: `user${id}`, content: '!رتبتي' }) as NormalizedMessage;

  it('sends it once, not once per command', async () => {
    const { commands, sent } = build(3_600_000);
    for (let i = 1; i <= 5; i++) await commands.handle(msg(i));
    const notices = sent.filter((t) => t.includes('النقاط فقط تنحسب'));
    expect(notices).toHaveLength(1);
    // ...while the rank card itself still answers every time.
    expect(sent.length).toBeGreaterThanOrEqual(5);
  });

  it('sends it again once the hour is up', async () => {
    const { commands, sent } = build(0);
    await commands.handle(msg(1));
    await commands.handle(msg(2));
    // Interval 0 = the old behaviour, restored for anyone who wants it.
    expect(sent.filter((t) => t.includes('النقاط فقط تنحسب'))).toHaveLength(2);
  });

  it('never sends it while the broadcast is not the reason', async () => {
    const { commands, sent } = build(3_600_000);
    (commands as unknown as { deps: { live: LiveGate } }).deps.live = {
      allowsAward: () => ({ allowed: false, reason: 'offline' }),
    } as unknown as LiveGate;
    await commands.handle(msg(1));
    expect(sent.filter((t) => t.includes('النقاط فقط تنحسب'))).toHaveLength(0);
  });
});