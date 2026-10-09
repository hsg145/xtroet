/**
 * npm run subscribe
 *
 * Manually create the chat.message.sent v1 webhook subscription for the target
 * channel. The bot also does this automatically at boot and every 10 minutes,
 * so this script is only needed for a one-off fix.
 */
import { env } from '../src/config.js';
import { getChannelBySlug, listSubscriptions, subscribeChatMessages } from '../src/kick/api.js';
import { tokenManager } from '../src/kick/oauth.js';
import { EVENT_CHAT_MESSAGE_SENT, EVENT_CHAT_MESSAGE_SENT_VERSION } from '../src/kick/types.js';

async function main(): Promise<void> {
  const e = env();

  if (!e.PUBLIC_BASE_URL) {
    console.warn('\n⚠️  PUBLIC_BASE_URL is empty. Kick delivers to the URL configured in your app dashboard,');
    console.warn('    so make sure it points at a reachable https endpoint ending in /webhooks/kick.\n');
  } else {
    console.log(`  webhook URL : ${e.PUBLIC_BASE_URL}/webhooks/kick`);
  }

  const token = await tokenManager.accessToken();
  const channel = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, token);
  if (!channel) throw new Error(`Channel "${e.KICK_TARGET_CHANNEL_SLUG}" not found`);

  tokenManager.setChannel(channel.broadcasterUserId);
  console.log(`  channel     : #${channel.slug} (id ${channel.broadcasterUserId})\n`);

  const subs = await listSubscriptions(token, channel.broadcasterUserId);
  console.log('  current subscriptions:');
  if (subs.length === 0) console.log('    (none)');
  for (const s of subs) console.log(`    - ${s.event} v${s.version ?? 1} (${s.id}) method=${s.method ?? '?'}`);

  const existing = subs.find((s) => s.event === EVENT_CHAT_MESSAGE_SENT);
  if (existing) {
    console.log(`\n✅ ${EVENT_CHAT_MESSAGE_SENT} v${EVENT_CHAT_MESSAGE_SENT_VERSION} already subscribed (${existing.id}). Nothing to do.\n`);
    return;
  }

  await subscribeChatMessages(token, channel.broadcasterUserId);
  console.log(`\n✅ Subscribed to ${EVENT_CHAT_MESSAGE_SENT} v${EVENT_CHAT_MESSAGE_SENT_VERSION}.\n`);
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});