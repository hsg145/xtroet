// ============================================================
//  XTROET Bot — Kick OAuth Login (Vercel Edge Function)
//  GET /api/kick-login  →  302 redirect to id.kick.com/authorize
//
//  PKCE flow: verifier مخزن بكوكي httpOnly قصير العمر،
//  والـ callback (/api/kick-callback) يقرأه ويبدّل الكود بتوكن.
//
//  Env (Vercel → Settings → Environment Variables):
//    KICK_CLIENT_ID, KICK_CLIENT_SECRET,
//    KICK_REDIRECT_URI (اختياري — الافتراضي: https://<host>/api/kick-callback)
//    KICK_SCOPES (اختياري — الافتراضي: user:read channel:read chat:write events:subscribe)
// ============================================================

export const config = { runtime: 'edge' };

const DEFAULT_SCOPES = 'user:read channel:read chat:write events:subscribe';

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  // base64url بدون padding
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function redirectUriFor(reqUrl: URL): string {
  const fromEnv = (process.env.KICK_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  return `${reqUrl.origin}/api/kick-callback`;
}

export default async function handler(request: Request) {
  const reqUrl = new URL(request.url);
  const clientId = (process.env.KICK_CLIENT_ID || '').trim();

  if (!clientId) {
    return new Response(
      JSON.stringify({ error: 'KICK_CLIENT_ID is not configured in Vercel Environment Variables.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const redirectUri = redirectUriFor(reqUrl);
  const scope = (process.env.KICK_SCOPES || DEFAULT_SCOPES).trim() || DEFAULT_SCOPES;

  const verifier = randomToken(48);
  const state = randomToken(24);
  const challenge = await sha256Base64Url(verifier);

  const auth = new URL('https://id.kick.com/oauth/authorize');
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('scope', scope);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('state', state);

  const cookieBase = 'Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure';
  const headers = new Headers();
  headers.append('Set-Cookie', `kick_verifier=${verifier}; ${cookieBase}`);
  headers.append('Set-Cookie', `kick_state=${state}; ${cookieBase}`);
  headers.set('Location', auth.toString());

  return new Response(null, { status: 302, headers });
}
