import { describe, expect, it } from 'vitest';
import { FALLBACK_FOR_TEST, rankForPoints, crossedRanks, RankStore } from '../src/core/ranks.js';

const ranks = FALLBACK_FOR_TEST;

describe('rankForPoints', () => {
  it('gives everyone cadet at 0 points', () => {
    expect(rankForPoints(ranks, 0).key).toBe('cadet');
  });

  it('stays cadet just below the first threshold (99)', () => {
    expect(rankForPoints(ranks, 99).key).toBe('cadet');
  });

  it('promotes exactly at the threshold (100 -> solo_cadet)', () => {
    expect(rankForPoints(ranks, 100).key).toBe('solo_cadet');
  });

  it('handles every boundary exactly', () => {
    const cases: Array<[number, string]> = [
      [0, 'cadet'],
      [99, 'cadet'],
      [100, 'solo_cadet'],
      [249, 'solo_cadet'],
      [250, 'officer_1'],
      [499, 'officer_1'],
      [500, 'officer_2'],
      [899, 'officer_2'],
      [900, 'officer_3'],
      [1499, 'officer_3'],
      [1500, 'senior_officer'],
      [2299, 'senior_officer'],
      [2300, 'senior_lead_officer'],
      [3399, 'senior_lead_officer'],
      [3400, 'sergeant'],
      [4999, 'sergeant'],
      [5000, 'first_sergeant'],
      [6999, 'first_sergeant'],
      [7000, 'staff_sergeant'],
      [9999, 'staff_sergeant'],
      [10000, 'lieutenant'],
      [13999, 'lieutenant'],
      [14000, 'first_lieutenant'],
      [19999, 'first_lieutenant'],
      [20000, 'captain'],
      [49999, 'captain'],
      [50000, 'chief_of_police'],
      [69999, 'chief_of_police'],
      [70000, 'minister'],
    ];
    for (const [points, key] of cases) {
      expect(rankForPoints(ranks, points).key, `points=${points}`).toBe(key);
    }
  });

  it('caps at the top rank', () => {
    expect(rankForPoints(ranks, 70000).key).toBe('minister');
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
    expect(store.rankForPoints(100).key).toBe('solo_cadet');
    expect(store.rankForPoints(70000).key).toBe('minister');
  });

  it('reports no next rank for the top rank', () => {
    const top = store.rankForPoints(70000);
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
    const crossed = crossedRanks(ranks, 99, 100);
    expect(crossed.map((r) => r.key)).toEqual(['solo_cadet']);
  });

  it('returns every skipped rank when points jump far', () => {
    const crossed = crossedRanks(ranks, 0, 7000);
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
    expect(crossedRanks(ranks, 70000, 70001)).toHaveLength(0);
  });
});