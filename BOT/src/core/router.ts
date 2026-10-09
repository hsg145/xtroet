import { env } from '../config.js';
import { getLogger } from '../logger.js';
import { messages } from '../messages.js';
import type { NormalizedMessage } from '../kick/types.js';
import type { Commands } from './commands.js';
import type { PointsEngine } from './points.js';
import type { RankStore } from './ranks.js';
import type { ChatSender } from './sender.js';

export interface RouterDeps {
  channelId: number;
  broadcasterUserId: number;
  engine: PointsEngine;
  ranks: RankStore;
  sender: ChatSender;
  commands: Commands;
  /** Flush pending points synchronously before admin writes (avoid drift). */
  flushNow: () => Promise<void>;
  selfUserIds: Set<number>;
}

/**
 * Message router: a message is either a command or a point-awarding chat
 * message. Everything is wrapped so a failure never kills the process.
 */
export class MessageRouter {
  private deps: RouterDeps;
  private e = env();

  constructor(deps: RouterDeps) {
    this.deps = deps;
  }

  async route(msg: NormalizedMessage): Promise<void> {
    const log = getLogger();
    try {
      if (msg.broadcasterUserId !== this.deps.channelId) return;

      // Our own replies echo back on the feed carrying the broadcaster's user
      // id, so the only reliable way to spot them is the message id the send
      // API handed us. The broadcaster themselves is a normal member and does
      // earn points.
      if (this.deps.sender.isOwnMessage(msg.messageId)) return;

      const isCommand = msg.content.trim().startsWith(this.e.COMMAND_PREFIX);
      if (isCommand) {
        log.debug({ user: msg.username, command: msg.content.slice(0, 20) }, 'command received');
        const handled = await this.deps.commands.handle(msg);
        if (handled) return;
        // Admin commands mutate the DB directly, so make sure nothing pending
        // is still only in memory.
        if (/^(addpts|setpts|resetuser)/i.test(msg.content.trim().slice(this.e.COMMAND_PREFIX.length))) {
          await this.deps.flushNow();
        }
        return;
      }

      await this.award(msg);
    } catch (err) {
      log.error({ err, user: msg.username }, 'router failed (caught)');
    }
  }

  private async award(msg: NormalizedMessage): Promise<void> {
    const log = getLogger();
    const state = await this.deps.engine.ensure(this.deps.channelId, msg.userId, msg.username);

    const decision = this.deps.engine.award(state, {
      username: msg.username,
      content: msg.content,
      ignored: new Set([...this.e.IGNORED_USERNAMES.map((u) => u.toLowerCase()), 'kickbot']),
      // Empty on purpose: the broadcaster's id is here, and the owner is a
      // real member. Our own output is already filtered by message id above.
      selfUserIds: new Set<number>(),
      commandPrefix: this.e.COMMAND_PREFIX,
      cooldownMs: this.e.POINTS_COOLDOWN_SECONDS * 1000,
      duplicateWindowMs: this.e.DUPLICATE_WINDOW_SECONDS * 1000,
      minLength: this.e.MIN_MESSAGE_LENGTH,
    });

    if (!decision.awarded) {
      // Info, not debug: when someone writes a message and no point lands, this
      // line is the difference between "the rule blocked it" and "the bot is
      // broken". Cheap, and it is the first thing anyone needs.
      log.info(
        { user: msg.username, reason: decision.reason, content: msg.content.slice(0, 40) },
        'message did not earn a point',
      );
      return;
    }

    log.info({ user: msg.username, points: decision.state.points }, 'point awarded');

    // Rank-up announcements are NOT sent here. The flusher announces them from
    // the database after the write succeeds, so a rank-up is announced exactly
    // once and only once it is actually persisted. Announcing from memory AND
    // from the DB produced duplicate messages in the channel.
  }
}