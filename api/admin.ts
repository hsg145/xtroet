// ============================================================
//  لوحة إدارة البوت — API محمي بكلمة سر (Vercel Edge Function)
//
//  POST /api/admin  { action, deviceId, token?, ...params }
//
//  الأمان:
//   * كلمة السر في env باسم ADMIN_PASSWORD — لا تخرج من السيرفر أبداً.
//   * المقارنة SHA-256 بزمن ثابت (constant-time).
//   * التوكن HMAC-SHA256 مربوط بالجهاز، صلاحية 12 ساعة.
//   * 10 محاولات فاشلة لكل جهاز + لكل IP = قفل 24 ساعة.
//   * كل عملية ناجحة أو فاشلة تُسجَّل في admin_audit.
//   * جداول الإدارة service-role فقط (بلا وصول عام).
//
//  Env (Vercel ــ مشروع الموقع):
//    ADMIN_PASSWORD            (إلزامي — كلمة سر اللوحة)
//    SUPABASE_URL_BOT / ...    (نفس مفاتيح البوت — service key)
// ============================================================

export const config = { runtime: 'edge' };

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 ساعة
const LOCK_MS = 24 * 60 * 60 * 1000; // قفل 24 ساعة بعد 10 محاولات
const MAX_FAILS = 10;

