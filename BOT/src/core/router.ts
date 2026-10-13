import { env } from '../config.js';
import { getLogger } from '../logger.js';
import type { NormalizedMessage } from '../kick/types.js';
import type { ChallengeState } from './challenge.js';
import type { Commands } from './commands.js';
import type { GateVerdict, LiveGate } from './livestate.js';
import type { PointsEngine, PromoProvider } from './points.js';
import type { RankStore } from './ranks.js';
import type { ChatSender } from './sender.js';
import type { TeamBattleState } from './teambattle.js';

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
  /** Dashboard promos (events, mutes, multipliers, drop codes). Optional. */
  promo?: PromoProvider;
  /**
   * بوابة البث. بدونها البوت ما يوزّع نقاط أبداً (fail-closed)، لأن القاعدة
   * الأساسية هي: لا نقاط إلا أثناء بث موثّق.
   */
  live: LiveGate;
  /**
   * تحدي رايس. اختياري: تحدي مفعّل يوقف احتساب النقاط على رسالة الكلمة
   * ويسجّل صاحبها. غيابه لا يوقف البوت — بس ما يصير في تحدي.
   */
  challenge?: ChallengeState;
  /**
   * معركة الفرق. اختياري مثل التحدي: صوت مفعّل يوقف احتساب النقاط على
   * رسالة التصويت ويسجّلها.
   */
  teams?: TeamBattleState;
}

/**
 * Message router: a message is either a command or a point-awarding chat
 * message. Everything is wrapped so a failure never kills the process.
 */
export class MessageRouter {
  private deps: RouterDeps;
  private e = env();
  private warnedNoChannel = false;

  constructor(deps: RouterDeps) {
    this.deps = deps;
  }

  async route(msg: NormalizedMessage): Promise<void> {
    const log = getLogger();
    try {
      if (msg.broadcasterUserId !== this.deps.channelId) {
        // channelId 0 means the Kick channel never resolved at boot, and that
        // would drop EVERY message with no trace at all. Say it once, loudly.
        if (this.deps.channelId <= 0 && !this.warnedNoChannel) {
          this.warnedNoChannel = true;
          log.error(
            { got: msg.broadcasterUserId },
            'the Kick channel was never resolved (channel id 0) — every incoming message is being dropped. Check the "Kick token + channel" readiness check.',
          );
        }
        return;
      }

      // Our own replies echo back on the feed carrying the broadcaster's user
      // id, so the only reliable way to spot them is the message id the send
      // API handed us. The broadcaster themselves is a normal member and does
      // earn points.
      if (this.deps.sender.isOwnMessage(msg.messageId)) return;

      // ── صوت معركة الفرق ───────────────────────────────────
      // قبل التحدي وقبل النقاط: التصويت لفريق ليس أمراً ولا يستاهل نقطة.
      // صامت تماماً مثل جمع الكلمة — العدّاد في اللوحة يكفي.
      const voted = this.deps.teams?.findVote(msg.content);
      if (voted) {
        await this.deps.teams?.vote(msg.userId, msg.username, voted.id);
        return;
      }

      // ── كلمة التحدي ─────────────────────────────────────────
      // قبل الأوامر وقبل احتساب النقاط: الكلمة المعلنة ما هي أمر، ولا
      // يستاهل واحد يصير عنده نقطةextra لمجرد إنه ردّ على إعلان.
      if (this.deps.challenge?.isKeywordAttempt(msg.content)) {
        await this.collectChallengeKeyword(msg);
        return;
      }

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

/**
   * سجّل محاولة كتابة كلمة التحدي.
   *
   * بدون أي ردّ بالشات. كان في رسالة "✅ @x سجّل 🔥 12" لكل واحد، وبطلت
   * لأن الفعالية تجي 100+ واحد وكل واحد يبي يحجز مكان — الشات يتغرق
   * بإشعارات ما أحد يقراها. العدّاد في لوحة الإدارة يحرك لحاله كل ثانيتين
   * وهذا يكفي家企业.
   */
  private async collectChallengeKeyword(msg: NormalizedMessage): Promise<void> {
    const state = this.deps.challenge;
    if (!state) return;
    await state.collect(msg.userId, msg.username);
  }

  private async award(msg: NormalizedMessage): Promise<void> {
    const log = getLogger();

    // ── بوابة البث: أول شي، قبل أي قراءة من القاعدة ──────────
    // لازم نتأكد إن صاحب القناة فتح بث حقيقي قبل ما نسجّل نقطة لأحد.
    // المقروءة من الذاكرة (الخلفية تحدّثها كل LIVE_POLL_MS) فبتكون رخيصة.
    const gate = this.deps.live.allowsAward();
    if (!gate.allowed) {
      log.info(
        { user: msg.username, reason: gate.reason, content: msg.content.slice(0, 40) },
        'point blocked: no verified live broadcast',
      );
      return;
    }

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
      channelId: this.deps.channelId,
      promo: this.deps.promo,
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