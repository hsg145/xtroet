/**
 * npm run doctor [-- --send]
 *
 * One command that finds WHICH stage is broken, in order, instead of leaving
 * you guessing between "no webhook hit" and "signature rejected".
 * Never prints secrets. Exits non-zero if a critical check failed.
 */
import WebSocket from 'ws';
import { loadEnv } from '../src/config.js';
import {
  EVENT_CHAT_MESSAGE_SENT,
  EVENT_CHAT_MESSAGE_SENT_VERSION,
} from '../src/kick/types.js';
import { chatroomChannel, pusherWsUrl } from '../src/kick/pusher-constants.js';
import { ChatroomIdError, resolveChatroomId } from '../src/kick/pusher.js';
import { getChannelBySlug, listSubscriptions, sendChatMessage } from '../src/kick/api.js';
import { tokenManager } from '../src/kick/oauth.js';
import { clockSkewMs, measureClockSkew, parsePublicKey, verifySignature } from '../src/kick/signature.js';
import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';

const WANT_SEND = process.argv.includes('--send');

let failures = 0;

function ok(label: string, detail = ''): void {
  console.log(`  ✅ ${label.padEnd(30)} ${detail}`);
}
function warn(label: string, detail = ''): void {
  console.log(`  ⚠️  ${label.padEnd(30)} ${detail}`);
}
function bad(label: string, detail: string, fix: string): void {
  failures++;
  console.log(`  ❌ ${label.padEnd(30)} ${detail}`);
  console.log(`     → ${fix}`);
}
function head(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

async function main(): Promise<void> {
  console.log('\n🔍 RanksBot doctor\n');

  // ── 1. env ────────────────────────────────────────────────────────────────
  head('1. configuration');
  let e: ReturnType<typeof loadEnv>;
  try {
    e = loadEnv();
    ok('.env', `mode=${e.INGEST_MODE} slug=${e.KICK_TARGET_CHANNEL_SLUG} sender=${e.KICK_SENDER_TYPE}`);
  } catch (err) {
    // Name the offending keys so the user does not have to guess.
    const detail = String((err as Error).message)
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map((l) => l.trim().replace(/^-\s*/, ''))
      .join(' | ');
    bad(
      '.env',
      detail || (err instanceof Error ? err.message : String(err)),
      'fix the listed variables in .env',
    );
    console.log('\n❌ cannot continue without valid configuration.\n');
    process.exit(1);
  }

  // ── 2. runtime ────────────────────────────────────────────────────────────
  head('2. runtime');
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) ok('node', `v${process.versions.node}`);
  else bad('node', `v${process.versions.node} (need >= 20)`, 'install Node 20 or newer');

  // ── 3. supabase ───────────────────────────────────────────────────────────
  head('3. supabase');
  // Resolve the channel FIRST: apply_points has a foreign key to `channels`,
  // so probing it needs the real broadcaster id, not a placeholder.
  let channelId = 0;
  try {
    const token0 = await tokenManager.accessToken();
    const ch0 = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, token0).catch(() => null);
    if (ch0) channelId = ch0.broadcasterUserId;
  } catch {
    /* section 4 reports this properly */
  }

  try {
    const { getSupabase } = await import('../src/db/supabase.js');
    const db = getSupabase();
    const { data: ranks, error: rankErr } = await db.from('ranks').select('*').limit(20);
    if (rankErr) throw new Error(rankErr.message);
    if ((ranks ?? []).length < 14) {
      bad('ranks table', `${(ranks ?? []).length} rows (expected >= 14)`, 're-run supabase/migrations/001_init.sql');
    } else {
      ok('ranks table', `${(ranks ?? []).length} rows`);
    }

    if (channelId) {
      // Calling apply_points with a throwaway user proves migration 002 was
      // applied AND that the write path works end to end.
      const probeId = 900000001;
      const { error: applyErr } = await db.rpc('apply_points', {
        p_channel_id: channelId,
        p_batch: [{ user_id: probeId, username: 'doctor_probe', delta: 1, messages: 1 }],
      });
      if (applyErr) {
        bad('rpc apply_points', applyErr.message, 'paste supabase/migrations/002_fix_rpc.sql into the Supabase SQL editor');
      } else {
        const { error: delErr } = await db.from('members').delete().eq('kick_user_id', probeId);
        if (delErr) warn('rpc apply_points', `works, cleanup failed: ${delErr.message}`);
        else ok('rpc apply_points', 'works (002 applied) and probe row deleted');
      }
    } else {
      warn('rpc apply_points', 'skipped — channel not resolved yet');
    }
  } catch (err) {
    bad('supabase', err instanceof Error ? err.message : String(err), 'check SUPABASE_URL and SUPABASE_SECRET_KEY in .env');
  }

  // ── 4. kick token ─────────────────────────────────────────────────────────
  head('4. kick token');
  try {
    const token = await tokenManager.accessToken();
    ok('token', 'present and valid (refresh works)');

    const channel = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, token);
    if (!channel) {
      bad('channel', `"${e.KICK_TARGET_CHANNEL_SLUG}" not returned by Kick`, 'check KICK_TARGET_CHANNEL_SLUG, and that you authorised with the account that OWNS the channel');
    } else {
      channelId = channel.broadcasterUserId;
      ok('channel', `#${channel.slug} → broadcaster id ${channelId}`);
    }

    const required = ['user:read', 'channel:read', 'chat:write', 'events:subscribe'];
    const { getSupabase } = await import('../src/db/supabase.js');
    const stored = await getSupabase()
      .from('kick_tokens')
      .select('scope')
      .eq('channel_id', channelId || 1)
      .maybeSingle();
    const scopeText = (stored.data as { scope?: string } | null)?.scope || e.KICK_SCOPES;
    const missing = required.filter((s) => !scopeText.includes(s));
    if (missing.length) {
      bad('scopes', `missing: ${missing.join(', ')}`, 'run: npm run auth  and accept every requested scope');
    } else {
      ok('scopes', 'all 4 required scopes present');
    }
  } catch (err) {
    bad('kick token', err instanceof Error ? err.message : String(err), 'run: npm run auth');
  }

  // ── 5. chatroom id ────────────────────────────────────────────────────────
  head('5. chatroom id');
  let chatroomId: number | null = null;
  try {
    chatroomId = await resolveChatroomId(e.KICK_TARGET_CHANNEL_SLUG, e.KICK_CHATROOM_ID);
    ok('chatroom id', String(chatroomId));
  } catch (err) {
    if (err instanceof ChatroomIdError) {
      bad('chatroom id', 'not set and could not be resolved automatically', 'see the instructions printed below');
      console.log('');
      console.log(err.message.split('\n').map((l) => `     ${l}`).join('\n'));
      console.log('');
    } else {
      bad('chatroom id', err instanceof Error ? err.message : String(err), 'set KICK_CHATROOM_ID in .env');
    }
  }

  // ── 6. pusher ─────────────────────────────────────────────────────────────
  head('6. pusher websocket');
  if (chatroomId === null) {
    warn('pusher', 'skipped — no chatroom id');
  } else {
    const result = await probePusher(chatroomId);
    if (result.ok) ok('pusher', `subscribed to ${chatroomChannel(chatroomId)}`);
    else bad('pusher', result.reason, 're-run; if it keeps failing the pusher host/app key may have changed (see src/kick/pusher-constants.ts)');
  }

  // ── 7. clock skew ─────────────────────────────────────────────────────────
  head('7. clock skew');
  const skew = await measureClockSkew(e.KICK_API_BASE);
  if (skew === null) {
    warn('clock', 'could not measure (no network?)');
  } else {
    const sec = Math.round(skew / 1000);
    if (Math.abs(sec) > 60) {
      bad('clock', `off by ${sec}s`, 'webhook signatures will be rejected — Settings > Time & language > Date & time > Set time automatically');
    } else {
      ok('clock', `${sec}s drift (fine)`);
    }
  }

  // ── 8. optional send ──────────────────────────────────────────────────────
  if (WANT_SEND) {
    head('8. send a test message');
    if (!channelId) {
      bad('send', 'no channel resolved', 'fix the token/channel checks above first');
    } else {
      try {
        const token = await tokenManager.accessToken();
        const sent = await sendChatMessage('✅ RanksBot متصل', token, {
          broadcasterUserId: channelId,
        });
        ok('send', `is_sent=${sent.is_sent} message_id=${sent.message_id || '(empty)'}`);
        if (!sent.is_sent && !sent.message_id) {
          warn('send', 'Kick accepted the call but reported is_sent=false — check chat:write and KICK_SENDER_TYPE');
        }
      } catch (err) {
        bad('send', err instanceof Error ? err.message : String(err), 'check chat:write scope and KICK_SENDER_TYPE');
      }
    }
  } else {
    head('8. send a test message');
    warn('send', 'skipped (pass --send to run it)');
  }

  // ── 9. webhook specifics ──────────────────────────────────────────────────
  head('9. webhook (only for INGEST_MODE=webhook|both)');
  if (!e.INGEST_MODE.includes('webhook')) {
    warn('webhook', `not needed for INGEST_MODE=${e.INGEST_MODE}`);
  } else {
    if (!e.PUBLIC_BASE_URL) {
      bad('webhook url', 'PUBLIC_BASE_URL is empty', 'set it, or use INGEST_MODE=pusher which needs no public URL');
    } else {
      const url = `${e.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/kick`;
      console.log(`     save exactly this in Kick dashboard → Webhooks → URL:`);
      console.log(`     ${url}`);
      try {
        const probe = await fetch(`${e.PUBLIC_BASE_URL.replace(/\/$/, '')}/health`, {
          signal: AbortSignal.timeout(20_000),
        });
        if (probe.ok) ok('public /health', `HTTP ${probe.status} (reachable from the internet)`);
        else bad('public /health', `HTTP ${probe.status}`, 'the tunnel is not serving this port');
      } catch (err) {
        bad('public /health', err instanceof Error ? err.message : String(err), 'quick-tunnel URLs change every run — restart the tunnel and save the new URL in the Kick dashboard');
      }
    }

    try {
      const token = await tokenManager.accessToken();
      const subs = await listSubscriptions(token, channelId || undefined);
      const mine = subs.filter((s) => s.event === EVENT_CHAT_MESSAGE_SENT);
      if (!mine.length) {
        bad('subscriptions', `no ${EVENT_CHAT_MESSAGE_SENT} v${EVENT_CHAT_MESSAGE_SENT_VERSION}`, 'run: npm run resubscribe');
      } else {
        warn(
          'subscriptions',
          `${mine.length} listed — ⚠️ listed ≠ delivering. A subscription proves only that Kick recorded it.`,
        );
      }
    } catch (err) {
      bad('subscriptions', err instanceof Error ? err.message : String(err), 'run: npm run auth');
    }

    // Local sign -> verify round-trip, proving our own verification path works
    // with a generated key pair (Kick's own key is used at runtime).
    try {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const messageId = randomBytes(8).toString('hex');
      const timestamp = new Date().toISOString();
      const body = Buffer.from(JSON.stringify({ ping: true }), 'utf8');
      const signer = createSign('RSA-SHA256');
      signer.update(Buffer.concat([Buffer.from(`${messageId}.${timestamp}.`, 'utf8'), body]));
      signer.end();
      const sig = signer.sign(privateKey).toString('base64');

      verifySignature(publicKey, body, { messageId, timestamp, signature: sig, eventType: 'test' });
      ok('sign→verify round-trip', 'passes with a generated key');

      try {
        verifySignature(publicKey, body, { messageId, timestamp, signature: 'AAAA', eventType: 'test' });
        bad('sign→verify round-trip', 'a bad signature was ACCEPTED', 'verification is broken — do not trust this build');
      } catch {
        ok('bad signature', 'correctly rejected');
      }

      const parsed = parsePublicKey(publicKey.export({ type: 'spki', format: 'pem' }).toString());
      void parsed;
    } catch (err) {
      bad('sign→verify round-trip', err instanceof Error ? err.message : String(err), 'Node crypto unavailable?');
    }

    void clockSkewMs;
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  console.log('');
  if (failures === 0) {
    console.log('✅  All checks passed.  Run:  npm start\n');
    process.exit(0);
  }
  console.log(`❌  ${failures} check(s) failed.  Fix the items above, then re-run:  npm run doctor\n`);
  process.exit(1);
}

