/**
 * Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª "ØªØ­Ø¯ÙŠ Ø±Ø§ÙŠØ³".
 *
 * Ø£Ù‡Ù… Ø´ÙŠ ÙÙŠÙ‡Ø§: Ù…Ø¶Ø§Ø¹ÙØ© Ø§Ù„ÙƒÙ„Ù…Ø© Ù…Ø§ ØªØ§Ø®Ø° Ø­Ù‚ ØºÙŠØ± Ø£ÙˆÙ„ Ù…Ø±Ø©. Ùˆ"Ù…Ø·Ø§Ø¨Ù‚Ø© Ø§Ù„ÙƒÙ„Ù…Ø©"
 * Ù…Ø§ ØªØ¨Ù„Ø¹ Ø£ÙŠ ÙƒÙ„Ù…Ø© Ø¨ØªØªÙ‡ÙŠ ÙÙŠÙ‡Ø§ Ø§Ù„Ø§Ø³Ù… (Ù„ÙˆÙ„Ø§ ÙƒØ°Ø§ "!Ø¯Ø®ÙˆÙ„" Ø¨ØªØ·Ø§Ø¨Ù‚ "!Ø¯Ø®ÙˆÙ„ØªÙŠ").
 */
import { describe, expect, it, vi } from 'vitest';
import { CHALLENGE_KEYWORDS, ChallengeState, matchesKeyword, pickKeyword } from '../src/core/challenge.js';
import type { ChallengeRow } from '../src/db/challenge.js';

const CH = 6095331;

function row(over: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: 7,
    channel_id: CH,
    challenger: 'ناصر',
    title: 'كأس الأبطال',
    chat_reward_kind: 'distribute',
    chat_reward_amount: 25,
    chat_reward_minutes: 0,
    penalty_kind: 'none',
    penalty_minutes: 0,
    status: 'running',
    winner: null,
    keyword: null,
    reward_kind: 'none',
    reward_amount: 0,
    reward_minutes: 0,
    note: '',
    started_at: new Date().toISOString(),
    ended_at: null,
    collected_at: null,
    applied_at: null,
    ...over,
  };
}

describe('pickKeyword', () => {
  it('always returns one of the four words', () => {
    for (let i = 0; i < 200; i++) {
      expect(CHALLENGE_KEYWORDS).toContain(pickKeyword() as never);
    }
  });

it('maps each bucket to a different word', () => {
    expect(pickKeyword(() => 0)).toBe(CHALLENGE_KEYWORDS[0]);
    expect(pickKeyword(() => 0.999)).toBe(CHALLENGE_KEYWORDS[CHALLENGE_KEYWORDS.length - 1]);
  });

  it('never returns undefined even at the upper edge', () => {
    expect(pickKeyword(() => 1)).toBeDefined();
  });
});

describe('matchesKeyword', () => {
  it('matches the word alone', () => {
    expect(matchesKeyword('!MT', '!MT')).toBe(true);
    expect(matchesKeyword('!Ø¯Ø®ÙˆÙ„', '!Ø¯Ø®ÙˆÙ„')).toBe(true);
  });

  it('ignores case for Latin words', () => {
    expect(matchesKeyword('!mt', '!MT')).toBe(true);
    expect(matchesKeyword('!Mt', '!MT')).toBe(true);
  });

  it('matches inside a sentence', () => {
    expect(matchesKeyword('ÙŠØ§ Ù†Ø§ØµØ± !MT Ø§Ù„Ø­ÙŠÙ†', '!MT')).toBe(true);
    expect(matchesKeyword('Ø®Ù„Ø§Øµ Ø¯Ø®Ù„Ù†Ø§ !Ø¯Ø®ÙˆÙ„', '!Ø¯Ø®ÙˆÙ„')).toBe(true);
  });

  it('trims whitespace around it', () => {
    expect(matchesKeyword('   !Ø¯Ø®ÙˆÙ„   ', '!Ø¯Ø®ÙˆÙ„')).toBe(true);
  });

  it('does NOT match a longer word that merely starts with it', () => {
    expect(matchesKeyword('!Ø¯Ø®ÙˆÙ„COME', '!Ø¯Ø®ÙˆÙ„')).toBe(false);
    expect(matchesKeyword('!Ø¯Ø®ÙˆÙ„ØªÙŠ', '!Ø¯Ø®ÙˆÙ„')).toBe(false);
  });

  it('does NOT match a different word', () => {
    expect(matchesKeyword('!PM', '!MT')).toBe(false);
    expect(matchesKeyword('Ù…Ø±Ø­Ø¨Ø§', '!Ø¯Ø®ÙˆÙ„')).toBe(false);
  });

  it('rejects an empty keyword', () => {
    expect(matchesKeyword('anything', '')).toBe(false);
  });
});

