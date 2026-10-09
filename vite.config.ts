import path from 'path';
import crypto from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const KICK_DEFAULT_SCOPES = 'user:read channel:read chat:write events:subscribe';
const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const parseCookies = (h?: string) => {
  const out: Record<string, string> = {};
  for (const p of String(h || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'local-api-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            // ---- /api/kick-login + /api/kick-callback + /api/kick-status : ربط البوت محلياً (مرآة مجلد api/) ----
            if (req.url && (req.url === '/api/kick-login' || req.url.startsWith('/api/kick-login?'))) {
              const clientId = String(env.KICK_CLIENT_ID || '').trim();
              if (!clientId) { res.statusCode = 500; res.end(JSON.stringify({ error: 'KICK_CLIENT_ID missing in local .env' })); return; }
              const host = String(req.headers.host || 'localhost:3000');
              const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
              const redirectUri = String(env.KICK_REDIRECT_URI || '').trim() || `${proto}://${host}/api/kick-callback`;
              const scope = String(env.KICK_SCOPES || KICK_DEFAULT_SCOPES).trim() || KICK_DEFAULT_SCOPES;
              const verifier = b64url(crypto.randomBytes(48));
              const state = b64url(crypto.randomBytes(24));
              const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
              const auth = new URL('https://id.kick.com/oauth/authorize');
              auth.searchParams.set('response_type', 'code');
              auth.searchParams.set('client_id', clientId);
              auth.searchParams.set('redirect_uri', redirectUri);
              auth.searchParams.set('scope', scope);
              auth.searchParams.set('code_challenge', challenge);
              auth.searchParams.set('code_challenge_method', 'S256');
              auth.searchParams.set('state', state);
              res.setHeader('Set-Cookie', [`kick_verifier=${verifier}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`, `kick_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`]);
              res.statusCode = 302;
              res.setHeader('Location', auth.toString());
              res.end();
              return;
            }
            if (req.url && req.url.startsWith('/api/kick-callback')) {
              try {
                const host = String(req.headers.host || 'localhost:3000');
                const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
                const full = new URL(req.url, `${proto}://${host}`);
                const code = full.searchParams.get('code') || '';
                const state = full.searchParams.get('state') || '';
                if (!code) { res.statusCode = 400; res.end('Missing code — ابدأ من زر الربط'); return; }
                const ck = parseCookies(req.headers.cookie);
                const verifier = ck['kick_verifier'] || '';
                if (!verifier) { res.statusCode = 400; res.end('انتهت الجلسة — اضغط زر الربط من جديد'); return; }
                if (ck['kick_state'] && state && ck['kick_state'] !== state) { res.statusCode = 400; res.end('state غير مطابق'); return; }
                const clientId = String(env.KICK_CLIENT_ID || '').trim();
                const clientSecret = String(env.KICK_CLIENT_SECRET || '').trim();
                const redirectUri = String(env.KICK_REDIRECT_URI || '').trim() || `${proto}://${host}/api/kick-callback`;
                const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, code_verifier: verifier });
                const tokRes = await fetch('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
                const tokText = await tokRes.text();
                if (!tokRes.ok) { res.statusCode = 400; res.end(`فشل التبادل: ${tokText.slice(0, 200)}`); return; }
                const token = JSON.parse(tokText);
                const chRes = await fetch('https://api.kick.com/public/v1/channels', { headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' } });
                const chText = await chRes.text();
                if (!chRes.ok) { res.statusCode = 400; res.end(`فشل قراءة القناة: ${chText.slice(0, 200)}`); return; }
                const chData = JSON.parse(chText);
                const list = Array.isArray(chData?.data) ? chData.data : Array.isArray(chData) ? chData : [];
                const pick = list[0];
                if (!pick) { res.statusCode = 400; res.end('لا توجد قناة — سجل بحساب المالك'); return; }
                const channelId = Number(pick.broadcaster_user_id ?? pick.id ?? 0);
                const slug = String(pick.slug || '');
                const sbUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
                const sbKey = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY || '').trim();
                if (sbUrl && sbKey) {
                  const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' } as Record<string, string>;
                  await fetch(`${sbUrl}/rest/v1/channels?on_conflict=id`, { method: 'POST', headers: h, body: JSON.stringify({ id: channelId, slug }) });
                  await fetch(`${sbUrl}/rest/v1/kick_tokens?on_conflict=channel_id`, { method: 'POST', headers: h, body: JSON.stringify({ channel_id: channelId, broadcaster_user_id: channelId, access_token: token.access_token, refresh_token: token.refresh_token ?? '', expires_at: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString(), scope: token.scope ?? null, updated_at: new Date().toISOString() }) });
                }
                res.statusCode = 302;
                res.setHeader('Location', `/?kick=connected&channel=${encodeURIComponent(slug || String(channelId))}`);
                res.end();
              } catch (e: any) { res.statusCode = 500; res.end(`callback error: ${e?.message || e}`); }
              return;
            }
            if (req.url && req.url.startsWith('/api/kick-status')) {
              try {
                const sbUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
                const sbKey = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY || '').trim();
                if (!sbUrl || !sbKey) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ connected: false })); return; }
                const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, Accept: 'application/json' } as Record<string, string>;
                const r = await fetch(`${sbUrl}/rest/v1/kick_tokens?select=channel_id,updated_at&order=updated_at.desc&limit=1`, { headers: h });
                const rows: any = await r.json();
                if (!rows?.length) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ connected: false })); return; }
                let slug: string | null = null;
                try {
                  const c = await fetch(`${sbUrl}/rest/v1/channels?select=slug&id=eq.${rows[0].channel_id}`, { headers: h });
                  const cj: any = await c.json();
                  slug = cj?.[0]?.slug ?? null;
                } catch {}
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ connected: true, channelId: rows[0].channel_id, slug, updatedAt: rows[0].updated_at }));
              } catch { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ connected: false })); }
              return;
            }
            // ---- /api/groq : نفس سلوك سيرفر Vercel لكن محلياً (npm run dev) ----
            if (req.url && (req.url === '/api/groq' || req.url.startsWith('/api/groq?'))) {
              if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.statusCode = 204;
                res.end();
                return;
              }
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.end(JSON.stringify({ error: 'Use POST' }));
                return;
              }
              try {
                const chunks: Buffer[] = [];
                for await (const c of req) chunks.push(c as Buffer);
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
                const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
                if (!messages.length) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'messages array is required' }));
                  return;
                }

                // المفاتيح من .env المحلي (نفس أسماء Vercel)
                const keys: string[] = [];
                for (const n of ['1', '2', '3', '4', '5']) {
                  const k = env[`GROQ_API_KEY_${n}`];
                  if (k && k.trim()) keys.push(k.trim());
                }
                const combined = env.GROQ_API_KEYS || env.VITE_GROQ_API_KEYS;
                if (combined) {
                  for (const k of String(combined).split(',')) {
                    const t = k.trim();
                    if (t && !keys.includes(t)) keys.push(t);
                  }
                }
                if (!keys.length) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'No GROQ keys in local .env (GROQ_API_KEY_1..3)' }));
                  return;
                }

                const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'allam-2-7b'];
                const clean = messages
                  .filter((m: any) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
                  .slice(-20)
                  .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));

                let lastErr = '';
                for (let k = 0; k < keys.length; k++) {
                  for (const model of models) {
                    try {
                      const controller = new AbortController();
                      const t = setTimeout(() => controller.abort(), 25000);
                      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys[k]}` },
                        body: JSON.stringify({ model, messages: clean, max_tokens: 1024, temperature: 0.7 }),
                        signal: controller.signal,
                      });
                      clearTimeout(t);
                      if (r.status === 401) { lastErr = `key${k + 1} unauthorized`; break; }
                      if (!r.ok) { lastErr = `key${k + 1}/${model} HTTP ${r.status}`; continue; }
                      const j: any = await r.json();
                      const reply = j?.choices?.[0]?.message?.content?.trim();
                      if (reply) {
                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.statusCode = 200;
                        res.end(JSON.stringify({ reply, model, keyIndex: k + 1 }));
                        return;
                      }
                      lastErr = `key${k + 1}/${model} empty reply`;
                    } catch (err: any) {
                      lastErr = `key${k + 1}/${model} fail`;
                    }
                  }
                }
                res.statusCode = 502;
                res.end(JSON.stringify({ error: 'All GROQ keys/models failed', details: lastErr }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
              }
              return;
            }
            if (req.url && req.url.startsWith('/api/social')) {
              // ---- /api/social : عدّادات التواصل الحية محلياً (مرآة api/social.ts) ----
              const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const platform = (url.searchParams.get('platform') || '').toLowerCase();
              const HANDLES: Record<string, string> = { tiktok: 'ixtroet', instagram: 'xtroet', twitter: 'xtroet', snapchat: 'xtroet', youtube: 'UCzTrJVRcJjcpUMKojPsgbDw' };
              const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
              const parseCompact = (input: any): number | null => {
                if (typeof input === 'number' && Number.isFinite(input)) return Math.round(input);
                const s = String(input ?? '').replace(/,/g, '').trim();
                const m = s.match(/([\d.]+)\s*([KMB])?/i);
                if (!m) return null;
                let n = parseFloat(m[1]);
                if (!Number.isFinite(n)) return null;
                const u = (m[2] || '').toUpperCase();
                if (u === 'K') n *= 1e3; else if (u === 'M') n *= 1e6; else if (u === 'B') n *= 1e9;
                const out = Math.round(n);
                return out > 0 ? out : null;
              };
              const jget = async (u: string, timeoutMs = 12000, extraHeaders: Record<string, string> = {}) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                  const r = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': UA, ...extraHeaders }, signal: controller.signal });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return await r.json();
                } finally { clearTimeout(timer); }
              };
              const tget = async (u: string, timeoutMs = 12000) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                  const r = await fetch(u, { headers: { Accept: 'text/html', 'User-Agent': UA }, signal: controller.signal });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return await r.text();
                } finally { clearTimeout(timer); }
              };
              const tryFirst = async (fns: Array<() => Promise<{ count: number; source: string }>>) => {
                let last = 'failed';
                for (const fn of fns) {
                  try { return await fn(); } catch (e: any) { last = e?.message || 'failed'; }
                }
                throw new Error(last);
              };
              try {
                if (!HANDLES[platform]) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Use ?platform=tiktok|instagram|youtube|twitter|snapchat' }));
                  return;
                }
                let result: { count: number; source: string };
                if (platform === 'tiktok') {
                  const target = `https://urlebird.com/user/${HANDLES.tiktok}/`;
                  const extract = (html: string): number | null => {
                    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
                    const m = text.match(/hearts\s+([\d.,]+)\s*([KMB])?\s+followers/i) || text.match(/([\d.,]+)\s*([KMB])?\s+followers/i);
                    if (!m) return null;
                    let v = parseFloat(m[1].replace(/,/g, ''));
                    const u = (m[2] || '').toUpperCase();
                    if (u === 'K') v *= 1e3; else if (u === 'M') v *= 1e6; else if (u === 'B') v *= 1e9;
                    if (!Number.isFinite(v)) return null;
                    const out = Math.round(v);
                    return out > 0 ? out : null;
                  };
                  result = await tryFirst([
                    async () => {
                      const html = await tget(target, 7000);
                      const n = extract(html);
                      if (!n) throw new Error('no-match');
                      return { count: n, source: 'urlebird' };
                    },
                    async () => {
                      const html = await tget(`https://urlebird-com.translate.goog/user/${HANDLES.tiktok}/?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en`, 8000);
                      const n = extract(html);
                      if (!n) throw new Error('no-match');
                      return { count: n, source: 'urlebird-google' };
                    },
                    async () => {
                      const html = await tget(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`, 8000);
                      const n = extract(html);
                      if (!n) throw new Error('no-match');
                      return { count: n, source: 'urlebird-proxy' };
                    },
                    async () => {
                      const d: any = await jget(`https://www.tikwm.com/api/user/info?unique_id=${HANDLES.tiktok}`);
                      const n = parseCompact(d?.data?.follower_count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'tikwm' };
                    },
                    async () => {
                      const d: any = await jget(`https://mixerno.space/api/tiktok-user-counter/user/${HANDLES.tiktok}`);
                      const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => /follow/i.test(c?.value || '')) : null;
                      const n = parseCompact(entry?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'mixerno' };
                    },
                  ]);
                } else if (platform === 'youtube') {
                  // resolve @handle -> UC id first
                  let ytId: string | null = HANDLES.youtube.startsWith('UC') ? HANDLES.youtube : null;
                  if (!ytId) {
                    try {
                      const html = await tget(`https://www.youtube.com/@${HANDLES.youtube.replace(/^@/, '')}/`);
                      const m = html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/) || html.match(/"browseId":"(UC[\w-]{22})"/);
                      if (m) ytId = m[1];
                    } catch {}
                  }
                  if (!ytId) throw new Error('could not resolve channel id');
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://mixerno.space/api/youtube-channel-counter/user/${ytId}`);
                      const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => c?.value === 'subscribers') : null;
                      const n = parseCompact(entry?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'mixerno' };
                    },
                    async () => {
                      const d: any = await jget(`https://pipedapi.kavin.rocks/channel/${ytId}`);
                      const n = parseCompact(d?.subscriberCount);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'piped' };
                    },
                  ]);
                } else if (platform === 'twitter') {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://api.fxtwitter.com/${HANDLES.twitter}`);
                      const n = parseCompact(d?.user?.followers);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'fxtwitter' };
                    },
                    async () => {
                      const d: any = await jget(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${HANDLES.twitter}`);
                      const n = parseCompact(Array.isArray(d) ? d[0]?.followers_count : d?.followers_count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'syndication' };
                    },
                  ]);
                } else if (platform === 'snapchat') {
                  result = await tryFirst([
                    async () => {
                      const html = await tget(`https://www.snapchat.com/add/${HANDLES.snapchat}/`);
                      const m = html.match(/"subscriberCount"\s*:\s*"?(\d[\d,.]*)"?/) || html.match(/([\d.,]+[KMB]?)\s+Subscribers?/i);
                      const n = m ? parseCompact(m[1]) : null;
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'profile_page' };
                    },
                  ]);
                } else {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${HANDLES.instagram}`, 12000, {
                        'X-IG-App-ID': '936619743392459',
                        'X-Requested-With': 'XMLHttpRequest',
                        Referer: `https://www.instagram.com/${HANDLES.instagram}/`,
                      });
                      const n = parseCompact(d?.data?.user?.edge_followed_by?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'web_profile_info' };
                    },
                    async () => {
                      const d: any = await jget(`https://mixerno.space/api/instagram-user-counter/user/${HANDLES.instagram}`);
                      const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => /follow/i.test(c?.value || '')) : null;
                      const n = parseCompact(entry?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'mixerno' };
                    },
                    async () => {
                      const html = await tget(`https://www.picuki.com/profile/${HANDLES.instagram}/`);
                      const m = html.match(/([\d.,]+[KMB]?)\s*<\/[^>]+>\s*Followers/i) || html.match(/([\d.,]+[KMB]?)\s+Followers/i);
                      const n = m ? parseCompact(m[1]) : null;
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'picuki' };
                    },
                    async () => {
                      const html = await tget(`https://www.instagram.com/${HANDLES.instagram}/`);
                      const og = html.match(/property="og:description"\s+content="([^"]+)"/)?.[1] || '';
                      const m = og.match(/([\d.,]+[KMB]?)\s+Followers/i);
                      const n = m ? parseCompact(m[1]) : null;
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'og_description' };
                    },
                  ]);
                }
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = 200;
                res.end(JSON.stringify({ platform, ...result, updatedAt: new Date().toISOString() }));
              } catch (err: any) {
                res.statusCode = 502;
                res.end(JSON.stringify({ platform, count: null, error: err.message || 'failed' }));
              }
              return;
            }
            if (req.url && req.url.startsWith('/api/kick')) {
              // Parse the URL
              const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const endpoint = url.searchParams.get('endpoint');
              
              if (!endpoint) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing endpoint' }));
                return;
              }
              
              try {
                const targetUrl = Array.isArray(endpoint) ? endpoint[0] : endpoint;
                
                // Use built-in Node.js fetch (Node 18+) with timeout so slow Kick API never hangs dev
                const kickController = new AbortController();
                const kickTimer = setTimeout(() => kickController.abort(), 12000);
                const response = await fetch(targetUrl, {
                  headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                  },
                  signal: kickController.signal,
                });
                
                const text = await response.text();
                clearTimeout(kickTimer);
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = response.status;
                res.end(text);
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
