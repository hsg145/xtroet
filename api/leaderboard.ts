// ============================================================
//  Police Ranks Counter — leaderboard API (Vercel Edge Function)
//  GET  /api/leaderboard            → top entries (points desc)
//  POST /api/leaderboard { name }   → join / update your entry
//
//  المبدأ: الزائر يكتب اسمه في الموقع فينزل على اللوحة مباشرة.
//  الكتابة تتم عبر مفتاح الخدمة (server-only) — ما في أي صلاحية
//  كتابة للـ anon، والـ RLS مفعّل ويقرأ فقط للجميع.
//
//  Env: SUPABASE_URL_BOT / SUPABASE_SECRET_KEY_BOT (مشروع البوت)
// ============================================================

export const config = { runtime: 'edge' };

const MAX_NAME = 24;

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

function json(data: unknown, status = 200, cache = false): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(cache ? { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } : {}),
    },
  });
}

const jsonHeaders = { apikey: '', Authorization: '', 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };

/** يطبّع الاسم: يقصّ الطول، يمنع المحارف الخطرة، ويحوّل الفراغات لشرطة. */
function cleanName(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  if (s.length < 2) throw new Error('الاسم قصير جداً');
  return s;
}

/** يمنع الرموز المنبثقة (🧨 ونحوها) حتى لا تتعطّل الصفحة. */
function hasBidi(s: string): boolean {
  return /[‪-‮⁦-⁩]/.test(s);
}

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { url, key } = envs();
  if (!url || !key) return json({ error: 'Supabase env missing' }, 500);
  const headers = { ...jsonHeaders, apikey: key, Authorization: `Bearer ${key}` };

  // ── GET: اللوحة ──
  if (request.method === 'GET') {
    try {
      // جدول الرتب هو مصدر الحقيقة للرتبة — نفس جدول البوت.
      const [rowsRes, ranksRes] = await Promise.all([
        fetch(
          `${url}/rest/v1/leaderboard_signups` +
            `?select=name,display,points,rank_idx,avatar_url,created_at` +
            `&order=points.desc,created_at.asc&limit=100`,
          { headers },
        ),
        fetch(`${url}/rest/v1/ranks?select=idx,name_ar,name_en,emoji,min_points&order=min_points.asc`, {
          headers,
        }),
      ]);

      if (!rowsRes.ok) return json({ entries: [], ranks: [], error: `read failed ${rowsRes.status}` }, 200, true);
      const rows = (await rowsRes.json()) as any[];
      const ranks = ranksRes.ok
        ? ((await ranksRes.json()) as Array<{ idx: number; name_ar: string; name_en: string; emoji: string; min_points: number }>)
        : [];

      const rankFor = (points: number) => {
        let hit = ranks[0];
        for (const r of ranks) if (points >= r.min_points) hit = r;
        return hit;
      };

      const entries = rows.map((r, i) => {
        const points = Number(r.points) || 0;
        const hit = rankFor(points);
        return {
          rank: i + 1,
          name: r.display || r.name,
          points,
          rank_idx: hit?.idx ?? Number(r.rank_idx) ?? 1,
          rank_ar: hit?.name_ar ?? '',
          rank_en: hit?.name_en ?? '',
          emoji: hit?.emoji ?? '',
          next_at: (() => {
            const nxt = ranks.find((x) => x.min_points > points);
            return nxt ? { points: nxt.min_points, label: nxt.name_ar } : null;
          })(),
          avatar: r.avatar_url || '',
        };
      });

      return json({ entries }, 200, true);
    } catch (e: any) {
      return json({ entries: [], error: String(e?.message || e).slice(0, 140) }, 200, true);
    }
  }

  // ── POST: انضمام ──
  if (request.method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    let name: string;
    try {
      name = cleanName(body?.name);
    } catch (e: any) {
      return json({ error: e?.message || 'اسم غير صالح' }, 400);
    }
    if (hasBidi(name)) return json({ error: 'الاسم يحتوي محارف غير مسموحة' }, 400);

    const avatar = String(body?.avatar ?? '').slice(0, 500);

    try {
      // نبحث أولاً بدل on_conflict على فهرس دالة — أبسط ومضمون مع PostgREST.
      const lookup = await fetch(
        `${url}/rest/v1/leaderboard_signups?select=id&name=ilike.${encodeURIComponent(name)}&limit=1`,
        { headers },
      );
      const found = lookup.ok ? ((await lookup.json()) as Array<{ id: number }>) : [];

      let write: string;
      let method: string;
      let payload: Record<string, unknown>;

      if (found.length) {
        method = 'PATCH';
        payload = { display: name, avatar_url: avatar || null, updated_at: new Date().toISOString() };
        write = `${url}/rest/v1/leaderboard_signups?id=eq.${found[0].id}`;
      } else {
        method = 'POST';
        payload = { name, display: name, avatar_url: avatar || null };
        write = `${url}/rest/v1/leaderboard_signups`;
      }

      const res = await fetch(write, {
        method,
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        return json({ error: `تعذر الحفظ: ${t.slice(0, 160)}` }, 500);
      }
      return json({ ok: true, name, updated: found.length > 0 }, 200);
    } catch (e: any) {
      return json({ error: String(e?.message || e).slice(0, 160) }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}