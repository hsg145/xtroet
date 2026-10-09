/**
 * npm run reset-channel -- <slug>
 *
 * Deletes members / rank_events / kick_tokens for ONE channel so a test channel
 * can start clean. Refuses to run unless TEST_MODE=true, and always asks for a
 * typed confirmation. Everything is scoped to the given slug -- other channels
 * in the database are never touched.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { env } from '../src/config.js';
import { getChannelBySlug } from '../src/kick/api.js';
import { tokenManager } from '../src/kick/oauth.js';
import { getSupabase } from '../src/db/supabase.js';

async function main(): Promise<void> {
  const e = env();
  const slug = process.argv[2]?.trim();

  if (!slug) {
    console.error('❌ Usage: npm run reset-channel -- <channel-slug>');
    process.exit(1);
  }

  if (!e.TEST_MODE) {
    console.error('❌ Refusing to run: TEST_MODE is false.');
    console.error('   Resetting data is only allowed on a test channel.');
    console.error('   Set TEST_MODE=true in .env if this really is a test channel.');
    process.exit(1);
  }

  const db = getSupabase();

  let channelId: number;
  try {
    const token = await tokenManager.accessToken();
    const channel = await getChannelBySlug(slug, token);
    if (!channel) throw new Error(`Channel "${slug}" not found on Kick`);
    channelId = channel.broadcasterUserId;
  } catch {
    // Fall back to whatever is already in the database.
    const { data, error } = await db.from('channels').select('id').eq('slug', slug).maybeSingle();
    if (error || !data) {
      console.error(`❌ Could not resolve channel "${slug}" from Kick or the database.`);
      process.exit(1);
    }
    channelId = (data as { id: number }).id;
  }

  const { count } = await db
    .from('members')
    .select('kick_user_id', { count: 'exact', head: true })
    .eq('channel_id', channelId);

  console.log(`\n🧹 About to erase ALL data for channel "${slug}" (id ${channelId})`);
  console.log(`   members     : ${count ?? 0} rows`);
  console.log('   rank_events : all rows');
  console.log('   kick_tokens : all rows (you will need to run `npm run auth` again)');
  console.log('   the channels row itself is kept.\n');

  if (slug === e.KICK_TARGET_CHANNEL_SLUG) {
    console.log(`   Note: this is your configured target channel (${e.KICK_TARGET_CHANNEL_SLUG}).\n`);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Type the slug "${slug}" to confirm: `);
  rl.close();

  if (answer.trim() !== slug) {
    console.log('\n🚫 Cancelled. Nothing was deleted.\n');
    process.exit(0);
  }

  const before = await db.from('members').select('kick_user_id', { count: 'exact', head: true }).eq('channel_id', channelId);
  const beforeEvents = await db.from('rank_events').select('id', { count: 'exact', head: true }).eq('channel_id', channelId);

  const results = await Promise.allSettled([
    db.from('rank_events').delete({ count: 'exact' }).eq('channel_id', channelId),
    db.from('members').delete({ count: 'exact' }).eq('channel_id', channelId),
    db.from('kick_tokens').delete({ count: 'exact' }).eq('channel_id', channelId),
  ]);

  const failed = results.filter((r) => r.status === 'rejected');
  const firstError = failed.length > 0 && failed[0]!.status === 'rejected' ? failed[0]!.reason : undefined;

  if (firstError) {
    console.error(`\n❌ Delete failed: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
    process.exit(1);
  }

  console.log(`\n✅ Done. Removed ${before.count ?? 0} members and ${beforeEvents.count ?? 0} rank-up events for "${slug}".`);
  console.log('   Run `npm run auth` before starting the bot again.\n');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});