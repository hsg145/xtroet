/**
 * npm run resubscribe
 *
 * Deletes the current chat.message.sent subscription and creates a fresh one.
 *
 * A subscription created while the dashboard pointed at a dead tunnel stays
 * registered but Kick never delivers to it: the reconciler sees it as
 * "already-subscribed" and never re-binds it to the current webhook URL.
 * Deleting and re-creating forces that re-binding.
 */
import { env } from '../src/config.js';
import { getLogger } from '../src/logger.js';
import { createSubscription, deleteSubscription, listSubscriptions } from '../src/kick/api.js';
import { getChannelBySlug } from '../src/kick/api.js';
import { tokenManager } from '../src/kick/oauth.js';
import { EVENT_CHAT_MESSAGE_SENT, EVENT_CHAT_MESSAGE_SENT_VERSION } from '../src/kick/types.js';

async function main(): Promise<void> {
  const e = env();
  const log = getLogger();

  if (!e.PUBLIC_BASE_URL) {
    console.error('\n❌ PUBLIC_BASE_URL is empty. The bot cannot tell which URL to bind.\n');
    process.exit(1);
  }
  const webhookUrl = `${e.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/kick`;
  console.log(`\n  webhook URL : ${webhookUrl}`);

  const token = await tokenManager.accessToken();
  const channel = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, token);
  if (!channel) {
    console.error(`\n❌ Channel "${e.KICK_TARGET_CHANNEL_SLUG}" not found.\n`);
    process.exit(1);
  }
  const broadcasterUserId = channel.broadcasterUserId;
  console.log(`  channel     : #${channel.slug} (id ${broadcasterUserId})`);

  const before = await listSubscriptions(token, broadcasterUserId);
  console.log(`\n  before (${before.length}):`);
  for (const s of before) console.log(`    - ${s.event} v${s.version ?? 1} ${s.id} method=${s.method ?? '?'}`);

  const stale = before.filter(
    (s) => s.event === EVENT_CHAT_MESSAGE_SENT && (s.version ?? 1) === EVENT_CHAT_MESSAGE_SENT_VERSION,
  );

  for (const s of stale) {
    await deleteSubscription(token, s.id);
    console.log(`  deleted     : ${s.id}`);
  }
  if (stale.length === 0) console.log('  deleted     : (nothing to delete)');

  const created = await createSubscription(token, broadcasterUserId, [
    { name: EVENT_CHAT_MESSAGE_SENT, version: EVENT_CHAT_MESSAGE_SENT_VERSION },
  ]);

  const failed = created.find((c) => c.error);
  if (failed?.error) {
    console.error(`\n❌ Kick refused to create the subscription: ${failed.error}\n`);
    log.error({ err: failed.error }, 'resubscribe failed');
    process.exit(1);
  }

  const after = await listSubscriptions(token, broadcasterUserId);
  console.log(`\n  after (${after.length}):`);
  for (const s of after) console.log(`    - ${s.event} v${s.version ?? 1} ${s.id} method=${s.method ?? '?'}`);

  console.log('\n✅ Re-subscribed. Now type a message in the channel (e.g. !رتبة).');
  console.log('   Watch GET /health -> lastEventAt should stop being null.\n');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});