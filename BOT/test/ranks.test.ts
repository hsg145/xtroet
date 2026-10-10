import { describe, expect, it } from 'vitest';
import { FALLBACK_FOR_TEST, rankForPoints, crossedRanks, RankStore } from '../src/core/ranks.js';

const ranks = FALLBACK_FOR_TEST;

describe('rankForPoints', () => {
  it('gives everyone cadet at 0 points', () => {
    expect(rankForPoints(ranks, 0).key).toBe('cadet');
  });

  it('stays cadet just below the first threshold (199)', () => {
    expect(rankForPoints(ranks, 199).key).toBe('cadet');
  });

  it('promotes exactly at the threshold (200 -> solo_cadet)', () => {
    expect(rankForPoints(ranks, 200).key).toBe('solo_cadet');
  });

  it('handles every boundary exactly', () => {
    const cases: Array<[number, string]> = [
      [0, 'cadet'],
      [199, 'cadet'],
      [200, 'solo_cadet'],
      [499, 'solo_cadet'],
      [500, 'officer_1'],
      [999, 'officer_1'],
      [1000, 'officer_2'],
      [1799, 'officer_2'],
      [1800, 'officer_3'],
      [2999, 'officer_3'],
      [3000, 'senior_officer'],
      [4599, 'senior_officer'],
      [4600, 'senior_lead_officer'],
      [6799, 'senior_lead_officer'],
      [6800, 'sergeant'],
      [9999, 'sergeant'],
      [10000, 'first_sergeant'],
      [13999, 'first_sergeant'],
      [14000, 'staff_sergeant'],
      [14999, 'staff_sergeant'],
      [15000, 'lieutenant'],
      [19999, 'lieutenant'],
      [20000, 'first_lieutenant'],
      [29999, 'first_lieutenant'],
      [30000, 'captain'],
      [69999, 'captain'],
      [70000, 'chief_of_police'],
      [99999, 'chief_of_police'],
      [100000, 'minister'],
    ];
    for (const [points, key] of cases) {
      expect(rankForPoints(ranks, points).key, `points=${points}`).toBe(key);
    }
  });

  it('caps at the top rank', () => {
    expect(rankForPoints(ranks, 100000).key).toBe('minister');
    expect(rankForPoints(ranks, 999999).key).toBe('minister');
  });

  it('never goes below cadet for negative input', () => {
    expect(rankForPoints(ranks, -50).key).toBe('cadet');
  });
});

describe('RankStore', () => {
  const store = new RankStore();

  it('has 15 ranks with the documented thresholds', () => {
    expect(store.all()).toHaveLength(15);
    expect(store.rankForPoints(200).key).toBe('solo_cadet');
    expect(store.rankForPoints(100000).key).toBe('minister');
  });

  it('reports no next rank for the top rank', () => {
    const top = store.rankForPoints(100000);
    expect(store.nextAfter(top)).toBeNull();
  });

  it('reports the next rank for a lower rank', () => {
    const cadet = store.rankForPoints(10);
    expect(store.nextAfter(cadet)?.key).toBe('solo_cadet');
  });

  it('looks ranks up by idx', () => {
    expect(store.rankByIdx(6)?.key).toBe('senior_officer');
    expect(store.rankByIdx(999)).toBeNull();
  });
});

describe('crossedRanks', () => {
  it('returns nothing for a normal single point', () => {
    expect(crossedRanks(ranks, 10, 11)).toHaveLength(0);
  });

  it('returns the crossed rank at a boundary', () => {
    const crossed = crossedRanks(ranks, 199, 200);
    expect(crossed.map((r) => r.key)).toEqual(['solo_cadet']);
  });

  it('returns every skipped rank when points jump far', () => {
    const crossed = crossedRanks(ranks, 0, 14000);
    expect(crossed.map((r) => r.key)).toEqual([
      'solo_cadet',
      'officer_1',
      'officer_2',
      'officer_3',
      'senior_officer',
      'senior_lead_officer',
      'sergeant',
      'first_sergeant',
      'staff_sergeant',
    ]);
  });

  it('returns nothing at the very top', () => {
    expect(crossedRanks(ranks, 100000, 100001)).toHaveLength(0);
  });
});