describe('ChallengeState â€” collecting', () => {
  function stateWith(ch: ChallengeRow | null) {
    const sent: string[] = [];
    const s = new ChallengeState({
      channelId: CH,
      send: (t) => sent.push(t),
      fetchActive: async () => ch,
    });
    return { s, sent };
  }

  it('announces the challenge as soon as it appears', async () => {
    const { s, sent } = stateWith(null);
    await s.refresh(); // nothing yet
    expect(sent).toHaveLength(0);

    (s as unknown as { opts: { fetchActive: () => Promise<ChallengeRow | null> } }).opts.fetchActive =
      async () => row({ status: 'running' });
    await s.refresh();
    expect(sent.some((t) => t.includes('ناصر'))).toBe(true);
    expect(s.snapshot().active).toBe(true);
  });

  it('puts the activity name in the announcement', async () => {
    const { s, sent } = stateWith(row({ status: 'running', title: 'كأس الأبطال' }));
    await s.refresh();
    expect(sent[0]).toContain('كأس الأبطال');
    expect(sent[0]).toContain('ناصر');
  });

  it('does not re-announce the same challenge on every poll', async () => {
    let ch: ChallengeRow | null = null;
    const sent: string[] = [];
    const s = new ChallengeState({ channelId: CH, send: (t) => sent.push(t), fetchActive: async () => ch });

    ch = row({ status: 'running', title: 'كأس الأبطال' });
    await s.refresh();
    await s.refresh();
    await s.refresh();
    // Announcement carries the title — check that, not the raw username.
    expect(sent.filter((t) => t.includes('كأس الأبطال'))).toHaveLength(1);
  });

  it('announces the keyword exactly once when it flips to collecting', async () => {
    let ch: ChallengeRow | null = row({ status: 'running' });
    const sent: string[] = [];
    const s = new ChallengeState({ channelId: CH, send: (t) => sent.push(t), fetchActive: async () => ch });

    await s.refresh();
    ch = row({ status: 'collecting', keyword: '!MT', winner: 'chat' });
    await s.refresh();
    await s.refresh();
    expect(sent.filter((t) => t.includes('!MT'))).toHaveLength(1);
  });

  it('counts a user once, no matter how many times they type it', async () => {
    const { s } = stateWith(row({ status: 'collecting', keyword: '!MT' }));
    await s.refresh();

    expect(await s.collect(1, 'ali')).toBe('first');
    expect(await s.collect(1, 'ali')).toBe('repeat');
    expect(await s.collect(1, 'ali')).toBe('repeat');
    expect(s.snapshot().collected).toBe(1);
  });

  it('counts different users separately', async () => {
    const { s } = stateWith(row({ status: 'collecting', keyword: '!MT' }));
    await s.refresh();
    await s.collect(1, 'ali');
    await s.collect(2, 'sara');
    await s.collect(3, 'omar');
    expect(s.snapshot().collected).toBe(3);
  });

  it('does not collect while the challenge is only running', async () => {
    const { s } = stateWith(row({ status: 'running' }));
    await s.refresh();
    expect(await s.collect(1, 'ali')).toBe('closed');
    expect(s.snapshot().collected).toBe(0);
  });

  it('does not collect when there is no challenge at all', async () => {
    const { s } = stateWith(null);
    await s.refresh();
    expect(await s.collect(1, 'ali')).toBe('closed');
  });

  it('recognises the keyword only while collecting', () => {
    const running = new ChallengeState({
      channelId: CH, send: () => {}, fetchActive: async () => row({ status: 'running', keyword: '!MT' }),
    });
    expect(running.isKeywordAttempt('!MT')).toBe(false);
  });

  it('stays silent in chat while people type the keyword', async () => {
    // 100 people type it. The bot must not say a word — the dashboard
    // counter is the only feedback, otherwise chat drowns in "✅ @x سجّل".
    const sent: string[] = [];
    const s = new ChallengeState({
      channelId: CH,
      send: (t) => sent.push(t),
      fetchActive: async () => row({ status: 'collecting', keyword: '!MT' }),
    });
    await s.refresh();
    sent.length = 0; // forget the keyword announcement itself

    for (let i = 1; i <= 100; i++) await s.collect(i, `user${i}`);

    expect(s.snapshot().collected).toBe(100);
    expect(sent, 'collecting must produce no chat output at all').toEqual([]);
  });

  it('forgets everything when the challenge ends', async () => {    let ch: ChallengeRow | null = row({ status: 'collecting', keyword: '!MT' });
    const s = new ChallengeState({ channelId: CH, send: () => {}, fetchActive: async () => ch });
    await s.refresh();
    await s.collect(1, 'ali');
    expect(s.snapshot().collected).toBe(1);

    ch = null;
    await s.refresh();
    expect(s.snapshot().active).toBe(false);
    expect(s.snapshot().collected).toBe(0);
    expect(await s.collect(2, 'sara')).toBe('closed');
  });

  it('starts a fresh count for a brand new challenge', async () => {
    let ch: ChallengeRow | null = row({ id: 1, status: 'collecting', keyword: '!MT' });
    const s = new ChallengeState({ channelId: CH, send: () => {}, fetchActive: async () => ch });
    await s.refresh();
    await s.collect(1, 'ali');

    // ØªØ­Ø¯ÙŠ Ø«ï¿½ï¿½Ù Ø¨Ù†ÙØ³ Ø§Ù„ÙƒÙ„Ù…Ø© â€” Ø§Ù„ÙˆØ§Ø­Ø¯ Ø§Ù„Ø£ÙˆÙ„ Ù…Ø§ ÙŠÙ†Ø­Ø³Ø¨ Ù…Ø±ØªÙŠÙ†.
    ch = row({ id: 2, status: 'collecting', keyword: '!MT' });
    await s.refresh();
    expect(await s.collect(1, 'ali')).toBe('first');
    expect(s.snapshot().collected).toBe(1);
  });
});

