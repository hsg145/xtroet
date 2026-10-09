/**
 * npm run simulate -- [options]
 *
 * Feeds fake NormalizedMessages straight into the real MessageRouter and the
 * real Supabase. No websocket, no webhook, no Kick connection at all.
 *
 * If this works but live chat does not, the problem is INGESTION, not the
 * points engine, the commands, the sender or the database.
 *
 *   --user alice        username to use            (default: simulate_user)
 *   --id 111            kick user id               (default: 900001)
 *   --msg "hello"       one message
 *   --count 5           send N messages
 *   --delay 1200        ms between messages
 *   --cmd "!رتبة"       send a command instead of plain text (implies --count 1)
 *   --dry               print replies to the console instead of posting to Kick
 */
import { env } from '../src/config.js';
import { Commands } from '../src/core/commands.js';
import { Flusher } from '../src/core/flusher.js';
import { PointsEngine } from '../src/core/points.js';
import { RankStore } from '../src/core/ranks.js';
import { MessageRouter } from '../src/core/router.js';
import { ChatSender } from '../src/core/sender.js';
import { getSupabase } from '../src/db/supabase.js';
import { fetchRanks } from '../src/db/repo.js';
import { getChannelBySlug } from '../src/kick/api.js';
import { tokenManager } from '../src/kick/oauth.js';
import type { NormalizedMessage } from '../src/kick/types.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--')
    ? process.argv[i + 1]!
    : fallback;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const USERNAME = arg('user', 'simulate_user');
const USER_ID = Number(arg('id', '900001'));
const COUNT = Number(arg('count', '1'));
const DELAY = Number(arg('delay', '1200'));
const DRY = flag('dry');
const CMD = arg('cmd', '');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Prints replies instead of posting them, so `--dry` needs no Kick token and
 * cannot spam a real channel. Only `send`/`sendAll` are intercepted; the
 * metrics getters keep working.
 */
class ConsoleSender extends ChatSender {
  readonly printed: string[] = [];

  constructor() {
    super({ broadcasterUserId: 0, intervalMs: 1, maxSize: 100 });
  }

  override send(text: string): void {
    this.printed.push(text);
    console.log(`     🤖 bot would say: ${text}`);
  }

  override sendAll(texts: string[]): void {
    for (const t of texts) this.send(t);
  }
}

async function main(): Promise<void> {
  const e = env();

  console.log('\n🧪 RanksBot simulate (no Kick connection involved)\n');

  // Resolve the real channel so points land against a real channel_id.
  let channelId = 0;
  try {
    const token = await tokenManager.accessToken();
    const channel = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, token);
    channelId = channel?.broadcasterUserId ?? 0;
    console.log(`  channel : #${channel?.slug ?? e.KICK_TARGET_CHANNEL_SLUG} (id ${channelId})`);
  } catch (err) {
    console.log(`  channel : could not resolve via Kick API (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!channelId) {
    console.log('\n❌ Need a resolved channel id so rows land in the right place. Run: npm run auth\n');
    process.exit(1);
  }

  const ranks = new RankStore();
  await ranks.load();
  await fetchRanks().catch(() => []);
  console.log(`  ranks   : ${ranks.all().length} loaded`);

  const engine = new PointsEngine(ranks, e.CACHE_TTL_MS);

  const sender: ChatSender = DRY
    ? new ConsoleSender()
    : new ChatSender({ broadcasterUserId: channelId, intervalMs: e.SEND_INTERVAL_MS, maxSize: e.MAX_QUEUE_SIZE });

  const flusher = new Flusher({
    channelId,
    engine,
    ranks,
    intervalMs: 250,
    onRankUps: (rows) => {
      for (const row of rows) {
        const rank = ranks.rankByIdx(row.rank_idx);
        if (rank) sender.send(`🎉 ${rank.emoji} ${rank.name_ar} لـ @${row.username || row.kick_user_id}`, 'low');
      }
    },
  });

  const commands = new Commands({
    channelId,
    broadcasterUserId: channelId,
    engine,
    ranks,
    sender,
    statusInfo: () => ({ uptime: '0s', queue: 0, pending: 0, lastFlush: 'لم', lastEvent: 'لم', subscriptionOk: false }),
  });

  const router = new MessageRouter({
    channelId,
    broadcasterUserId: channelId,
    engine,
    ranks,
    sender,
    commands,
    flushNow: () => flusher.flushNow(),
    // Never let the simulator award points to itself.
    selfUserIds: new Set<number>(),
  });

  console.log(`  sender  : ${DRY ? 'dry (console only)' : 'real Kick sender'}`);
  console.log(`  user    : ${USERNAME} (id ${USER_ID})`);
  console.log(`  sending : ${CMD ? `1 command "${CMD}"` : `${COUNT} message(s), ${DELAY}ms apart`}\n`);

  const before = await readMember(channelId, USER_ID);

  if (CMD) {
    await router.route(fakeMsg(channelId, CMD));
    await flusher.flushNow();
  } else {
    for (let i = 0; i < COUNT; i++) {
      const text = arg('msg', 'hello');
      await router.route(fakeMsg(channelId, i === 0 ? text : `${text} ${i + 1}`));
      console.log(`     → sent "${i === 0 ? text : `${text} ${i + 1}`}"`);
      if (i < COUNT - 1) await sleep(DELAY);
    }
    await flusher.flushNow();
  }

  await sender.drainAll(3000);
  const after = await readMember(channelId, USER_ID);

  console.log('\n  ─────────────────────────────────────────');
  console.log('  members row in Supabase:');
  console.log(`    before : ${before ?? '(no row yet)'}`);
  console.log(`    after  : ${after ?? '(no row — nothing was written)'}`);
  console.log('');
  if (DRY && sender instanceof ConsoleSender && sender.printed.length) {
    console.log(`  ${sender.printed.length} reply/replies the bot produced (dry mode):`);
    sender.printed.forEach((p) => console.log(`    ${p}`));
  }
  console.log('  ─────────────────────────────────────────');
  console.log(
    after
      ? '\n✅ Engine + database work end to end. If live chat does nothing, the problem is INGESTION — run: npm run doctor\n'
      : '\n❌ Nothing reached Supabase. The points engine is fine but a database write failed.\n' +
          '   Look for a "flush failed" error above; if it mentions apply_points, paste\n' +
          '   supabase/migrations/002_fix_rpc.sql into the Supabase SQL editor.\n',
  );
}

function fakeMsg(channelId: number, content: string): NormalizedMessage {
  return {
    messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: USER_ID,
    username: USERNAME,
    content,
    broadcasterUserId: channelId,
    broadcasterSlug: env().KICK_TARGET_CHANNEL_SLUG,
    createdAt: new Date(),
    badges: [],
    isModerator: false,
    isSubscriber: false,
    isBroadcaster: false,
    isAnonymous: false,
  };
}

async function readMember(channelId: number, userId: number): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('members')
    .select('kick_user_id, username, points, message_count, rank_idx')
    .eq('channel_id', channelId)
    .eq('kick_user_id', userId)
    .maybeSingle();
  if (error) return `(read error: ${error.message})`;
  if (!data) return null;
  const row = data as { username: string; points: number; message_count: number; rank_idx: number };
  return `${row.username} points=${row.points} messages=${row.message_count} rank_idx=${row.rank_idx}`;
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});