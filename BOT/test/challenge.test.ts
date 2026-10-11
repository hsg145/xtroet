/**
 * اختبارات "تحدي رايس".
 *
 * أهم شي فيها: مضاعفة الكلمة ما تاخذ حق غير أول مرة. و"مطابقة الكلمة"
 * ما تبلع أي كلمة بتتهي فيها الاسم (لولا كذا "!دخول" بتطابق "!دخولتي").
 */
import { describe, expect, it } from 'vitest';
import { CHALLENGE_KEYWORDS, ChallengeState, matchesKeyword, pickKeyword } from '../src/core/challenge.js';
import type { ChallengeRow } from '../src/db/challenge.js';

const CH = 6095331;

function row(over: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: 7,
    channel_id: CH,
    challenger: 'xtroet',
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
    // 0 → first, 0.5 → middle, 0.999 → last.
    expect(pickKeyword(() => 0)).toBe('!MT');
    expect(pickKeyword(() => 0.999)).toBe('!دخول');
  });

  it('never returns undefined even at the upper edge', () => {
    expect(pickKeyword(() => 1)).toBeDefined();
  });
});

describe('matchesKeyword', () => {
  it('matches the word alone', () => {
    expect(matchesKeyword('!MT', '!MT')).toBe(true);
    expect(matchesKeyword('!دخول', '!دخول')).toBe(true);
  });

  it('ignores case for Latin words', () => {
    expect(matchesKeyword('!mt', '!MT')).toBe(true);
    expect(matchesKeyword('!Mt', '!MT')).toBe(true);
  });

  it('matches inside a sentence', () => {
    expect(matchesKeyword('يا ناصر !MT الحين', '!MT')).toBe(true);
    expect(matchesKeyword('خلاص دخلنا !دخول', '!دخول')).toBe(true);
  });

  it('trims whitespace around it', () => {
    expect(matchesKeyword('   !دخول   ', '!دخول')).toBe(true);
  });

  it('does NOT match a longer word that merely starts with it', () => {
    expect(matchesKeyword('!دخولCOME', '!دخول')).toBe(false);
    expect(matchesKeyword('!دخولتي', '!دخول')).toBe(false);
  });

  it('does NOT match a different word', () => {
    expect(matchesKeyword('!PM', '!MT')).toBe(false);
    expect(matchesKeyword('مرحبا', '!دخول')).toBe(false);
  });

  it('rejects an empty keyword', () => {
    expect(matchesKeyword('anything', '')).toBe(false);
  });
});

describe('ChallengeState — collecting', () => {
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
    expect(sent.some((t) => t.includes('xtroet'))).toBe(true);
    expect(s.snapshot().active).toBe(true);
  });

  it('does not re-announce the same challenge on every poll', async () => {
    let ch: ChallengeRow | null = null;
    const sent: string[] = [];
    const s = new ChallengeState({ channelId: CH, send: (t) => sent.push(t), fetchActive: async () => ch });

    ch = row({ status: 'running' });
    await s.refresh();
    await s.refresh();
    await s.refresh();
    expect(sent.filter((t) => t.includes('xtroet'))).toHaveLength(1);
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

  it('forgets everything when the challenge ends', async () => {
    let ch: ChallengeRow | null = row({ status: 'collecting', keyword: '!MT' });
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

    // تحدي ث��ٍ بنفس الكلمة — الواحد الأول ما ينحسب مرتين.
    ch = row({ id: 2, status: 'collecting', keyword: '!MT' });
    await s.refresh();
    expect(await s.collect(1, 'ali')).toBe('first');
    expect(s.snapshot().collected).toBe(1);
  });
});