/** Connect, subscribe, and report whether subscription_succeeded arrived. */
async function probePusher(chatroomId: number): Promise<{ ok: boolean; reason: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean, reason: string): void => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ ok, reason });
    };

    const ws = new WebSocket(pusherWsUrl());
    const timer = setTimeout(() => done(false, 'no subscription_succeeded within 10s'), 10_000);

    ws.on('open', () => undefined);
    ws.on('error', (err: Error) => {
      clearTimeout(timer);
      done(false, `socket error: ${err.message}`);
    });
    ws.on('close', (code: number) => {
      clearTimeout(timer);
      done(false, `socket closed with code ${code}`);
    });
    ws.on('message', (raw: WebSocket.RawData) => {
      let frame: { event?: string };
      try {
        frame = JSON.parse(raw.toString()) as { event?: string };
      } catch {
        return;
      }
      if (frame.event === 'pusher:connection_established') {
        ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: chatroomChannel(chatroomId) } }));
      } else if (frame.event === 'pusher_internal:subscription_succeeded') {
        clearTimeout(timer);
        done(true, '');
      } else if (frame.event === 'pusher:error') {
        clearTimeout(timer);
        done(false, `pusher returned an error frame (app key may have rotated)`);
      }
    });
  });
}

main().catch((err) => {
  console.error(`\n❌ doctor crashed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});