describe('ChallengeState — adaptive polling (saves Supabase logs)', () => {
  it('polls slow while quiet, fast while a challenge runs', async () => {
    vi.useFakeTimers();
    try {
      let ch: ChallengeRow | null = null;
      let polls = 0;
      const s = new ChallengeState({
        channelId: CH,
        send: () => {},
        fetchActive: async () => {
          polls++;
          return ch;
        },
      });

      // activeMs=100, idleMs=5000. First tick runs immediately.
      s.startRefresh(100, 5000);
      await vi.advanceTimersByTimeAsync(0);
      expect(polls).toBe(1);

      // Quiet: next poll only after the idle delay.
      await vi.advanceTimersByTimeAsync(4999);
      expect(polls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(polls).toBe(2);

      // A challenge appears: the loop switches to the fast delay.
      ch = row({ status: 'running' });
      await vi.advanceTimersByTimeAsync(5000);
      const afterSwitch = polls;
      expect(afterSwitch).toBeGreaterThan(2);

      // Now every 100ms (fast) instead of 5000ms.
      await vi.advanceTimersByTimeAsync(100);
      expect(polls).toBe(afterSwitch + 1);

      s.stopRefresh();
      const frozen = polls;
      await vi.advanceTimersByTimeAsync(60000);
      expect(polls).toBe(frozen);
    } finally {
      vi.useRealTimers();
    }
  });
});