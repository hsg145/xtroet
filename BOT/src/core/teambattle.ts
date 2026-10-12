/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  معركة الفرق — الشات ضد بعضه.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  ناصر ينشئ المعركة من الموقع: الاسم + فريقان أو أكثر + جائزة الفائز +
 *  عقاب الخاسر. البوت يراقب ويعلن ويجمع فقط.
 *
 *    voting  → البوت يعلن الفرق، والناس تكتب اسم فريقها في الشات.
 *              كل واحد له صوت واحد فقط — أول صوت يُحسب.
 *    running → انتهى التصويت. النقاط تعدّ وقت البث.
 *    done    → الفائز معلن والمكافأة مطبّقة.
 *
 *  مطابقة الصوت: تطابق تام بعد التطبيع (normalizeArabic) مع تجاهل "ال"
 *  التعريف في البداية و"!" — فـ "الناصر" و"!ناصر" و"ناصر" كلها تصوّت لنفس
 *  الفريق. لكن "وين ناصر؟" لا تُحسب — التصويت يجب أن يكون مقصوداً،
 *  فالجملة الكاملة لا تطابق اسم فريق.
 */

import { getLogger } from '../logger.js';
import { messages } from '../messages.js';
import { normalizeArabic } from './command-parser.js';
import {
  fetchActiveBattle,
  fetchOptions,
  fetchVotes,
  recordVote,
  type BattleRow,
  type OptionRow,
} from '../db/teams.js';

/** نظّف نصاً للمقارنة: تطبيع عربي + بلا "!" + بلا "ال" في البداية. */
export function cleanVoteText(s: string): string {
  return normalizeArabic(s).replace(/^!+/, '').replace(/^ال/, '').trim();
}

/**
 * هل الرسالة تصويت لخيار معيّن؟
 *
 * تطابق تام فقط — "انا مع الاحمر" لا تُحسب، "الاحمر" تُحسب. هذا عمداً:
 * التصويت قرار، وما نبي واحد ينضم لفريق وهو كان يسأل سؤالاً عابراً.
 */
export function matchesOption(content: string, label: string): boolean {
  const c = cleanVoteText(content);
  const l = cleanVoteText(label);
  return c.length >= 2 && l.length >= 2 && c === l;
}

/** جد أول خيار تطابقه الرسالة، أو null. */
export function findVotedOption(content: string, options: OptionRow[]): OptionRow | null {
  for (const o of options) {
    if (matchesOption(content, o.label)) return o;
  }
  return null;
}

export interface TeamBattleSnapshot {
  active: boolean;
  id: number | null;
  title: string;
  status: BattleRow['status'];
  options: Array<{ id: number; label: string; votes: number }>;
  totalVotes: number;
  winningOptionId: number | null;
}

export interface TeamBattleOptions {
  channelId: number;
  send: (text: string) => void;
  intervalMs?: number;
  fetchActive?: () => Promise<BattleRow | null>;
  fetchOpts?: (battleId: number) => Promise<OptionRow[]>;
}

export class TeamBattleState {
  private opts: TeamBattleOptions;
  private timer?: NodeJS.Timeout;
  private current: BattleRow | null = null;
  private options: OptionRow[] = [];
  /** من صوّت في الذاكرة — سرعة فقط، القاعدة هي الضمانة. */
  private seen = new Set<number>();
  private counts = new Map<number, number>();
  private announcedId: number | null = null;
  private announcedRunning = false;
  private polling = false;

  constructor(opts: TeamBattleOptions) {
    this.opts = opts;
  }

  snapshot(): TeamBattleSnapshot {
    const total = [...this.counts.values()].reduce((s, n) => s + n, 0);
    return {
      active: this.current !== null,
      id: this.current?.id ?? null,
      title: this.current?.title ?? '',
      status: this.current?.status ?? 'voting',
      options: this.options.map((o) => ({ id: o.id, label: o.label, votes: this.counts.get(o.id) ?? 0 })),
      totalVotes: total,
      winningOptionId: this.current?.winning_option_id ?? null,
    };
  }

  /**
   * هل الرسالة تصويت لأحد الفرق الآن؟
   *
   * الراوتر يستدعيها قبل الأوامر وقبل النقاط — الصوت ليس أمراً ولا يستاهل
   * نقطة إضافية لمجرد المشاركة.
   */
  findVote(content: string): OptionRow | null {
    if (!this.current || this.current.status !== 'voting' || this.options.length === 0) return null;
    return findVotedOption(content, this.options);
  }

