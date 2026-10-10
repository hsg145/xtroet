import { env } from './config.js';
import { getLogger } from './logger.js';
import { AdminState } from './core/admin-state.js';
import { Commands, COMMAND_ALIASES } from './core/commands.js';
import { Flusher } from './core/flusher.js';
import { PointsEngine } from './core/points.js';
import { RankStore } from './core/ranks.js';
import { MessageRouter } from './core/router.js';
import { createServer, WebhookChatSource, type HttpServer } from './core/server.js';
import { ChatSender } from './core/sender.js';
import { messages } from './messages.js';
import { fetchRanks, upsertChannel, type RankChangeRow } from './db/repo.js';
import { getChannelBySlug } from './kick/api.js';
import { exchangeCode, tokenManager } from './kick/oauth.js';
import { IdleWatcher, SubscriptionReconciler } from './kick/subscriptions.js';
import { PusherChatSource, resolveChatroomId } from './kick/pusher.js';
import { warnOnClockSkew } from './kick/signature.js';
import { MessageDedupe } from './kick/webhook.js';
import type { NormalizedMessage } from './kick/types.js';

export const VERSION = '1.0.0';

/** The product name, used in logs, the /status reply and error output. */
export const BOT_NAME = 'RANKSBOT';

const BANNER = `
 ____  ____  _    _ _   _ _____ _____   _____
|  _ \\|  _ \\| |  | | | |_   _|  __\\ / ____|
| |_) | |_) | |__| | | | | | | |  | \\__ \\
|  _ <|  _ <|  __  | | | | | | | |__| |___) |
|_| \\_\\_| \\_\\_|  |_| |_|_|  |_|_____|____/
                     R A N K S B O T`;

function uptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const out: string[] = [];
  if (d > 0) out.push(`${d}ي`);
  if (h > 0 || d > 0) out.push(`${h}س`);
  out.push(`${m}د`, `${s}ث`);
  return out.join(' ');
}

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

function ago(at: Date | null): string {
  if (!at) return 'لم';
  return `${Math.floor((Date.now() - at.getTime()) / 1000)}ث`;
}

