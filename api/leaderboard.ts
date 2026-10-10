// ============================================================
//  Police Ranks Counter — leaderboard + name search (Vercel Edge Function)
//
//  GET  /api/leaderboard                → top chatterboard (points desc)
//  GET  /api/leaderboard?name=abc       → ابحث عن شخص بالاسم
//        {
//          found, name, display, avatar, verified, followers,
//          points, rank_idx, rank_ar, rank_en, emoji, position, next_at
//        }
//
//  مصدر البيانات: نفس جداول البوت (members + leaderboard view + ranks).
//  الصورة والاسم والـ verified والتابعين: من Kick API (/api/kick proxy).
//  الاسم لازم يكون إنجليزي فقط (نفس قواعد Kick usernames).
//
//  Env: SUPABASE_URL_BOT / SUPABASE_SECRET_KEY_BOT (مشروع البوت)
//       + KICK_TARGET_CHANNEL_SLUG_BOT اختياري
// ============================================================

export const config = { runtime: 'edge' };

/** Kick usernames: حروف إنجليزية + أرقام + _ و . فقط، 3–24 حرف. */
const NAME_RE = /^[A-Za-z0-9_.]{3,24}$/;

function envs(): { url: string; key: string; slug: string } {
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
  const slug = (
    process.env.KICK_TARGET_CHANNEL_SLUG_BOT || process.env.KICK_TARGET_CHANNEL_SLUG || 'xtroet'
  ).trim();
  return { url, key, slug };
}

function json(data: unknown, status = 200, cache = false): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(cache ? { 'Cache-Control': 's-maxage=45, stale-while-revalidate=180' } : {}),
    },
  });
}

/** يقرأ جدول الرتب (15 رتبة) ويحسب الرتبة من النقاط. */
async function loadRanks(h: Record<string, string>) {
  const res = await fetch(
    `${h.__url}/rest/v1/ranks?select=idx,name_ar,name_en,emoji,min_points&order=min_points.asc`,
    { headers: h },
  );
  if (!res.ok) return [] as Array<{ idx: number; name_ar: string; name_en: string; emoji: string; min_points: number }>;
  return (await res.json()) as Array<{ idx: number; name_ar: string; name_en: string; emoji: string; min_points: number }>;
}

function rankFor(ranks: Awaited<ReturnType<typeof loadRanks>>, points: number) {
  let hit = ranks[0];
  for (const r of ranks) if (points >= r.min_points) hit = r;
  const next = ranks.find((x) => x.min_points > points);
  return {
    rank_idx: hit?.idx ?? 1,
    rank_ar: hit?.name_ar ?? '',
    rank_en: hit?.name_en ?? '',
    emoji: hit?.emoji ?? '',
    next_at: next ? { points: next.min_points } : null,
  };
}

/** صورة Kick + التوثيق لاسم واحد — مع مهلة حتى لا تعلق الحافة. */
async function kickIdentity(name: string): Promise<{ avatar: string; verified: boolean }> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: ctl.signal,
      });
      if (!r.ok) return { avatar: '', verified: false };
      const j = await r.json();
      const d = j?.data ?? j;
      return {
        avatar: (d?.user?.profile_pic as string) ?? '',
        verified: d?.verified === true,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { avatar: '', verified: false };
  }
}

/**
 * يملأ صور المتصدرين الأوائل فقط (10) بدفعات متوازية محدودة —
 * حتى تبقى استجابة الـ Edge سريعة. الباقي يظهر بالحرف الأول.
 */
