// Live social counters — 3-layer architecture per platform:
//   1) /api/social (server-side: Vercel Edge in prod, vite middleware in dev)
//   2) Direct client fetch (CORS-open sources only)
//   3) Verified static fallback (last confirmed live numbers, 2026-09-26)
//
// Verified live:
//   TikTok @vfiras3 .... 68,337 (TikMatrix) | YouTube @leveloneclan 111,326 (Mixerno)
//   X @vfiras3 ......... 68,568 (FixTweet, verified account)

export interface SocialMediaStats {
  instagram?: number;
  tiktok?: number;
  twitter?: number;
  youtube?: number;
  whatsapp?: number;
}

export const FALLBACK = {
  instagram: 21300, // curated — Instagram walls all free readers for this account
  tiktok: 68337,
  twitter: 68568,
  youtube: 111326, // Level One Clan — live via Mixerno
  whatsapp: 9100, // no public API — curated
};

const CACHE_KEY = 'firas_social_cache_v1';
export const SOCIAL_TTL_MS = 5 * 60 * 1000;

async function fetchJson(url: string, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Layer 1 — our server API (works in dev + prod, no CORS issues). */
async function viaServerApi(platform: 'tiktok' | 'instagram' | 'twitter' | 'youtube'): Promise<number | null> {
  try {
    const j = await fetchJson(`/api/social?platform=${platform}`);
    return typeof j?.count === 'number' && j.count > 0 ? j.count : null;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export async function getInstagramFollowers(username = 'vfiras3'): Promise<number> {
  void username;
  return (await viaServerApi('instagram')) ?? FALLBACK.instagram;
}

export async function getTikTokFollowers(username = 'vfiras3'): Promise<number> {
  const via = await viaServerApi('tiktok');
  if (via) return via;
  // Layer 2 — TikMatrix allows CORS + needs no key
  try {
    const d = await fetchJson(`https://user.tikmatrix.com/api/user?username=${username}`);
    const n = num(String(d?.stats?.Followers ?? '').replace(/,/g, ''));
    if (n) return n;
  } catch {}
  return FALLBACK.tiktok;
}

export async function getTwitterFollowers(username = 'vfiras3'): Promise<number> {
  const via = await viaServerApi('twitter');
  if (via) return via;
  // Layer 2 — FixTweet API (usually CORS-open)
  try {
    const d = await fetchJson(`https://api.fxtwitter.com/${username}`);
    const n = num(d?.user?.followers);
    if (n) return n;
  } catch {}
  return FALLBACK.twitter;
}

export async function getYouTubeSubscribers(channelId = 'UCD7EpD4o6bw24c5o5vu4hGQ'): Promise<number> {
  const via = await viaServerApi('youtube');
  if (via) return via;
  // Layer 2 — Mixerno (usually CORS-open)
  try {
    const d = await fetchJson(`https://mixerno.space/api/youtube-channel-counter/user/${channelId}`);
    const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => c?.value === 'subscribers') : null;
    const n = num(entry?.count);
    if (n) return n;
  } catch {}
  return FALLBACK.youtube;
}

export async function getWhatsAppSubscribers(): Promise<number> {
  return FALLBACK.whatsapp;
}

export async function getAllSocialMediaStats(): Promise<SocialMediaStats> {
  const [instagram, tiktok, twitter, youtube] = await Promise.all([
    getInstagramFollowers('vfiras3'),
    getTikTokFollowers('vfiras3'),
    getTwitterFollowers('vfiras3'),
    getYouTubeSubscribers('UCD7EpD4o6bw24c5o5vu4hGQ'),
  ]);
  const stats = { instagram, tiktok, twitter, youtube, whatsapp: FALLBACK.whatsapp };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stats }));
  } catch {}
  return stats;
}

/** Instant paint from cache (if fresh), so numbers show before the live fetch lands. */
export function readSocialCache(): (SocialMediaStats & { _fresh: boolean }) | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, stats } = JSON.parse(raw);
    if (!stats) return null;
    return { ...stats, _fresh: Date.now() - at < SOCIAL_TTL_MS };
  } catch {
    return null;
  }
}

export function formatFollowerCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M+`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K+`;
  return count.toString();
}

export async function getCachedSocialMediaStats(): Promise<SocialMediaStats> {
  return getAllSocialMediaStats();
}
