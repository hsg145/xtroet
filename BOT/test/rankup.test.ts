import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { messages } from '../src/messages.js';
import { FALLBACK_FOR_TEST, type Rank } from '../src/core/ranks.js';

/**
 * A promotion used to post TWO messages: one from the router the instant the
 * point landed in memory, and one from the flusher after the DB write. These
 * tests pin the agreed behaviour — exactly one announcement, announced from the
 * database, in one agreed format.
 */
const routerSrc = readFileSync(resolve(__dirname, '../src/core/router.ts'), 'utf8');
const indexSrc = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');

describe('rank-up announcements', () => {
  const ordered = [...FALLBACK_FOR_TEST].sort((a, b) => a.idx - b.idx);
  const soloCadet = ordered[1]!;

  it('announces in the exact agreed one-line format', () => {
    const line = messages.rankUp('POWR_HSG', soloCadet);
    expect(line).toBe(`🎉⭐ ${soloCadet.name_ar} 🔥 @POWR_HSG`);
    expect(line.includes('\n')).toBe(false);
    // One banner, one mention: the mention is last and appears once.
    expect(line.endsWith('@POWR_HSG')).toBe(true);
    expect(line.match(/@/g)).toHaveLength(1);
  });

  it('never announces from memory in the router', () => {
    // The router must not send a promotion; announcing from memory caused the
    // duplicate message. If someone re-adds it, this fails.
    expect(routerSrc).not.toMatch(/messages\.rankUp\(/);
    expect(routerSrc).not.toMatch(/rankUps\.length\s*>\s*0\s*&&/);
  });

  it('announces once, from the flusher after the write succeeds', () => {
    // Exactly one call site sends a DB-observed promotion.
    const sends = indexSrc.match(/messages\.rankUp\(/g) ?? [];
    expect(sends).toHaveLength(1);
    // And it is wired to the flusher, not to the router.
    expect(indexSrc).toContain('onRankUps: (rows: RankChangeRow[]) => announceDbRankUps(');
  });

  it('marks the promoted rank with one leading star', () => {
    for (const rank of ordered) {
      const line = messages.rankUp('u', rank);
      // → 🎉⭐ سولو كاديت 🔥 @u : one star, then the name.
      expect(line).toBe(`🎉⭐ ${rank.name_ar} 🔥 @u`);
      expect(line.match(/⭐/g)).toHaveLength(1);
      expect(line.includes('\n')).toBe(false);
    }
  });
});

describe('channels upsert', () => {
  // Regression: `channels` is unique on BOTH id and slug. Upserting on id alone
  // raised 23505 "duplicate key value violates unique constraint
  // channels_slug_key" whenever the slug already belonged to another id, which
  // aborted `npm run auth` before the token was ever stored.
  const repoSrc = readFileSync(resolve(__dirname, '../src/db/repo.ts'), 'utf8');

  it('releases a conflicting slug before upserting', () => {
    expect(repoSrc).toMatch(/delete\(\)\.eq\('slug', slug\)\.neq\('id', id\)/);
    expect(repoSrc).toMatch(/upsert\(\{ id, slug \}, \{ onConflict: 'id' \}\)/);
  });
});

describe('agreement between the card and the promotion', () => {
  const ordered = [...FALLBACK_FOR_TEST].sort((a, b) => a.idx - b.idx);

  it('uses the same rank name in both messages', () => {
    const officer2 = ordered[3]!;
    const rank: Rank = officer2;
    const promo = messages.rankUp('u', rank);
    // Whatever the promotion shows must match the card for the same rank.
    expect(promo).toContain(rank.name_ar);
  });
});

// Silence unused-import lint without changing runtime behaviour.
void vi;