async function fillTopAvatars(entries: Array<{ name: string }>): Promise<Array<{ avatar: string; verified: boolean }>> {
  const TOP_N = 10;
  const CONC = 5;
  const top = entries.slice(0, TOP_N);
  const out: Array<{ avatar: string; verified: boolean }> = new Array(entries.length)
    .fill(null)
    .map(() => ({ avatar: '', verified: false }));
  for (let i = 0; i < top.length; i += CONC) {
    const chunk = top.slice(i, i + CONC);
    const res = await Promise.all(chunk.map((e) => kickIdentity(e.name)));
    res.forEach((r, k) => {
      out[i + k] = r;
    });
  }
  return out;
}

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const { url, key, slug } = envs();
  if (!url || !key) return json({ error: 'Supabase env missing' }, 500);

  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
  const h = { ...headers, __url: url } as Record<string, string> & { __url: string };

  const q = new URL(request.url).searchParams;
  const wanted = String(q.get('name') ?? '').trim().replace(/^@/, '');

  try {
    const ranks = await loadRanks(h);

    // ══ بحث بالاسم ══════════════════════════════════════════
    if (wanted) {
      if (!NAME_RE.test(wanted)) {
        return json(
          {
            found: false,
            error: 'الاسم لازم يكون إنجليزي فقط (حروف إنجليزية وأرقام و _ و .) — من 3 لـ 24 حرف',
            errorCode: 'bad_name',
          },
          400,
        );
      }

      // 1) ملف المستخدم من Kick (صورة، اسم، verified، متابعين)
      let profile: any = null;
      try {
        const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(wanted)}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        });
        if (r.ok) {
          const j = await r.json();
          const d = j?.data ?? j;
          profile = {
            display: d?.user?.username ?? d?.username ?? wanted,
            avatar: d?.user?.profile_pic ?? '',
            verified: d?.verified === true,
            followers: d?.followers_count != null ? Number(d.followers_count) || null : null,
          };
        }
      } catch {
        /* ملف غير موجود أو Kick ما رد — بنكمل على النقاط */
      }

      // 2) النقاط والرتبة من قاعدة البوت
      const lookup = await fetch(
        `${url}/rest/v1/members` +
          `?select=channel_id,username,points,message_count,rank_idx` +
          `&username=ilike.${encodeURIComponent(wanted)}&limit=1`,
        { headers },
      );
      const rows = lookup.ok ? ((await lookup.json()) as any[]) : [];
      const row = rows[0] ?? null;

      // 3) ترتيب الشخص على اللوحة (نفس منطق الشات: النقاط)
      let position: number | null = null;
      let totalMembers = 0;
      if (row) {
        const board = await fetch(
          `${url}/rest/v1/members?select=kick_user_id&channel_id=eq.${row.channel_id}`,
          { headers },
        );
        if (board.ok) {
          const all = (await board.json()) as any[];
          totalMembers = all.length;
          const better = all.filter((m) => Number(m.points ?? 0) > Number(row.points ?? 0)).length;
          position = better + 1;
        }
      }

      const points = Number(row?.points ?? 0);
      const rk = rankFor(ranks, points);
      const display = profile?.display ?? row?.username ?? wanted;

      return json(
        {
          found: true,
          name: wanted,
          display,
          avatar: profile?.avatar ?? '',
          verified: profile?.verified ?? false,
          followers: profile?.followers ?? null,
          messages: Number(row?.message_count ?? 0),
          points,
          position,
          totalMembers,
          ...rk,
        },
        200,
        true,
      );
    }

    // ══ اللوحة ══════════════════════════════════════════════
    const [boardRes, chRes] = await Promise.all([
      fetch(
        `${url}/rest/v1/leaderboard` +
          `?select=kick_user_id,username,points,message_count,rank_idx,position` +
          `&order=position.asc&limit=100`,
        { headers },
      ),
      fetch(`${url}/rest/v1/channels?select=id,slug&order=id&limit=1`, { headers }),
    ]);

    if (!boardRes.ok) return json({ entries: [], error: `read failed ${boardRes.status}` }, 200, true);
    const rows = (await boardRes.json()) as any[];
    const channels = chRes.ok ? ((await chRes.json()) as Array<{ id: number; slug: string }>) : [];

    // نعرض قناة الهدف فقط (xtroet)، ونخلي الباقي برة
    const target = channels.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) ?? channels[0];
    const scoped = target ? rows.filter((r) => Number(r.channel_id ?? target.id) === Number(target.id)) : rows;

    const entries = scoped.slice(0, 100).map((r, i) => {
      const points = Number(r.points) || 0;
      return {
        rank: Number(r.position ?? i + 1),
        name: r.username,
        points,
        messages: Number(r.message_count) || 0,
        ...rankFor(ranks, points),
      };
    });

    // صور Kick للمتصدرين الأوائل + سلم الرتب الكامل (مصدر واحد من قاعدة البوت)
    const identities = await fillTopAvatars(entries);
    const withAvatars = entries.map((e, i) => ({ ...e, ...identities[i] }));

    return json({ entries: withAvatars, ranks }, 200, true);
  } catch (e: any) {
    return json({ entries: [], error: String(e?.message || e).slice(0, 140) }, 200, true);
  }
}