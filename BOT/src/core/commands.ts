import { env } from '../config.js';
import { fetchLeaderboard, fetchPosition, findMemberByUsername, setPoints } from '../db/repo.js';
import { getLogger } from '../logger.js';
import { computeProgress, messages } from '../messages.js';
import type { NormalizedMessage } from '../kick/types.js';
import {
  COMMAND_ALIASES,
  normalizeArabic,
  parseAdminArgs,
  parseCommand,
  parseTarget,
} from './command-parser.js';
import { CooldownMap } from './cooldown.js';
import type { PointsEngine } from './points.js';
import { crossedRanks, type RankStore } from './ranks.js';
import type { ChatSender } from './sender.js';

export {
  COMMAND_ALIASES,
  normalizeArabic,
  parseAdminArgs,
  parseCommand,
  parseTarget,
  type CommandMatch,
} from './command-parser.js';

/** The single owner allowed to run admin commands. */
const OWNER_USERNAME = 'xtroet';

export interface CommandDeps {
  channelId: number;
  broadcasterUserId: number;
  engine: PointsEngine;
  ranks: RankStore;
  sender: ChatSender;
  statusInfo: () => {
    uptime: string;
    queue: number;
    pending: number;
    lastFlush: string;
    lastEvent: string;
    subscriptionOk: boolean;
  };
}

export class Commands {
  private userCooldown: CooldownMap;
  private globalCooldown: CooldownMap;
  private deps: CommandDeps;
  private e = env();

  constructor(deps: CommandDeps) {
    this.deps = deps;
    this.userCooldown = new CooldownMap(this.e.COMMAND_COOLDOWN_SECONDS * 1000);
    // One global slot: rate limit for the whole channel.
    this.globalCooldown = new CooldownMap(this.e.GLOBAL_COMMAND_COOLDOWN_MS);
  }

  /**
   * ONLY xtroet (the owner) may run admin commands.
   *
   * No moderators, no ADMIN_USER_IDS list, no broadcaster badge: the name
   * check is case-insensitive (normalizeArabic lowercases), so `XTROET`,
   * `xtroet` and `@xtroet` all match — and nobody else ever does.
   */
  isAdmin(msg: NormalizedMessage): boolean {
    return normalizeArabic(msg.username) === OWNER_USERNAME;
  }

  /** Returns true when the message was a known command (answered or ignored). */
  async handle(msg: NormalizedMessage): Promise<boolean> {
    const match = parseCommand(msg.content, this.e.COMMAND_PREFIX, COMMAND_ALIASES);
    if (!match || match.name === 'unknown') return false;

    if (!this.userCooldown.take(msg.userId)) return true;
    if (!this.globalCooldown.take(0)) return true;

    const priority = match.name === 'rank' || match.name === 'top' ? 'high' : 'low';

    try {
      switch (match.name) {
        case 'rank':
          await this.cmdRank(msg, match.rest);
          return true;
        case 'top':
          await this.cmdTop();
          return true;
        case 'ranks':
          this.deps.sender.sendAll(messages.ranksList(this.deps.ranks.all()), 'low');
          return true;
        case 'addpts':
          await this.cmdAddPts(msg, match.rest);
          return true;
        case 'setpts':
          await this.cmdSetPts(msg, match.rest);
          return true;
        case 'resetuser':
          await this.cmdResetUser(msg, match.rest);
          return true;
        case 'status':
          this.deps.sender.send(this.buildStatus(), priority);
          return true;
        default:
          return false;
      }
    } catch (err) {
      getLogger().error({ err, command: match.name }, 'command failed (caught)');
      return true;
    }
  }

