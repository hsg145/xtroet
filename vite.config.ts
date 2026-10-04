import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
              const HANDLES: Record<string, string> = { tiktok: 'ixtroet', instagram: 'xtroet', twitter: 'xtroet', youtube: 'XTROET' };
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
              const jget = async (u: string, timeoutMs = 12000) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                  const r = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: controller.signal });
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
                  res.end(JSON.stringify({ error: 'Use ?platform=tiktok|instagram|youtube|twitter' }));
                  return;
                }
                let result: { count: number; source: string };
                if (platform === 'tiktok') {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://user.tikmatrix.com/api/user?username=${HANDLES.tiktok}`);
                      const n = parseCompact(d?.stats?.Followers);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'tikmatrix' };
                    },
                    async () => {
                      const d: any = await jget(`https://countik.com/api/tiktok/@${HANDLES.tiktok}`);
                      const n = parseCompact(d?.followerCount ?? d?.followers ?? d?.follower_count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'countik' };
                    },
                  ]);
                } else if (platform === 'youtube') {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://mixerno.space/api/youtube-channel-counter/user/${HANDLES.youtube}`);
                      const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => c?.value === 'subscribers') : null;
                      const n = parseCompact(entry?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'mixerno' };
                    },
                    async () => {
                      const d: any = await jget(`https://pipedapi.kavin.rocks/channel/${HANDLES.youtube}`);
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
                } else {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${HANDLES.instagram}`);
                      const n = parseCompact(d?.data?.user?.edge_followed_by?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'web_profile_info' };
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
