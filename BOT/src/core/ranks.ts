import { fetchRanks } from '../db/repo.js';
import { getLogger } from '../logger.js';

export interface Rank {
  idx: number;
  key: string;
  name_ar: string;
  name_en: string;
  emoji: string;
  min_points: number;
}

/**
 * Built-in defaults, used before the first successful DB read and if the
 * `ranks` table is unreachable.
 *
 * Markers are grouped by tier family, not unique per rank: an officer block is
 * entirely blue, a senior block entirely brown, and so on, so the colour alone
 * tells you roughly where someone stands before you read the name. Inside a
 * family the glyph grows slightly with the tier. The final stretch is a
 * royal ladder: sparkle -> fleur -> silver -> gold -> medal of honour,
 * because each of the last five must read as a bigger achievement at a glance.
 */
const FALLBACK: Rank[] = [
  { idx: 1, key: 'cadet', name_ar: 'كاديت', name_en: 'Cadet', emoji: '▪️', min_points: 0 },
  { idx: 2, key: 'solo_cadet', name_ar: 'سولو كاديت', name_en: 'Solo Cadet', emoji: '▫️', min_points: 100 },
  { idx: 3, key: 'officer_1', name_ar: 'أوفيسر 1', name_en: 'Officer 1', emoji: '🔹', min_points: 250 },
  { idx: 4, key: 'officer_2', name_ar: 'أوفيسر 2', name_en: 'Officer 2', emoji: '🔹', min_points: 500 },
  { idx: 5, key: 'officer_3', name_ar: 'أوفيسر 3', name_en: 'Officer 3', emoji: '🔹', min_points: 900 },
  { idx: 6, key: 'senior_officer', name_ar: 'سينيور أوفيسر', name_en: 'Senior Officer', emoji: '🔸', min_points: 1500 },
  { idx: 7, key: 'senior_lead_officer', name_ar: 'سينيور ليد أوفيسر', name_en: 'Senior Lead Officer', emoji: '🔸', min_points: 2300 },
  { idx: 8, key: 'sergeant', name_ar: 'سارجنت', name_en: 'Sergeant', emoji: '💠', min_points: 3400 },
  { idx: 9, key: 'first_sergeant', name_ar: 'فيرست سارجنت', name_en: 'First Sergeant', emoji: '🔺', min_points: 5000 },
  { idx: 10, key: 'staff_sergeant', name_ar: 'ستاف سارجنت', name_en: 'Staff Sergeant', emoji: '🔺', min_points: 7000 },
  { idx: 11, key: 'lieutenant', name_ar: 'لوتينت', name_en: 'Lieutenant', emoji: '✨', min_points: 10000 },
  { idx: 12, key: 'first_lieutenant', name_ar: 'فيرست لوتينت', name_en: 'First Lieutenant', emoji: '⚜️', min_points: 14000 },
  { idx: 13, key: 'captain', name_ar: 'كابتن', name_en: 'Captain', emoji: '🥈', min_points: 20000 },
  { idx: 14, key: 'chief_of_police', name_ar: 'رئيس الشرطة', name_en: 'Chief of Police', emoji: '🥇', min_points: 50000 },
  { idx: 15, key: 'minister', name_ar: 'الوزير', name_en: 'Minister', emoji: '🎖️', min_points: 70000 },
];

/** In-memory copy of the `ranks` table, refreshed periodically. */
export class RankStore {
  private ranks: Rank[] = FALLBACK;
  private timer?: NodeJS.Timeout;

  all(): Rank[] {
    return this.ranks;
  }

  ordered(): Rank[] {
    return [...this.ranks].sort((a, b) => a.idx - b.idx);
  }

  /** Highest rank whose min_points <= points. */
  rankForPoints(points: number): Rank {
    let best = this.ordered()[0]!;
    for (const r of this.ranks) if (points >= r.min_points) best = r;
    return best;
  }

  rankByIdx(idx: number): Rank | null {
    return this.ranks.find((r) => r.idx === idx) ?? null;
  }

  nextAfter(rank: Rank): Rank | null {
    const sorted = this.ordered();
    return sorted.find((r) => r.idx > rank.idx) ?? null;
  }

  async load(): Promise<Rank[]> {
    try {
      const rows = await fetchRanks();
      if (rows.length > 0) {
        this.ranks = rows.map((r) => ({
          idx: r.idx,
          key: r.key,
          name_ar: r.name_ar,
          name_en: r.name_en,
          emoji: r.emoji,
          min_points: r.min_points,
        }));
        getLogger().info({ count: this.ranks.length }, 'ranks loaded');
      } else {
        getLogger().warn('ranks table is empty, using built-in defaults');
      }
    } catch (err) {
      getLogger().error({ err }, 'failed to load ranks, using built-in defaults');
    }
    return this.ranks;
  }

  startRefresh(intervalMs: number): void {
    this.stopRefresh();
    this.timer = setInterval(() => {
      this.load().catch(() => undefined);
    }, intervalMs);
    this.timer.unref();
  }

  stopRefresh(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** The built-in defaults, exported for unit tests. */
export const FALLBACK_FOR_TEST: Rank[] = FALLBACK;

export function rankForPoints(ranks: Rank[], points: number): Rank {
  let best = [...ranks].sort((a, b) => a.idx - b.idx)[0]!;
  for (const r of ranks) if (points >= r.min_points) best = r;
  return best;
}

/** All ranks the user skipped when jumping straight to `points`. */
export function crossedRanks(ranks: Rank[], fromPoints: number, toPoints: number): Rank[] {
  return [...ranks]
    .sort((a, b) => a.idx - b.idx)
    .filter((r) => r.min_points > fromPoints && r.min_points <= toPoints);
}