  /** !رتبة [name] -- own rank, or someone else's when a name is given. */
  private async cmdRank(msg: NormalizedMessage, rest: string): Promise<void> {
    const target = parseTarget(rest);

    if (!target || target === normalizeArabic(msg.username)) {
      const state = await this.deps.engine.ensure(this.deps.channelId, msg.userId, msg.username);
      const progress = computeProgress(this.deps.ranks.all(), state.points);
      const position = await fetchPosition(this.deps.channelId, msg.userId).catch(() => null);
this.deps.sender.send(
        messages.rankOf({
        username: msg.username,
        rank: progress.current,
        points: state.points,
        position,
        ratio: progress.ratio,
        remaining: progress.remaining,
        nextRank: progress.next,
        percent: progress.percent,
      }),
        'high',
        msg.messageId,
      );
      return;
    }

    // Someone else: look them up by username in our own members table.
    const member = await findMemberByUsername(this.deps.channelId, target);
    if (!member) {
      this.deps.sender.send(messages.rankOfOtherNotFound(target), 'low');
      return;
    }

    const progress = computeProgress(this.deps.ranks.all(), member.points);
    const position = await fetchPosition(this.deps.channelId, member.kick_user_id).catch(() => null);
this.deps.sender.send(
      messages.rankOf({
        username: member.username || target,
        rank: progress.current,
        points: member.points,
        position,
        ratio: progress.ratio,
        remaining: progress.remaining,
        nextRank: progress.next,
        percent: progress.percent,
      }),
      'high',
    );
  }

  private async cmdTop(): Promise<void> {
    const rows = await fetchLeaderboard(this.deps.channelId, 5);
    this.deps.sender.send(
      messages.top(rows.map((r) => ({ username: r.username || `user${r.kick_user_id}`, points: r.points }))),
      'high',
    );
  }

  /** !addpts name N (positive only) */
  private async cmdAddPts(msg: NormalizedMessage, rest: string): Promise<void> {
    if (!this.isAdmin(msg)) return; // silently ignored for non-admins
    const parsed = parseAdminArgs(rest, false);
    if (!parsed) return;

    const member = await findMemberByUsername(this.deps.channelId, parsed.target);
    if (!member) {
      this.deps.sender.send(messages.rankOfOtherNotFound(parsed.target), 'low');
      return;
    }

    const username = member.username || parsed.target;
    const before = member.points;
    const after = before + parsed.amount;
    const crossed = crossedRanks(this.deps.ranks.all(), before, after);

    await setPoints(this.deps.channelId, member.kick_user_id, username, after);
    const rank = this.deps.ranks.rankForPoints(after);
    this.deps.engine.overridePoints(member.kick_user_id, after, rank.idx);

    this.deps.sender.send(messages.pointsAdded(username, parsed.amount, rank), 'high');
    // Several ranks may have been crossed at once: announce only the final one.
    const finalRank = crossed.length > 0 ? crossed[crossed.length - 1]! : rank;
    this.deps.sender.send(messages.rankUpAdmin(username, finalRank), 'high');
  }

  /** !setpts name N (may be negative) */
  private async cmdSetPts(msg: NormalizedMessage, rest: string): Promise<void> {
    if (!this.isAdmin(msg)) return;
    const parsed = parseAdminArgs(rest, true);
    if (!parsed) return;

    const member = await findMemberByUsername(this.deps.channelId, parsed.target);
    if (!member) {
      this.deps.sender.send(messages.rankOfOtherNotFound(parsed.target), 'low');
      return;
    }

    const username = member.username || parsed.target;
    await setPoints(this.deps.channelId, member.kick_user_id, username, parsed.amount);
    const rank = this.deps.ranks.rankForPoints(Math.max(0, parsed.amount));
    this.deps.engine.overridePoints(member.kick_user_id, Math.max(0, parsed.amount), rank.idx);
    this.deps.sender.send(messages.pointsSet(username, Math.max(0, parsed.amount), rank), 'high');
  }

  /** !resetuser name */
  private async cmdResetUser(msg: NormalizedMessage, rest: string): Promise<void> {
    if (!this.isAdmin(msg)) return;
    const target = parseTarget(rest);
    if (!target) return;

    const member = await findMemberByUsername(this.deps.channelId, target);
    if (!member) {
      this.deps.sender.send(messages.rankOfOtherNotFound(target), 'low');
      return;
    }

    await setPoints(this.deps.channelId, member.kick_user_id, member.username, 0, true);
    this.deps.engine.overridePoints(member.kick_user_id, 0, 1);
    this.deps.sender.send(messages.userReset(member.username || target), 'high');
  }

  private buildStatus(): string {
    const info = this.deps.statusInfo();
    return messages.status({
      uptime: info.uptime,
      channel: this.e.KICK_TARGET_CHANNEL_SLUG,
      mode: this.e.TEST_MODE ? 'test' : 'live',
      queue: info.queue,
      pending: info.pending,
      lastFlush: info.lastFlush,
      lastEvent: info.lastEvent,
      subscriptionOk: info.subscriptionOk,
    });
  }
}

