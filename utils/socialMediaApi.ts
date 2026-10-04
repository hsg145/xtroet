// Live social counters — 3-layer architecture per platform:
//   1) /api/social (server-side: Vercel Edge in prod, vite middleware in dev)
//   2) Direct client fetch (CORS-open sources only)
//   3) Static fallback (neutral until live numbers land)
//
// XTROET handles:
//   TikTok @ixtroet | X @xtroet | Instagram @xtroet | YouTube @XTROET

export interface SocialMediaStats {
  instagram?: number;
  tiktok?: number;
  twitter?: number;
  youtube?: number;
  snapchat?: number;
}

export const FALLBACK = {
  instagram: 0, // live via server API when available
  tiktok: 0,
  twitter: 0,
  youtube: 0, // @XTROET — live via Mixerno when ID resolves
};

const CACHE_KEY = 'xtroet_social_cache_v1';
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
async function viaServerApi(platform: 'tiktok' | 'instagram' | 'twitter' | 'youtube' | 'snapchat'): Promise<number | null> {
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

export async function getInstagramFollowers(username = 'xtroet'): Promise<number> {
  const via = await viaServerApi('instagram');
  if (via) return via;
  // Layer 2 — Mixerno Instagram counter (usually CORS-open)
  try {
    const d = await fetchJson(`https://mixerno.space/api/instagram-user-counter/user/${username}`);
    const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => /follow/i.test(c?.value || '')) : null;
    const n = num(entry?.count);
    if (n) return n;
  } catch {}
  return FALLBACK.instagram;
}

export async function getSnapchatFollowers(): Promise<number> {
  // Snapchat has no client-side API (CORS) — server only, 0 when unavailable
  return (await viaServerApi('snapchat')) ?? 0;
}

export async function getTikTokFollowers(username = 'ixtroet'): Promise<number> {
  const via = await viaServerApi('tiktok');
  if (via) return via;
  // Layer 2 — TikWM (free, no key, CORS-open)
  try {
    const d = await fetchJson(`https://www.tikwm.com/api/user/info?unique_id=${username}`);
    const n = num(d?.data?.follower_count);
    if (n) return n;
  } catch {}
  // Layer 3 — Mixerno TikTok counter (usually CORS-open)
  try {
    const d = await fetchJson(`https://mixerno.space/api/tiktok-user-counter/user/${username}`);
    const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => /follow/i.test(c?.value || '')) : null;
    const n = num(entry?.count);
    if (n) return n;
  } catch {}
  // Layer 4 — Urlebird mirror page (best-effort, needs CORS)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://urlebird.com/user/${username}/`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/([\d.,]+)\s*([KMB])?\s*(?:<\/[^>]+>\s*)?followers/i);
      if (m) {
        let v = parseFloat(m[1].replace(/,/g, ''));
        const u = (m[2] || '').toUpperCase();
        if (u === 'K') v *= 1e3; else if (u === 'M') v *= 1e6; else if (u === 'B') v *= 1e9;
        if (Number.isFinite(v) && v > 0) return Math.round(v);
      }
    }
  } catch {}
  return FALLBACK.tiktok;
}

export async function getTwitterFollowers(username = 'xtroet'): Promise<number> {
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

export async function getYouTubeSubscribers(channelId = 'XTROET'): Promise<number> {
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

export async function getAllSocialMediaStats(): Promise<SocialMediaStats> {
  const [instagram, tiktok, twitter, youtube, snapchat] = await Promise.all([
    getInstagramFollowers('xtroet'),
    getTikTokFollowers('ixtroet'),
    getTwitterFollowers('xtroet'),
    getYouTubeSubscribers('XTROET'),
    getSnapchatFollowers(),
  ]);
  const stats = { instagram, tiktok, twitter, youtube, snapchat };
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
  if (!count || count <= 0) return '—';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M+`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K+`;
  return count.toString();
}

export async function getCachedSocialMediaStats(): Promise<SocialMediaStats> {
  return getAllSocialMediaStats();
}