async function main(): Promise<void> {
  const e = env();
  const mode = e.INGEST_MODE;
  const useWebhook = mode === 'webhook' || mode === 'both';
  const usePusher = mode === 'pusher' || mode === 'both';
  const log = getLogger();
  const startedAt = Date.now();
  const checks: Check[] = [];

  console.log(BANNER);
  console.log(`  v${VERSION}  |  ${e.NODE_ENV}  |  ${e.TEST_MODE ? '🧪 TEST MODE' : '🚀 LIVE MODE'}`);
  console.log(`  channel : ${e.KICK_TARGET_CHANNEL_SLUG}`);
  console.log(`  ingest  : ${mode}${mode === 'pusher' ? ' (no tunnel, no public URL needed)' : ''}`);
  if (mode !== 'pusher') {
    console.log(`  webhook : ${e.PUBLIC_BASE_URL ? `${e.PUBLIC_BASE_URL}/webhooks/kick` : '(PUBLIC_BASE_URL not set)'}`);
  }
  console.log('');

  // ── 1. ranks ───────────────────────────────────────────────
  const ranks = new RankStore();
  await ranks.load();
  const dbRanks = await fetchRanks().catch(() => []);
  checks.push({
    label: 'Supabase + ranks',
    ok: dbRanks.length > 0,
    detail: dbRanks.length > 0 ? `${dbRanks.length} ranks loaded` : 'cannot read the ranks table — run supabase/migrations/001_init.sql',
  });

  // ── 2. token + channel resolution ──────────────────────────
  let channelId = 0;
  let haveToken = false;
  try {
    const token = await tokenManager.accessToken();
    haveToken = true;
    const channel = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, token);
    if (!channel) throw new Error(`channel "${e.KICK_TARGET_CHANNEL_SLUG}" was not found by the Kick API`);
    channelId = channel.broadcasterUserId;
    tokenManager.setChannel(channelId);
    await upsertChannel(channelId, channel.slug);
    checks.push({
      label: 'Kick token + channel',
      ok: true,
      detail: `#${channel.slug} → broadcaster id ${channelId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      label: 'Kick token + channel',
      ok: false,
      detail: haveToken ? message : 'no token stored — run: npm run auth',
    });
  }

  // ── 3. wire everything ─────────────────────────────────────
  const engine = new PointsEngine(ranks, e.CACHE_TTL_MS);
  const adminState = new AdminState();
  try {
    await adminState.refresh();
    checks.push({ label: 'Admin state', ok: true, detail: 'dashboard promos armed' });
  } catch (err) {
    checks.push({
      label: 'Admin state',
      ok: false,
      detail: 'cannot read admin tables — run supabase/migrations/006_admin.sql (bot still awards normal points)',
    });
  }
  const sender = new ChatSender({
    broadcasterUserId: channelId,
    intervalMs: e.SEND_INTERVAL_MS,
    maxSize: e.MAX_QUEUE_SIZE,
  });
  const selfUserIds = new Set<number>(channelId ? [channelId] : []);
  const idleWatcher = new IdleWatcher(e.EVENT_IDLE_WARN_SECONDS);
  const reconciler = new SubscriptionReconciler(channelId, e.SUBSCRIPTION_REFRESH_MS);

  const flusher = new Flusher({
    channelId,
    engine,
    ranks,
    intervalMs: e.FLUSH_INTERVAL_MS,
    onRankUps: (rows: RankChangeRow[]) => announceDbRankUps(rows, sender, ranks),
  });

  const commands = new Commands({
    channelId,
    broadcasterUserId: channelId,
    engine,
    ranks,
    sender,
    statusInfo: () => ({
      uptime: uptime(Math.floor((Date.now() - startedAt) / 1000)),
      queue: sender.length,
      pending: engine.pendingUsers,
      lastFlush: ago(flusher.lastFlush),
      lastEvent: ago(idleWatcher.last),
      subscriptionOk: reconciler.ok,
    }),
  });

  const router = new MessageRouter({
    channelId,
    broadcasterUserId: channelId,
    engine,
    ranks,
    sender,
    commands,
    flushNow: () => flusher.flushNow(),
    selfUserIds,
    promo: (ch, uid, content) => adminState.promo(ch, uid, content),
  });

  // A wrong PC clock makes every webhook signature fail, which gets the app
  // unsubscribed. Cheap to check, so always check.
  await warnOnClockSkew(e.KICK_API_BASE);

  // One dedupe shared by both sources so running them together can never
  // double count the same Kick message id.
  const dedupe = new MessageDedupe();

  // Webhook diagnostics, surfaced in /health so "Kick never reached us" is
  // distinguishable from "Kick reached us and we rejected it".
  let webhookLastHitAt: string | null = null;
  let webhookLastRejectReason: string | null = null;
  let webhookLastEventAt: string | null = null;
  let lastEventAt: Date | null = null;

  const handle = (msg: NormalizedMessage): void => {
    lastEventAt = new Date();
    idleWatcher.mark();
    void router.route(msg);
  };

  const webhookSource = new WebhookChatSource(
    {
      onMessage: handle,
      broadcasterUserId: () => (channelId ? channelId : null),
      dedupe,
    },
    {
      onHit: ({ at, eventType, signed, bytes }) => {
        webhookLastHitAt = at.toISOString();
        log.debug({ eventType, signed, bytes }, 'webhook diagnostics');
      },
      onReject: ({ at, reason }) => {
        webhookLastRejectReason = reason;
        webhookLastHitAt = at.toISOString();
      },
      onAccepted: (at) => {
        webhookLastEventAt = at.toISOString();
        reconciler.markEventReceived();
      },
    },
  );

  // Resolve the chatroom id before mounting anything so a bad id fails loudly
  // and early instead of silently never receiving messages.
  let chatroomId: number | null = null;
  let chatroomError: string | null = null;
  if (usePusher) {
    try {
      chatroomId = await resolveChatroomId(e.KICK_TARGET_CHANNEL_SLUG, e.KICK_CHATROOM_ID);
      log.info({ chatroomId }, 'kick chatroom resolved');
    } catch (err) {
      chatroomError = err instanceof Error ? err.message : String(err);
      log.error({ err: chatroomError }, 'could not resolve the kick chatroom id');
    }
  }

  const pusherSource = new PusherChatSource({
    broadcasterUserId: () => channelId,
    broadcasterSlug: () => e.KICK_TARGET_CHANNEL_SLUG,
    chatroomId: () => chatroomId ?? 0,
    dedupe,
  });
  pusherSource.onMessage(handle);

  const server: HttpServer = createServer({
    health: () => ({
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      mode: e.TEST_MODE ? 'test' : 'live',
      channel: e.KICK_TARGET_CHANNEL_SLUG,
      webhookUrl: e.PUBLIC_BASE_URL ? `${e.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/kick` : '(not set)',
      queueLength: sender.length,
      pendingUsers: engine.pendingUsers,
      lastEventAt: lastEventAt?.toISOString() ?? null,
      lastFlushAt: flusher.lastFlush?.toISOString() ?? null,
      ranksLoaded: ranks.all().length,
      flushStatus: flusher.status,
      senderStats: sender.stats,
      ingest: {
        mode,
        pusher: {
          enabled: usePusher,
          connected: pusherSource.stats(chatroomId).connected,
          subscribed: pusherSource.stats(chatroomId).subscribed,
          chatroomId,
          lastMessageAt: pusherSource.stats(chatroomId).lastMessageAt?.toISOString() ?? null,
          reconnects: pusherSource.stats(chatroomId).reconnects,
          lastPusherError: pusherSource.stats(chatroomId).lastPusherError,
          error: chatroomError,
        },
        webhook: {
          enabled: useWebhook,
          subscribed: reconciler.ok,
          delivering: reconciler.delivering(),
          lastHitAt: webhookLastHitAt,
          lastEventAt: webhookLastEventAt,
          lastRejectReason: webhookLastRejectReason,
        },
      },
    }),
    // Re-auth without restarting: visit /callback while the bot runs.
    onCode: async (code: string) => {
      const token = await exchangeCode(code, process.env.CODE_VERIFIER ?? '');
      await tokenManager.persist(channelId || 0, channelId, token);
      log.info('re-authorized from /callback — restart the bot if the channel changed');
    },
    // Mounted only in webhook modes, and always before the 404 fallback.
    webhookRouter: useWebhook ? webhookSource.router() : undefined,
  });

  // ── 4. start ───────────────────────────────────────────────
  await server.listen();

  if (usePusher && chatroomId !== null) {
    await pusherSource.start();
  }
  if (useWebhook) {
    await webhookSource.start();
  }

  flusher.start();
  idleWatcher.start();
  ranks.startRefresh(e.RANKS_REFRESH_MS);
  tokenManager.startAutoRefresh();
  // Dashboard promos: refresh events/mutes/drops + send queued announcements.
  if (channelId) {
    await adminState.refreshModifiers(channelId).catch(() => undefined);
    await adminState.refreshClaims(channelId).catch(() => undefined);
    adminState.startRefresh(channelId, 15_000);
  }
  const outboxTimer = setInterval(() => {
    if (!channelId) return;
    void adminState.drainOutbox(channelId, (text) => sender.send(text, 'high'));
  }, 5_000);
  outboxTimer.unref();

  if (useWebhook && channelId) {
    const result = await reconciler.check();
    checks.push({
      label: 'Event subscription',
      // Honest: a listed subscription is not proof of delivery.
      ok: false,
      detail: result.ok
        ? `chat.message.sent ${result.action} — ⚠️ subscribed but no event received yet`
        : `failed — ${result.detail ?? 'unknown'}. Set the webhook URL + enable webhooks in the Kick developer dashboard.`,
    });
    reconciler.start();
  }

  if (usePusher) {
    // The banner is printed right after start(); subscribing takes ~1-2s.
    // Poll briefly so the banner reports the truth instead of a race.
    for (let i = 0; i < 15; i++) {
      if (pusherSource.stats(chatroomId).subscribed) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const s = pusherSource.stats(chatroomId);
    checks.push({
      label: 'Chat source (pusher)',
      ok: s.subscribed,
      detail: chatroomError
        ? `no chatroom id — run: npm run doctor (it prints the browser instructions)`
        : s.subscribed
          ? `subscribed to chatrooms.${chatroomId}.v2`
          : `connecting to chatrooms.${chatroomId}.v2 (state: ${s.state})`,
    });
  }

  if (useWebhook) {
    checks.push({
      label: 'Public webhook URL',
      ok: e.PUBLIC_BASE_URL.length > 0,
      detail:
        e.PUBLIC_BASE_URL ||
        'set PUBLIC_BASE_URL to your https tunnel URL (webhook modes need a public URL)',
    });
  }

  // ── 5. readiness banner ────────────────────────────────────
  console.log('  ── READINESS ─────────────────────────────────────');
  for (const c of checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.label.padEnd(22)} ${c.detail}`);
  console.log('  ──────────────────────────────────────────────────');
  console.log(`  commands  : !رتبة  !توب  !رتب   (+ ${Object.keys(COMMAND_ALIASES).length} aliases, admin cmds enabled)`);
  console.log(
    `  points    : +1 per message | cooldown ${e.POINTS_COOLDOWN_SECONDS}s | flush ${e.FLUSH_INTERVAL_MS}ms | announce ${e.ANNOUNCE_RANKUPS}`,
  );
  console.log(`  ranks     : ${ranks.all().length} loaded, refreshed every ${Math.round(e.RANKS_REFRESH_MS / 60000)} min`);
  console.log(`  health    : GET /health`);
  console.log(`  listening : http://localhost:${e.PORT}\n`);

  if (checks.some((c) => !c.ok)) log.warn('some readiness checks failed — see the banner above');

  // ── 6. graceful shutdown ───────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutdown: stopping intake, flushing points…');

    reconciler.stop();
    idleWatcher.stop();
    ranks.stopRefresh();
    clearInterval(outboxTimer);
    adminState.stopRefresh();
    tokenManager.stopAutoRefresh();
    flusher.stop();

    await flusher.flushNow();
    await sender.drainAll(3000);
    await pusherSource.stop();
    await webhookSource.stop();
    await server.close();

    log.info('bye 👋');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => log.error({ err }, 'uncaught exception — bot keeps running'));
  process.on('unhandledRejection', (reason) => log.error({ reason }, 'unhandled rejection — bot keeps running'));
}

/**
 * The single place a rank-up is announced.
 *
 * Driven by the database AFTER the write succeeds, so an announcement always
 * matches persisted state and fires exactly once. The router deliberately does
 * NOT announce from memory: doing both produced two messages per promotion.
 */
function announceDbRankUps(rows: RankChangeRow[], sender: ChatSender, ranks: RankStore): void {
  for (const row of rows) {
    const rank = ranks.rankByIdx(row.rank_idx);
    if (!rank) continue;
    sender.send(messages.rankUp(row.username || String(row.kick_user_id), rank), 'high');
  }
}

main().catch((err) => {
  getLogger().fatal({ err }, 'fatal startup error');
  console.error(`\n❌ ${BOT_NAME} could not start.\n`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});