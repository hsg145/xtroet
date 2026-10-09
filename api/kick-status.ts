// ============================================================
//  XTROET Bot — Kick Link Status (Vercel Edge Function)
//  GET /api/kick-status → { connected, slug, channelId, updatedAt }
//
//  يقرأ أحدث صف من kick_tokens + slug القناة — بدون كشف أي توكن.
//  Env: SUPABASE_URL (+ SUPABASE_SECRET_KEY أو SUPABASE_SERVICE_KEY)
// ============================================================

export const config = { runtime: 'edge' };

export default async function handler() {
  const sbUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const sbKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();

  if (!sbUrl || !sbKey) {
    return Response.json({ connected: false, error: 'Supabase env missing' }, { status: 200 });
  }

  try {
    const base = sbUrl.replace(/\/$/, '');
    const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, Accept: 'application/json' };

    const tokRes = await fetch(
      `${base}/rest/v1/kick_tokens?select=channel_id,updated_at&order=updated_at.desc&limit=1`,
      { headers },
    );
    if (!tokRes.ok) throw new Error(`tokens ${tokRes.status}`);
    const rows = (await tokRes.json()) as Array<{ channel_id: number; updated_at: string }>;
    if (!rows.length) return Response.json({ connected: false }, { status: 200 });

    const channelId = rows[0].channel_id;
    let slug: string | null = null;
    const chRes = await fetch(`${base}/rest/v1/channels?select=slug&id=eq.${channelId}`, { headers });
    if (chRes.ok) {
      const ch = (await chRes.json()) as Array<{ slug: string }>;
      slug = ch[0]?.slug ?? null;
    }

    return Response.json(
      { connected: true, channelId, slug, updatedAt: rows[0].updated_at },
      { status: 200, headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } },
    );
  } catch (e: any) {
    return Response.json({ connected: false, error: String(e?.message || e).slice(0, 160) }, { status: 200 });
  }
}
