// ============================================================
//  مبلّغ أخطاء الواجهة — Client crash reporter (Vercel Edge Function)
//
//  POST /api/client-error  { message, stack?, url?, ua? }
//
//  بلا مصادقة عمداً: هو نفسه يُستدعى عندما تكون الجلسة ميتة أصلاً.
//  يكتب في admin_audit فقط (جدول service-role، لا يُقرأ علناً)، وبحدود
//  صارمة على الحجم حتى لا يتحوّل لمكب نفايات.
//
//  Env: نفس مفاتيح البوت (SUPABASE_URL_BOT / SUPABASE_SECRET_KEY_BOT)
// ============================================================

export const config = { runtime: 'edge' };

function envs(): { url: string; key: string } {
  const url = (
    process.env.SUPABASE_URL_BOT || process.env.KICK_SUPABASE_URL || process.env.SUPABASE_URL || ''
  ).trim().replace(/\/$/, '');
  const key = (
    process.env.SUPABASE_SECRET_KEY_BOT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY_BOT ||
    process.env.KICK_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  return { url, key };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim().slice(0, 64) || 'unknown';
}

const clip = (v: unknown, n: number): string => String(v ?? '').slice(0, n);

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { url, key } = envs();
  if (!url || !key) return json({ error: 'Supabase env missing' }, 500);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const message = clip(body.message, 500);
  if (!message) return json({ error: 'message required' }, 400);

  const detail = {
    message,
    stack: clip(body.stack, 2000),
    url: clip(body.url, 200),
    ua: clip(body.ua, 200),
  };

  try {
    await fetch(`${url}/rest/v1/admin_audit`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'client_error',
        detail,
        device_id: 'browser',
        ip: clientIp(req),
      }),
    });
  } catch {
    // التبليغ نفسه لا يجب أن يكسر شيئاً أبداً.
  }
  return json({ ok: true });
}