function envs(): { url: string; key: string; pw: string } {
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
  const pw = (process.env.ADMIN_PASSWORD || '').trim();
  return { url, key, pw };
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

/* ── crypto (WebCrypto — متوفر في Edge) ─────────────────────── */

const te = new TextEncoder();

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** مقارنة بزمن ثابت — تمنع تخمين كلمة السر من فروق التوقيت. */
function constTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(keyStr: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeToken(pw: string, deviceId: string): Promise<{ token: string; expires_at: number }> {
  const expires_at = Date.now() + TOKEN_TTL_MS;
  const sig = await hmacHex(pw, `${deviceId}.${expires_at}`);
  return { token: `${expires_at}.${deviceId}.${sig}`, expires_at };
}

async function verifyToken(pw: string, deviceId: string, token: string): Promise<boolean> {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  const [expStr, dev, sig] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (dev !== deviceId || !dev) return false;
  const want = await hmacHex(pw, `${dev}.${exp}`);
  return constTimeEqual(want, sig);
}

/* ── Supabase REST (service key) ─────────────────────────────── */

function sb(url: string, key: string, path: string, init?: RequestInit) {
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function sbJson(url: string, key: string, path: string, init?: RequestInit): Promise<any> {
  const r = await sb(url, key, path, init);
  if (!r.ok) throw new Error(`db ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/* ── محاولات الدخول والقفل ──────────────────────────────────── */

async function getAttempt(url: string, key: string, akey: string) {
  try {
    const rows = await sbJson(url, key, `admin_attempts?key=eq.${encodeURIComponent(akey)}&select=fails,locked_until`);
    return Array.isArray(rows) && rows[0] ? rows[0] as { fails: number; locked_until: string | null } : null;
  } catch {
    return null;
  }
}

async function bumpFail(url: string, skey: string, akey: string): Promise<{ fails: number; locked_until: string | null }> {
  const cur = (await getAttempt(url, skey, akey)) ?? { fails: 0, locked_until: null };
  const fails = Number(cur.fails || 0) + 1;
  const locked_until = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : cur.locked_until;
  await sb(url, skey, 'admin_attempts', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: akey, fails, locked_until, updated_at: new Date().toISOString() }),
  }).catch(() => undefined);
  return { fails, locked_until };
}

async function resetAttempts(url: string, skey: string, keys: string[]) {
  await Promise.all(
    keys.map((k) =>
      sb(url, skey, `admin_attempts?key=eq.${encodeURIComponent(k)}`, { method: 'DELETE' }).catch(() => undefined),
    ),
  );
}

function isLocked(row: { locked_until: string | null } | null): string | null {
  if (!row?.locked_until) return null;
  return new Date(row.locked_until).getTime() > Date.now() ? row.locked_until : null;
}

/* ── سجل + صندوق البوت ─────────────────────────────────────── */

async function audit(url: string, skey: string, action: string, detail: unknown, deviceId: string, ip: string) {
  await sb(url, skey, 'admin_audit', {
    method: 'POST',
    body: JSON.stringify({ action, detail: detail ?? {}, device_id: String(deviceId || '').slice(0, 64), ip }),
  }).catch(() => undefined);
}

async function outbox(url: string, skey: string, channel_id: number, text: string) {
  await sb(url, skey, 'bot_outbox', {
    method: 'POST',
    body: JSON.stringify({ channel_id, text }),
  }).catch(() => undefined);
}

async function defaultChannel(url: string, skey: string, wanted?: number): Promise<{ id: number; slug: string } | null> {
  const rows = (await sbJson(url, skey, 'channels?select=id,slug&order=id&limit=20').catch(() => [])) as Array<{ id: number; slug: string }>;
  if (!rows?.length) return null;
  if (wanted) {
    const hit = rows.find((c) => Number(c.id) === Number(wanted));
    if (hit) return hit;
  }
  return rows[0] ?? null;
}

async function loadRanks(url: string, skey: string) {
  return (await sbJson(url, skey, 'ranks?select=idx,key,name_ar,name_en,emoji,min_points&order=idx.asc').catch(() => [])) as Array<{
    idx: number; key: string; name_ar: string; name_en: string; emoji: string; min_points: number;
  }>;
}

function rankFor(ranks: Array<{ idx: number; name_ar: string; name_en: string; emoji: string; min_points: number }>, points: number) {
  let hit = ranks[0];
  for (const r of ranks) if (points >= r.min_points) hit = r;
  return hit;
}

const num = (v: unknown, dflt = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

/* ── المعالج ────────────────────────────────────────────────── */

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }
  if (req.method === 'GET') return json({ ok: true, service: 'bot-admin' });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { url, key, pw } = envs();
  if (!url || !key) return json({ error: 'Supabase env missing' }, 500);
  if (!pw) return json({ error: 'ADMIN_PASSWORD is not configured on the server' }, 500);

  const ip = clientIp(req);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }
  const action = String(body.action || '');
  const deviceId = String(body.deviceId || '').slice(0, 64);
  if (!deviceId) return json({ error: 'deviceId required' }, 400);
  const dkey = `d:${deviceId}`;
  const ikey = `ip:${ip}`;

  /* ── الدخول (بدون توكن) ── */
  if (action === 'login') {
    const [d, i] = await Promise.all([getAttempt(url, key, dkey), getAttempt(url, key, ikey)]);
    const locked = isLocked(d) ?? isLocked(i);
    if (locked) {
      await audit(url, key, 'login_locked', {}, deviceId, ip);
      return json({ error: 'locked', locked_until: locked, fails_left: 0 }, 403);
    }
    const got = await sha256hex(String(body.password || ''));
    const want = await sha256hex(pw);
    if (!constTimeEqual(got, want)) {
      const [rd, ri] = await Promise.all([bumpFail(url, key, dkey), bumpFail(url, key, ikey)]);
      const nowLocked = isLocked(rd) ?? isLocked(ri);
      await audit(url, key, 'login_fail', {}, deviceId, ip);
      if (nowLocked) return json({ error: 'locked', locked_until: nowLocked, fails_left: 0 }, 403);
      const left = Math.max(0, MAX_FAILS - Math.max(rd.fails, ri.fails));
      return json({ error: 'wrong_password', fails_left: left }, 401);
    }
    await resetAttempts(url, key, [dkey, ikey]);
    const { token, expires_at } = await makeToken(pw, deviceId);
    await audit(url, key, 'login_ok', {}, deviceId, ip);
    return json({ ok: true, token, expires_at });
  }

  /* ── باقي العمليات: توكن إلزامي ── */
  const authed = await verifyToken(pw, deviceId, String(body.token || ''));
  if (!authed) return json({ error: 'unauthorized' }, 401);
  const runAudit = (a: string, detail?: unknown) => audit(url, key, a, detail, deviceId, ip);

  try {
    /* ── نظرة عامة ── */
    if (action === 'overview') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const [members, mods, settings, pending, recent] = await Promise.all([
        sbJson(url, key, `members?channel_id=eq.${ch.id}&select=kick_user_id,points&limit=5000`).catch(() => []),
        sbJson(url, key, `member_modifiers?channel_id=eq.${ch.id}&select=*`).catch(() => []),
        sbJson(url, key, 'bot_settings?select=key,value').catch(() => []),
        sbJson(url, key, `bot_outbox?channel_id=eq.${ch.id}&sent_at=is.null&select=id`).catch(() => []),
        sbJson(url, key, 'admin_audit?select=created_at,action,detail&order=created_at.desc&limit=6').catch(() => []),
      ]);
      const now = Date.now();
      const mutes = (mods as any[]).filter((m) => m.mute_until && new Date(m.mute_until).getTime() > now).length;
      const boosts = (mods as any[]).filter(
        (m) => m.multiplier != null && Number(m.multiplier) !== 1 && m.multiplier_until && new Date(m.multiplier_until).getTime() > now,
      ).length;
      const totalPoints = (members as any[]).reduce((s, m) => s + (Number(m.points) || 0), 0);
      const get = (k: string) => (settings as any[]).find((s) => s.key === k)?.value ?? null;
      return json({
        channel: ch,
        stats: {
          members: (members as any[]).length,
          totalPoints,
          mutes,
          boosts,
          pendingOutbox: (pending as any[]).length,
        },
        event: get('event'),
        drop: get('drop'),
        recent,
      });
    }

    /* ── البحث عن شخص ── */
    if (action === 'user_search') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const q = String(body.name || '').trim().replace(/^@/, '');
      if (!q) return json({ error: 'name_required' }, 400);
      const rows = (await sbJson(
        url, key,
        `members?channel_id=eq.${ch.id}&username=ilike.*${encodeURIComponent(q)}*&select=kick_user_id,username,points,message_count,rank_idx&limit=5`,
      ).catch(() => [])) as any[];
      if (!rows.length) return json({ found: false });
      const m = rows[0];
      const [ranks, modRows] = await Promise.all([
        loadRanks(url, key),
        sbJson(url, key, `member_modifiers?channel_id=eq.${ch.id}&kick_user_id=eq.${m.kick_user_id}&select=*`).catch(() => []),
      ]);
      const rk = rankFor(ranks, Number(m.points) || 0);
      let avatar = '';
      try {
        const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(m.username)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        });
        if (r.ok) {
          const j = await r.json();
          avatar = (j?.data ?? j)?.user?.profile_pic ?? '';
        }
      } catch { /* بدون صورة */ }
      // ترتيبه
      let position: number | null = null;
      try {
        const all = (await sbJson(url, key, `members?channel_id=eq.${ch.id}&select=points&limit=5000`).catch(() => [])) as any[];
        position = all.filter((x) => Number(x.points) > Number(m.points)).length + 1;
      } catch { /* بدون ترتيب */ }
      return json({
        found: true,
        channel: ch,
        member: m,
        rank: rk,
        position,
        avatar,
        modifier: (modRows as any[])[0] ?? null,
        ranks,
      });
    }

    /* ── نقاط: إضافة / تعيين ── */
    if (action === 'user_points') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      const mode = String(body.mode || 'add');
      const amount = Math.trunc(num(body.amount, 0));
      if (!uid || !['add', 'set'].includes(mode) || !Number.isFinite(amount) || amount < -1000000 || amount > 100000000) {
        return json({ error: 'bad_params' }, 400);
      }
      const cur = (await sbJson(url, key, `members?channel_id=eq.${ch.id}&kick_user_id=eq.${uid}&select=points,username`).catch(() => [])) as any[];
      if (!cur.length) return json({ error: 'not_found' }, 404);
      const before = Number(cur[0].points) || 0;
      const after = mode === 'add' ? before + amount : amount;
      if (after < 0 || after > 100000000) return json({ error: 'out_of_range' }, 400);
      const res = await sbJson(url, key, 'rpc/set_points', {
        method: 'POST',
        body: JSON.stringify({ p_channel_id: ch.id, p_user_id: uid, p_username: String(body.username || cur[0].username || ''), p_points: after, p_reset_messages: false }),
      });
      await runAudit('user_points', { user_id: uid, mode, amount, before, after });
      return json({ ok: true, result: Array.isArray(res) ? res[0] : res });
    }

    /* ── تغيير الرتبة (نقاط = عتبة الرتبة) ── */
    if (action === 'user_rank') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      const ridx = Math.trunc(num(body.rank_idx, 0));
      if (!uid || ridx < 1 || ridx > 50) return json({ error: 'bad_params' }, 400);
      const ranks = await loadRanks(url, key);
      const target = ranks.find((r) => r.idx === ridx);
      if (!target) return json({ error: 'rank_not_found' }, 404);
      const res = await sbJson(url, key, 'rpc/set_points', {
        method: 'POST',
        body: JSON.stringify({ p_channel_id: ch.id, p_user_id: uid, p_username: String(body.username || ''), p_points: target.min_points, p_reset_messages: false }),
      });
      await outbox(url, key, ch.id, `🎖 @${String(body.username || uid)} → ${target.name_ar}!`);
      await runAudit('user_rank', { user_id: uid, rank_idx: ridx, points: target.min_points });
      return json({ ok: true, result: Array.isArray(res) ? res[0] : res, rank: target });
    }

    /* ── تصفير شخص + مسح عقوباته ── */
    if (action === 'user_reset') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      if (!uid) return json({ error: 'bad_params' }, 400);
      await sbJson(url, key, 'rpc/set_points', {
        method: 'POST',
        body: JSON.stringify({ p_channel_id: ch.id, p_user_id: uid, p_username: String(body.username || ''), p_points: 0, p_reset_messages: true }),
      }).catch(() => null);
      await sb(url, key, `member_modifiers?channel_id=eq.${ch.id}&kick_user_id=eq.${uid}`, { method: 'DELETE' }).catch(() => undefined);
      await runAudit('user_reset', { user_id: uid });
      return json({ ok: true });
    }

    /* ── تايم آوت (كتم النقاط — يعمل حتى على المشرفين) ── */
    if (action === 'user_mute') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      const minutes = Math.trunc(num(body.minutes, 0));
      if (!uid || minutes < 1 || minutes > 10080) return json({ error: 'bad_params' }, 400);
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      await sb(url, key, 'member_modifiers', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ channel_id: ch.id, kick_user_id: uid, mute_until: until, updated_at: new Date().toISOString() }),
      });
      await outbox(url, key, ch.id, `⏱ @${String(body.username || uid)} تايم آوت ${minutes} دقيقة!`);
      await runAudit('user_mute', { user_id: uid, minutes, until });
      return json({ ok: true, until });
    }

    if (action === 'user_unmute') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      if (!uid) return json({ error: 'bad_params' }, 400);
      await sb(url, key, `member_modifiers?channel_id=eq.${ch.id}&kick_user_id=eq.${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ mute_until: null, updated_at: new Date().toISOString() }),
      });
      await runAudit('user_unmute', { user_id: uid });
      return json({ ok: true });
    }

    /* ── تعزيز/عقوبة شخص: دبل، تربل، نصف نقطة، تجميد ── */
    if (action === 'user_boost') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      const mult = num(body.mult, 1);
      const minutes = Math.trunc(num(body.minutes, 0));
      if (!uid || !(mult >= 0 && mult <= 10) || minutes < 1 || minutes > 10080) return json({ error: 'bad_params' }, 400);
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      await sb(url, key, 'member_modifiers', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ channel_id: ch.id, kick_user_id: uid, multiplier: mult, multiplier_until: until, updated_at: new Date().toISOString() }),
      });
      const label = mult === 0 ? 'تجميد النقاط 🧊' : mult === 0.5 ? 'نصف نقطة per رسالة 💔' : `دبل x${mult} ⚡`;
      await outbox(url, key, ch.id, `⚡ @${String(body.username || uid)}: ${label} لمدة ${minutes} دقيقة!`);
      await runAudit('user_boost', { user_id: uid, mult, minutes, until });
      return json({ ok: true, until });
    }

    if (action === 'user_boost_clear') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const uid = num(body.user_id, 0);
      if (!uid) return json({ error: 'bad_params' }, 400);
      await sb(url, key, `member_modifiers?channel_id=eq.${ch.id}&kick_user_id=eq.${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ multiplier: null, multiplier_until: null, updated_at: new Date().toISOString() }),
      });
      await runAudit('user_boost_clear', { user_id: uid });
      return json({ ok: true });
    }

    /* ── قائمة العقوبات/التعزيزات النشطة ── */
    if (action === 'modifiers_list') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const mods = (await sbJson(url, key, `member_modifiers?channel_id=eq.${ch.id}&select=*&order=updated_at.desc&limit=100`).catch(() => [])) as any[];
      const ids = [...new Set(mods.map((m) => m.kick_user_id))];
      let names: Record<string, string> = {};
      if (ids.length) {
        const mems = (await sbJson(url, key, `members?channel_id=eq.${ch.id}&kick_user_id=in.(${ids.join(',')})&select=kick_user_id,username,points`).catch(() => [])) as any[];
        mems.forEach((m) => {
          names[String(m.kick_user_id)] = m.username;
        });
      }
      const now = Date.now();
      return json({
        items: mods.map((m) => ({
          ...m,
          username: names[String(m.kick_user_id)] || String(m.kick_user_id),
          muted: !!(m.mute_until && new Date(m.mute_until).getTime() > now),
          boosted: !!(m.multiplier != null && Number(m.multiplier) !== 1 && m.multiplier_until && new Date(m.multiplier_until).getTime() > now),
        })),
      });
    }

    /* ── فعالية عامة: دبل / تربل / تخريب / مخصص ── */
    if (action === 'event_start') {
      const mult = num(body.mult, 0);
      const minutes = Math.trunc(num(body.minutes, 0));
      const kind = String(body.kind || 'custom');
      if (!(mult > 0 && mult <= 10) || minutes < 1 || minutes > 10080) return json({ error: 'bad_params' }, 400);
      const label =
        String(body.label || '') ||
        (mult === 2 ? '🔥 فعالية الدبل — النقاط مضروبة ×2!' : mult === 3 ? '⚡ فعالية التربل — النقاط ×3!' : mult < 1 ? '💔 فعالية التخريب — كل رسالة بنصف نقطة!' : `✨ فعالية ×${mult}!`);
      const value = { kind, mult, label, ends_at: new Date(Date.now() + minutes * 60000).toISOString() };
      await sb(url, key, 'bot_settings', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'event', value, updated_at: new Date().toISOString() }),
      });
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (ch) await outbox(url, key, ch.id, `${label} (لمدة ${minutes} دقيقة)`);
      await runAudit('event_start', { kind, mult, minutes });
      return json({ ok: true, event: value });
    }

    if (action === 'event_stop') {
      await sb(url, key, 'bot_settings?key=eq.event', {
        method: 'PATCH',
        body: JSON.stringify({ value: {}, updated_at: new Date().toISOString() }),
      });
      await runAudit('event_stop', {});
      return json({ ok: true });
    }

    /* ── كود النقاط المخفي (اكتب الكلمة وخذ نقاط) ── */
    if (action === 'drop_start') {
      const word = String(body.word || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const amount = Math.trunc(num(body.amount, 0));
      const per_max = Math.trunc(num(body.per_max, 1));
      const minutes = Math.trunc(num(body.minutes, 0));
      if (word.length < 2 || word.length > 24 || amount < 1 || amount > 100000 || per_max < 1 || per_max > 100 || minutes < 1 || minutes > 10080) {
        return json({ error: 'bad_params' }, 400);
      }
      const value = { word, amount, per_max, ends_at: new Date(Date.now() + minutes * 60000).toISOString() };
      await sb(url, key, 'bot_settings', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'drop', value, updated_at: new Date().toISOString() }),
      });
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (ch) await outbox(url, key, ch.id, `🎁 فعالية النقاط المخفية بدأت! اكتب الكلمة الصحيحة وخذ ${amount} نقطة! (لمدة ${minutes} دقيقة)`);
      await runAudit('drop_start', { amount, per_max, minutes });
      return json({ ok: true, drop: { ...value, word: '•••' } });
    }

    if (action === 'drop_stop') {
      await sb(url, key, 'bot_settings?key=eq.drop', {
        method: 'PATCH',
        body: JSON.stringify({ value: {}, updated_at: new Date().toISOString() }),
      });
      await runAudit('drop_stop', {});
      return json({ ok: true });
    }

    if (action === 'drop_status') {
      const settings = (await sbJson(url, key, 'bot_settings?select=value&key=eq.drop').catch(() => [])) as any[];
      const drop = settings[0]?.value ?? null;
      let claims = 0;
      let users = 0;
      if (drop?.word) {
        const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
        if (ch) {
          const rows = (await sbJson(
            url, key,
            `drop_claims?channel_id=eq.${ch.id}&word=eq.${encodeURIComponent(drop.word)}&select=count`,
          ).catch(() => [])) as any[];
          users = rows.length;
          claims = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
        }
      }
      return json({ drop: drop?.word ? { ...drop, word: '•••' } : null, claims, users });
    }

    /* ── أسعار الرتب (العتبات) ── */
    if (action === 'ranks_get') {
      return json({ ranks: await loadRanks(url, key) });
    }

    if (action === 'ranks_set') {
      const items = (body.items || []) as Array<{ idx: number; min_points: number }>;
      if (!Array.isArray(items) || items.length !== 15) return json({ error: 'need_15_ranks' }, 400);
      const clean = items.map((it) => ({ idx: Math.trunc(num(it.idx, 0)), min_points: Math.trunc(num(it.min_points, -1)) }));
      const idxs = clean.map((c) => c.idx).sort((a, b) => a - b);
      if (idxs.some((v, i) => v !== i + 1)) return json({ error: 'bad_idx' }, 400);
      if (clean.some((c) => c.min_points < 0 || c.min_points > 100000000)) return json({ error: 'out_of_range' }, 400);
      const byIdx = [...clean].sort((a, b) => a.idx - b.idx);
      if (byIdx[0]!.min_points !== 0) return json({ error: 'first_must_be_zero' }, 400);
      for (let i = 1; i < byIdx.length; i++) {
        if (byIdx[i]!.min_points <= byIdx[i - 1]!.min_points) return json({ error: 'must_ascend', at: byIdx[i]!.idx }, 400);
      }
      for (const c of byIdx) {
        const r = await sb(url, key, `ranks?idx=eq.${c.idx}`, {
          method: 'PATCH',
          body: JSON.stringify({ min_points: c.min_points }),
        });
        if (!r.ok) return json({ error: 'save_failed' }, 500);
      }
      // إعادة حساب رتب الجميع على الأسعار الجديدة
      await sb(url, key, 'rpc/recompute_all_ranks' as string, { method: 'POST', body: '{}' }).catch(() => undefined);
      await runAudit('ranks_set', { items: byIdx });
      return json({ ok: true });
    }

    /* ── إعلان يدوي في الشات ── */
    if (action === 'announce') {
      const ch = await defaultChannel(url, key, num(body.channel_id, 0) || undefined);
      if (!ch) return json({ error: 'no_channel' }, 500);
      const text = String(body.text || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 400);
      if (text.length < 2) return json({ error: 'too_short' }, 400);
      await outbox(url, key, ch.id, text);
      await runAudit('announce', { text: text.slice(0, 80) });
      return json({ ok: true });
    }

    /* ── السجل ── */
    if (action === 'audit_list') {
      const rows = await sbJson(url, key, 'admin_audit?select=created_at,action,detail,device_id,ip&order=created_at.desc&limit=50');
      return json({ items: rows });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e: any) {
    return json({ error: 'server_error' }, 500);
  }
}
