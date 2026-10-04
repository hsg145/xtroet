// Vercel Edge Function — Live Social Counters API
// GET /api/social?platform=tiktok|instagram|youtube|twitter
// Server-side fetch = no CORS issues, fresh numbers every call.
// Vercel caches success responses for 4 minutes (s-maxage).

export const config = {
  runtime: 'edge',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HANDLES = {
  tiktok: 'ixtroet',
  instagram: 'xtroet',
  twitter: 'xtroet',
  youtube: 'XTROET', // @XTROET — handle-based, graceful fallback if ID lookup fails
} as const;

type Platform = keyof typeof HANDLES;

async function fetchJson(url: string, timeoutMs = 9000, extraHeaders: Record<string, string> = {}): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...extraHeaders },
      signal: c.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: c.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/** "68,337" | "68.3K" | "1.2M" -> 68337 */
function parseCompact(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.round(input);
  const s = String(input ?? '').replace(/,/g, '').trim();
  const m = s.match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] || '').toUpperCase();
  if (u === 'K') n *= 1e3;
  else if (u === 'M') n *= 1e6;
  else if (u === 'B') n *= 1e9;
  const out = Math.round(n);
  return out > 0 ? out : null;
}

async function getTikTok(): Promise<{ count: number; source: string }> {
  // 0) TikWM — free, no key, exact follower_count
  try {
    const d = await fetchJson(`https://www.tikwm.com/api/user/info?unique_id=${HANDLES.tiktok}`);
    const n = parseCompact(d?.data?.follower_count);
    if (n) return { count: n, source: 'tikwm' };
  } catch {}
  // 1) TikMatrix — open JSON, exact count
  try {
    const d = await fetchJson(`https://user.tikmatrix.com/api/user?username=${HANDLES.tiktok}`);
    const n = parseCompact(d?.stats?.Followers);
    if (n) return { count: n, source: 'tikmatrix' };
  } catch {}
  // 2) Countik
  try {
    const d = await fetchJson(`https://countik.com/api/tiktok/@${HANDLES.tiktok}`);
    const n = parseCompact(d?.followerCount ?? d?.followers ?? d?.follower_count);
    if (n) return { count: n, source: 'countik' };
  } catch {}
  throw new Error('tiktok: all sources failed');
}

async function getYouTube(): Promise<{ count: number; source: string }> {
  // 0) Resolve @handle -> UC channel id (cached per isolate)
  const id = (await resolveYouTubeId()) || (HANDLES.youtube.startsWith('UC') ? HANDLES.youtube : null);
  if (!id) throw new Error('youtube: could not resolve channel id');
  // 1) Mixerno — exact subscriber count
  try {
    const d = await fetchJson(`https://mixerno.space/api/youtube-channel-counter/user/${id}`);
    const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => c?.value === 'subscribers') : null;
    const n = parseCompact(entry?.count);
    if (n) return { count: n, source: 'mixerno' };
  } catch {}
  // 2) Piped
  try {
    const d = await fetchJson(`https://pipedapi.kavin.rocks/channel/${id}`);
    const n = parseCompact(d?.subscriberCount);
    if (n) return { count: n, source: 'piped' };
  } catch {}
  throw new Error('youtube: all sources failed');
}

async function getTwitter(): Promise<{ count: number; source: string }> {
  // 1) FixTweet — exact followers
  try {
    const d = await fetchJson(`https://api.fxtwitter.com/${HANDLES.twitter}`);
    const n = parseCompact(d?.user?.followers);
    if (n) return { count: n, source: 'fxtwitter' };
  } catch {}
  // 2) X syndication endpoint
  try {
    const d = await fetchJson(
      `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${HANDLES.twitter}`
    );
    const n = parseCompact(Array.isArray(d) ? d[0]?.followers_count : d?.followers_count);
    if (n) return { count: n, source: 'syndication' };
  } catch {}
  throw new Error('twitter: all sources failed');
}

async function getInstagram(): Promise<{ count: number; source: string }> {
  // 1) Instagram web API with public app id (works server-side with proper headers)
  try {
    const d = await fetchJson(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${HANDLES.instagram}`, 9000, {
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `https://www.instagram.com/${HANDLES.instagram}/`,
    });
    const n = parseCompact(d?.data?.user?.edge_followed_by?.count);
    if (n) return { count: n, source: 'web_profile_info' };
  } catch {}
  // 2) og:description meta ("21.3K Followers, ...")
  try {
    const html = await fetchText(`https://www.instagram.com/${HANDLES.instagram}/`);
    const og = html.match(/property="og:description"\s+content="([^"]+)"/)?.[1] || '';
    const m = og.match(/([\d.,]+[KMB]?)\s+Followers/i);
    const n = m ? parseCompact(m[1]) : null;
    if (n) return { count: n, source: 'og_description' };
  } catch {}
  throw new Error('instagram: all sources failed (login-walled)');
}

/** Resolve a YouTube @handle to its UC channel id (cached). */
let YT_CHANNEL_ID: string | null = null;

async function resolveYouTubeId(): Promise<string | null> {
  if (YT_CHANNEL_ID) return YT_CHANNEL_ID;
  if (HANDLES.youtube.startsWith('UC')) {
    YT_CHANNEL_ID = HANDLES.youtube;
    return YT_CHANNEL_ID;
  }
  try {
    const html = await fetchText(`https://www.youtube.com/@${HANDLES.youtube.replace(/^@/, '')}/`);
    const m =
      html.match(/"channelId":"(UC[\w-]{22})"/) ||
      html.match(/youtube\.com\/channel\/(UC[\w-]{22})/) ||
      html.match(/"browseId":"(UC[\w-]{22})"/);
    if (m) {
      YT_CHANNEL_ID = m[1];
      return YT_CHANNEL_ID;
    }
  } catch {}
  return null;
}

export default async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = (searchParams.get('platform') || '').toLowerCase() as Platform;

  if (!platform || !(platform in HANDLES)) {
    return new Response(JSON.stringify({ error: 'Use ?platform=tiktok|instagram|youtube|twitter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const loaders: Record<Platform, () => Promise<{ count: number; source: string }>> = {
      tiktok: getTikTok,
      instagram: getInstagram,
      youtube: getYouTube,
      twitter: getTwitter,
    };
    const { count, source } = await loaders[platform]();
    return new Response(JSON.stringify({ platform, count, source, updatedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=240, stale-while-revalidate=600',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ platform, count: null, error: err?.message || 'failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=60' },
    });
  }
}
