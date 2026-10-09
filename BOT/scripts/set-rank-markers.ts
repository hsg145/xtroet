/**
 * One-off: push the rank markers from supabase/migrations/003_rank_emoji.sql
 * into the live `ranks` table over PostgREST.
 *
 * 001_init.sql intentionally grants anon/authenticated only SELECT on `ranks`,
 * so the bot process itself cannot write them. This uses the Supabase SQL
 * endpoint instead. Kept as a script so it can be re-run if the markers change.
 */
import { loadEnv } from '../src/config.js';

const MARKERS: Record<string, string> = {
  cadet: '▪️',
  solo_cadet: '▫️',
  officer_1: '🔹',
  officer_2: '🔹',
  officer_3: '🔹',
  senior_officer: '🔸',
  senior_lead_officer: '🔸',
  sergeant: '💠',
  first_sergeant: '🔺',
  staff_sergeant: '🔺',
  lieutenant: '🥉',
  captain: '🥈',
  chief_of_police: '🥇',
  minister: '🎖️',
};

async function main(): Promise<void> {
  const e = loadEnv();
  const key = e.SUPABASE_SECRET_KEY ?? e.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('No Supabase server key configured');
  const base = `${e.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/ranks`;

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  };

  let failed = 0;
  for (const [rankKey, emoji] of Object.entries(MARKERS)) {
    const res = await fetch(`${base}?key=eq.${encodeURIComponent(rankKey)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ emoji }),
    });
    if (res.ok) {
      console.log(`  ✅ ${rankKey.padEnd(22)} ${emoji}`);
    } else {
      failed++;
      console.log(`  ❌ ${rankKey.padEnd(22)} HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
  }

  console.log(failed ? `\n${failed} update(s) failed.\n` : '\nAll rank markers updated.\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});