  /**
   * سجّل صوتاً. يرجع:
   *   'first'  → أول صوت (يُحتسب)
   *   'repeat' → صوّت قبل (يُتجاهل — صوت واحد فقط)
   *   'closed' → ما في تصويت مفتوح
   */
  async vote(userId: number, username: string, optionId: number): Promise<'first' | 'repeat' | 'closed'> {
    const c = this.current;
    if (!c || c.status !== 'voting') return 'closed';
    if (this.seen.has(userId)) return 'repeat';

    this.seen.add(userId);
    this.counts.set(optionId, (this.counts.get(optionId) ?? 0) + 1);
    await recordVote(c.id, optionId, userId, username);
    getLogger().info(
      { battle: c.id, user: username, option: optionId, total: this.snapshot().totalVotes },
      'team vote collected',
    );
    return 'first';
  }

  /**
   * تحدّث من القاعدة. يعلن المعركة الجديدة وخياراتها مرة واحدة فقط،
   * ويعلن بدء الفعالية مرة واحدة فقط.
   */
  async refresh(): Promise<boolean> {
    if (this.polling || !this.opts.channelId) return false;
    this.polling = true;
    try {
      const fetchActive = this.opts.fetchActive ?? (() => fetchActiveBattle(this.opts.channelId));
      const next = await fetchActive();

      if (!next) {
        this.reset();
        return false;
      }

      const prev = this.current;
      const isNew = prev?.id !== next.id;
      this.current = next;

      if (isNew) {
        this.seen.clear();
        this.counts.clear();
        this.announcedRunning = false;
        const fetchOpts = this.opts.fetchOpts ?? fetchOptions;
        this.options = await fetchOpts(next.id).catch(() => []);
        // البوت اشتغل متأخراً وفيه أصوات مسجّلة: نحمّلها كلها حتى لا
        // نعدهم مرتين في الذاكرة. القاعدة تحمي أصلاً، بس العدّ يجب أن يصح.
        for (const v of await fetchVotes(next.id)) {
          this.seen.add(v.kick_user_id);
          this.counts.set(v.option_id, (this.counts.get(v.option_id) ?? 0) + 1);
        }
        this.opts.send(messages.teamBattleStarted(next.title, this.options.map((o) => o.label)));
        this.announcedId = next.id;
        return true;
      }

      // نفس المعركة، بس انتقلت للتشغيل = بدأت الفعالية.
      if (next.status === 'running' && !this.announcedRunning) {
        this.opts.send(messages.teamBattleRunning(next.title));
        this.announcedRunning = true;
        return true;
      }

      if (next.status === 'done' || next.status === 'cancelled') {
        this.reset();
        return false;
      }

      return false;
    } catch (err) {
      getLogger().error({ err }, 'team battle: refresh failed, keeping previous state');
      return false;
    } finally {
      this.polling = false;
    }
  }

  private reset(): void {
    this.current = null;
    this.options = [];
    this.seen.clear();
    this.counts.clear();
    this.announcedId = null;
    this.announcedRunning = false;
  }

  /**
   * استطلاع تكيّفي — نفس قصة التحدي: سريع (2s) أثناء معركة نشطة،
   * وبطيء (30s) وقت الهدوء. يوفّر ~40 ألف استعلام في اليوم.
   */
  startRefresh(activeMs = 2000, idleMs = 30_000): void {
    this.stopRefresh();
    this.refreshActiveMs = activeMs;
    this.refreshIdleMs = idleMs;
    this.refreshRunning = true;
    void this.tickRefresh();
  }

  private refreshActiveMs = 2000;
  private refreshIdleMs = 30_000;
  private refreshRunning = false;

  private async tickRefresh(): Promise<void> {
    if (!this.refreshRunning) return;
    try {
      await this.refresh();
    } catch {
      // refresh() لا يرمي أبداً أصلاً — الحماية للاحتياط فقط.
    }
    if (!this.refreshRunning) return;
    const delay = this.current ? this.refreshActiveMs : this.refreshIdleMs;
    this.timer = setTimeout(() => void this.tickRefresh(), delay);
    this.timer.unref?.();
  }

  stopRefresh(): void {
    this.refreshRunning = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}