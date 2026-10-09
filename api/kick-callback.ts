// ============================================================
//  XTROET Bot — Kick OAuth Callback (Vercel Edge Function)
//  GET /api/kick-callback?code=...&state=...
//
//  1) يتحقق من state ضد الكوكي (حماية CSRF)
//  2) يبدّل code + code_verifier بتوكن من id.kick.com/oauth/token
//  3) يجلب قناة المالك من api.kick.com/public/v1/channels
//  4) يحفظ القناة + التوكن في Supabase (نفس جداول BOT: channels, kick_tokens)
//  5) يعيد التوجيه للرئيسية: /?kick=connected&channel=<slug>
//
//  Env المطلوبة:
//    KICK_CLIENT_ID, KICK_CLIENT_SECRET,
//    SUPABASE_URL (أو VITE_SUPABASE_URL),
//    SUPABASE_SECRET_KEY (أو SUPABASE_SERVICE_KEY)
//    KICK_TARGET_CHANNEL_SLUG (اختياري — للتحقق أن القناة المربوطة هي قناتك)
// ============================================================

export const config = { runtime: 'edge' };

function redirectUriFor(reqUrl: URL): string {
  const fromEnv = (process.env.KICK_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  return `${reqUrl.origin}/api/kick-callback`;
}

function cookiesOf(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function errorPage(title: string, detail: string): Response {
  const safe = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c));
  return new Response(
    `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${safe(title)}</title></head><body style="font-family:sans-serif;background:#04120D;color:#fff;padding:2rem;text-align:center">` +
      `<h2>❌ ${safe(title)}</h2><p style="color:#ffffffaa;max-width:560px;margin:0 auto;line-height:1.9">${safe(detail)}</p>` +
      `<p><a href="/" style="color:#53FC18;font-weight:bold">← رجوع للموقع</a></p></body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function supabaseEnv(): { url: string; key: string } {
  // *_BOT أولاً: مشروع البوت (channels + kick_tokens). هذا مقصود —
  // المشروع بلا لاحقة يخص ألبوم الموقع، لا يجوز أن تُكتب التوكنز فيه.
  const url = (
    process.env.SUPABASE_URL_BOT ||
    process.env.KICK_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  const key = (
    process.env.SUPABASE_SECRET_KEY_BOT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY_BOT ||
    process.env.KICK_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();
  return { url, key };
}

export default async function handler(request: Request) {
  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get('code') || '';
  const state = reqUrl.searchParams.get('state') || '';
  const oauthError = reqUrl.searchParams.get('error') || '';

  if (oauthError) return errorPage('فشل التفويض', `رفض Kick التفويض: ${oauthError}. حاول مجدداً من زر الربط.`);
  if (!code) return errorPage('لا يوجد كود', 'Kick لم يرجع authorization code. ابدأ من زر «ربط قناة Kick» في الموقع.');

  const cookies = cookiesOf(request);
  const verifier = cookies['kick_verifier'] || '';
  const savedState = cookies['kick_state'] || '';
  if (!verifier) return errorPage('انتهت الجلسة', 'انتهت صلاحية جلسة الربط (الكوكيز). ارجع للموقع واضغط زر الربط من جديد.');
  if (savedState && state && savedState !== state) return errorPage('تحقق الأمان فشل', 'state غير مطابق — قد تكون ضغطت رابط قديم. ابدأ الربط من جديد.');

  const clientId = (process.env.KICK_CLIENT_ID_BOT || process.env.KICK_CLIENT_ID || '').trim();
  const clientSecret = (process.env.KICK_CLIENT_SECRET_BOT || process.env.KICK_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return errorPage('إعداد ناقص', 'KICK_CLIENT_ID / KICK_CLIENT_SECRET غير مضبوطة في Vercel. أضفها ثم أعد المحاولة.');
  }
  const redirectUri = redirectUriFor(reqUrl);

  // ---- 1) تبديل الكود بتوكن ----
  let token: any;
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    });
    const res = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    if (!res.ok) return errorPage('فشل تبديل التوكن', `id.kick.com رجع ${res.status}: ${text.slice(0, 200)}`);
    token = JSON.parse(text);
  } catch (e: any) {
    return errorPage('خطأ شبكة', `تعذر الوصول لخوادم Kick: ${String(e?.message || e).slice(0, 160)}`);
  }
  if (!token?.access_token) return errorPage('توكن ناقص', 'Kick لم يرجع access_token. حاول مجدداً.');

  // ---- 2) جلب قناة المالك ----
  let channelId = 0;
  let slug = '';
  try {
    const res = await fetch('https://api.kick.com/public/v1/channels', {
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) return errorPage('فشل قراءة القناة', `Kick API رجع ${res.status}: ${text.slice(0, 200)} — غالباً نقص صلاحية channel:read.`);
    const data = JSON.parse(text);
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    // فضّل القناة المطلوبة إن وُجدت، وإلا خذ أول قناة يملكها الحساب
    const wanted = (
      process.env.KICK_TARGET_CHANNEL_SLUG_BOT ||
      process.env.KICK_TARGET_CHANNEL_SLUG ||
      'xtroet'
    ).trim().toLowerCase();
    const pick =
      list.find((c: any) => String(c?.slug || c?.broadcaster_slug || '').toLowerCase() === wanted) || list[0];
    if (!pick) return errorPage('لا توجد قناة', 'التوكن صحيح لكن Kick لم يرجع أي قناة — سجّل الدخول بحساب يملك قناة (حساب البث نفسه).');
    channelId = Number(pick.broadcaster_user_id ?? pick.broadcasterUserId ?? pick.user_id ?? pick.id ?? 0);
    slug = String(pick.slug || pick.broadcaster_slug || wanted || '');
    if (!channelId) return errorPage('معرف القناة ناقص', 'تعذر استخراج broadcaster_user_id من رد Kick.');
  } catch (e: any) {
    return errorPage('خطأ قراءة القناة', String(e?.message || e).slice(0, 200));
  }

  // ---- 3) حفظ في Supabase (نفس جداول البوت) ----
  const { url: sbUrl, key: sbKey } = supabaseEnv();
  if (!sbUrl || !sbKey) {
    return errorPage('Supabase ناقص', 'SUPABASE_URL / SUPABASE_SECRET_KEY غير مضبوطة في Vercel — أضفها ثم أعد الربط.');
  }
  try {
    const base = sbUrl.replace(/\/$/, '');
    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    };
    // channels upsert
    const chRes = await fetch(`${base}/rest/v1/channels?on_conflict=id`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: channelId, slug }),
    });
    if (!chRes.ok) {
      const t = await chRes.text();
      return errorPage('فشل حفظ القناة', `Supabase channels: ${chRes.status} ${t.slice(0, 200)}`);
    }
    // kick_tokens upsert
    const expiresIn = Number(token.expires_in ?? 3600);
    const tokRes = await fetch(`${base}/rest/v1/kick_tokens?on_conflict=channel_id`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel_id: channelId,
        broadcaster_user_id: channelId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? '',
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scope: token.scope ?? null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!tokRes.ok) {
      const t = await tokRes.text();
      return errorPage('فشل حفظ التوكن', `Supabase kick_tokens: ${tokRes.status} ${t.slice(0, 200)}`);
    }
  } catch (e: any) {
    return errorPage('خطأ Supabase', String(e?.message || e).slice(0, 200));
  }

  // ---- 4) نجاح → رجوع للموقع ----
  const headers = new Headers();
  headers.append('Set-Cookie', 'kick_verifier=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  headers.append('Set-Cookie', 'kick_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  headers.set('Location', `/?kick=connected&channel=${encodeURIComponent(slug || String(channelId))}`);
  return new Response(null, { status: 302, headers });
}
