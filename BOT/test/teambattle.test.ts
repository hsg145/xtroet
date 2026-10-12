/**
 * اختبارات "معركة الفرق".
 *
 * أهم شيئين: صوت واحد فقط لكل شخص مهما كتب، والمطابقة لا تبلع الجمل
 * العابرة ("وين الاحمر؟" ليست تصويتاً للأحمر).
 */
import { describe, expect, it } from 'vitest';
import {
  cleanVoteText,
  findVotedOption,
  matchesOption,
  TeamBattleState,
} from '../src/core/teambattle.js';
import type { BattleRow } from '../src/db/teams.js';
import type { OptionRow } from '../src/db/teams.js';

function battle(over: Partial<BattleRow> = {}): BattleRow {
  return {
    id: 3,
    channel_id: 6095331,
    title: 'معركة الجمعة',
    status: 'voting',
    winning_option_id: null,
    win_reward_kind: 'distribute',
    win_reward_amount: 25,
    win_reward_minutes: 0,
    lose_penalty_kind: 'none',
    lose_penalty_minutes: 0,
    started_at: new Date().toISOString(),
    ended_at: null,
    applied_at: null,
    ...over,
  };
}

const OPTS: OptionRow[] = [
  { id: 11, battle_id: 3, label: 'الأحمر', position: 0 },
  { id: 12, battle_id: 3, label: 'الأزرق', position: 1 },
  { id: 13, battle_id: 3, label: 'ناصر', position: 2 },
];

describe('cleanVoteText', () => {
  it('strips the definite article so الناصر votes for ناصر', () => {
    expect(cleanVoteText('الناصر')).toBe(cleanVoteText('ناصر'));
  });

  it('strips a leading !', () => {
    expect(cleanVoteText('!الأحمر')).toBe(cleanVoteText('الأحمر'));
  });
});

describe('matchesOption', () => {
  it('matches the exact team name', () => {
    expect(matchesOption('الأحمر', 'الأحمر')).toBe(true);
    expect(matchesOption('ناصر', 'ناصر')).toBe(true);
  });

  it('matches with ال and ! variants', () => {
    expect(matchesOption('الناصر', 'ناصر')).toBe(true);
    expect(matchesOption('!ناصر', 'ناصر')).toBe(true);
    expect(matchesOption('!الأحمر', 'الأحمر')).toBe(true);
  });

  it('does NOT match a passing sentence', () => {
    expect(matchesOption('وين الأحمر؟', 'الأحمر')).toBe(false);
    expect(matchesOption('انا مع الأزرق اليوم', 'الأزرق')).toBe(false);
  });

  it('does NOT match a different team', () => {
    expect(matchesOption('الأحمر', 'الأزرق')).toBe(false);
  });

  it('rejects tiny inputs', () => {
    expect(matchesOption('ا', 'الأحمر')).toBe(false);
    expect(matchesOption('', '')).toBe(false);
  });
});

describe('findVotedOption', () => {
  it('returns the matching team', () => {
    expect(findVotedOption('الأزرق', OPTS)?.id).toBe(12);
  });

  it('returns null when nothing matches', () => {
    expect(findVotedOption('مرحبا', OPTS)).toBeNull();
  });
});

describe('TeamBattleState — one vote each', () => {
  function stateWith(b: BattleRow | null) {
    const sent: string[] = [];
    const s = new TeamBattleState({
      channelId: 6095331,
      send: (t) => sent.push(t),
      fetchActive: async () => b,
      fetchOpts: async () => OPTS,
    });
    return { s, sent };
  }

  it('announces the battle with its teams exactly once', async () => {
    let b: BattleRow | null = null;
    const sent: string[] = [];
    const s = new TeamBattleState({
      channelId: 6095331,
      send: (t) => sent.push(t),
      fetchActive: async () => b,
      fetchOpts: async () => OPTS,
    });
    await s.refresh();
    expect(sent).toHaveLength(0);

    b = battle();
    await s.refresh();
    await s.refresh();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('معركة الجمعة');
    expect(sent[0]).toContain('الأحمر');
  });

  it('counts a vote once no matter how many times they type it', async () => {
    const { s } = stateWith(battle());
    await s.refresh();
    expect(await s.vote(1, 'ali', 11)).toBe('first');
    expect(await s.vote(1, 'ali', 11)).toBe('repeat');
    expect(await s.vote(1, 'ali', 12)).toBe('repeat');
    expect(s.snapshot().totalVotes).toBe(1);
  });

  it('a voter cannot switch teams afterwards', async () => {
    const { s } = stateWith(battle());
    await s.refresh();
    await s.vote(1, 'ali', 11);
    // Even for a different team — first vote stands.
    expect(await s.vote(1, 'ali', 12)).toBe('repeat');
    expect(s.snapshot().options.find((o) => o.id === 11)?.votes).toBe(1);
    expect(s.snapshot().options.find((o) => o.id === 12)?.votes).toBe(0);
  });

  it('counts different voters separately', async () => {
    const { s } = stateWith(battle());
    await s.refresh();
    await s.vote(1, 'ali', 11);
    await s.vote(2, 'sara', 12);
    await s.vote(3, 'omar', 11);
    const snap = s.snapshot();
    expect(snap.totalVotes).toBe(3);
    expect(snap.options.find((o) => o.id === 11)?.votes).toBe(2);
    expect(snap.options.find((o) => o.id === 12)?.votes).toBe(1);
  });

  it('does not collect while running — voting is over', async () => {
    const { s } = stateWith(battle({ status: 'running' }));
    await s.refresh();
    expect(await s.vote(1, 'ali', 11)).toBe('closed');
  });

  it('findVote only works during voting', () => {
    const voting = new TeamBattleState({
      channelId: 6095331,
      send: () => {},
      fetchActive: async () => battle({ status: 'voting' }),
      fetchOpts: async () => OPTS,
    });
    // findVote reads the in-memory options, which load on refresh.
    expect(voting.findVote('الأحمر')).toBeNull();
  });

  it('findVote matches after options load', async () => {
    const { s } = stateWith(battle());
    await s.refresh();
    expect(s.findVote('الأحمر')?.id).toBe(11);
    expect(s.findVote('الناصر')?.id).toBe(13);
    expect(s.findVote('وين الأحمر؟')).toBeNull();
  });

  it('works with any number of teams, not just two', async () => {
    const four: OptionRow[] = [
      { id: 1, battle_id: 9, label: 'أ', position: 0 },
      { id: 2, battle_id: 9, label: 'ب', position: 1 },
      { id: 3, battle_id: 9, label: 'ج', position: 2 },
      { id: 4, battle_id: 9, label: 'د', position: 3 },
    ];
    const s = new TeamBattleState({
      channelId: 6095331,
      send: () => {},
      fetchActive: async () => battle({ id: 9 }),
      fetchOpts: async () => four,
    });
    await s.refresh();
    // Note: single-char labels are below the 2-char minimum on purpose —
    // real team names must be 2+ chars, so these do not match.
    expect(s.findVote('أ')).toBeNull();
    expect(s.snapshot().options).toHaveLength(4);
  });

  it('forgets everything when the battle ends', async () => {
    let b: BattleRow | null = battle();
    const s = new TeamBattleState({
      channelId: 6095331,
      send: () => {},
      fetchActive: async () => b,
      fetchOpts: async () => OPTS,
    });
    await s.refresh();
    await s.vote(1, 'ali', 11);
    b = null;
    await s.refresh();
    expect(s.snapshot().active).toBe(false);
    expect(await s.vote(2, 'sara', 11)).toBe('closed');
  });
});