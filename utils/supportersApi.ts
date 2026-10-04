// Streamlabs public tip leaderboard — live donor names + ranks.
// No token needed (public v6 leaderboard endpoint).
// Layers: 1) /api/kick proxy (dev+prod, no CORS) 2) direct fetch 3) cache.

import { kickFetch } from './kickApi';

export interface TipDonor {
  name: string;
  rank: number;
}

export type TipInterval = 'all' | 'week' | 'month';

const BASE = 'https://streamlabs.com/api/v6/59249eb4ac505bd/leaderboard/tip';
const CACHE_PREFIX = 'xtroet_tipboard_';
export const TIP_TTL_MS = 5 * 60 * 1000;

function normalize(input: any): TipDonor[] {
  const arr = Array.isArray(input?.donors) ? input.donors : [];
  return arr
    .filter((d: any) => d && typeof d.name === 'string' && d.name.trim())
    .map((d: any) => ({ name: d.name.trim(), rank: Number(d.rank) || 0 }))
    .sort((a: TipDonor, b: TipDonor) => a.rank - b.rank)
    .slice(0, 10);
}

function readCache(interval: TipInterval): TipDonor[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + interval);
    if (!raw) return null;
    const { at, list } = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    if (Date.now() - at > TIP_TTL_MS) return null;
    return list;
  } catch {
    return null;
  }
}

function writeCache(interval: TipInterval, list: TipDonor[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + interval, JSON.stringify({ at: Date.now(), list }));
  } catch {}
}

export async function getTipLeaderboard(interval: TipInterval): Promise<TipDonor[]> {
  const url = `${BASE}?interval=${interval}`;
  // 1) server proxy
  try {
    const d = await kickFetch(url);
    const list = normalize(d);
    if (list.length) {
      writeCache(interval, list);
      return list;
    }
  } catch {}
  // 2) direct
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) {
      const list = normalize(await res.json());
      if (list.length) {
        writeCache(interval, list);
        return list;
      }
    }
  } catch {}
  // 3) stale cache (even expired — better than nothing)
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + interval);
    if (raw) {
      const { list } = JSON.parse(raw);
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {}
  return [];
}
