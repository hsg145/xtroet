/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  تحدي رايس — شخص واحد ضد الشات كله.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  من يقرر كل شي هو الأدمن من الموقع. البوت يراقب ويسجّل ويعلن فقط.
 *
 *    1. الأدمن ينشئ التحدي  → البوت يعلنه أول ما ينش�� (refresh كل ثانيتين)
 *    2. الأدمن يوقفه ويقرر الفائز → البوت يختار كلمة عشوائية ويعلنها
 *    3. الناس تكتب الكلمة → البوت يجمع كل من كتبها
 *    4. الأدمن يضغط "إيقاف" → التوزيع والعقاب ينطبّقوا في القاعدة
 *
*  الكلمة عشوائية كل مرة: البوت هو اللي يختارها مو الأدمن، عشان ما أحد
 *  يقدر يشوف الكلمة من الداشبورد ويكسل عن الكتابة.
 *
 *  ضد التكرار: الضمانة الحقيقية هي primary key على
 *  (challenge_id, kick_user_id). الـ Set هنا مجرد سرعة للردّ على الشات؛ لو
 *  ضاع أو اتأخر، القاعدة ما بتسمح بالتكرار ولا مرة.
 */

import { getLogger } from '../logger.js';
import { messages } from '../messages.js';
import {
  countEntries,
  fetchActiveChallenge,
  fetchEntries,
  recordEntry,
  type ChallengeRow,
} from '../db/challenge.js';

/** الكلمات المتاحة — وحدة منها تُختار عشوائياً لكل تحدي. */
export const CHALLENGE_KEYWORDS = ['!MT', '!ناصر', '!PM', '!دخول'] as const;

export interface ChallengeSnapshot {
  /** هل في تحدي جارٍ أصلاً؟ */
  active: boolean;
  id: number | null;
  challenger: string;
  status: ChallengeRow['status'];
  winner: ChallengeRow['winner'];
  /** الكلمة المعلنة الآن (فقط أثناء collecting). */
  keyword: string | null;
  /** كم واحد كتب الكلمة. */
  collected: number;
  /** هل الكلمة المعلنة صالحة للاستقبال؟ */
  collecting: boolean;
}

/** يختار كلمة عشوائية — نفس الكلمة ممكن تطلع مرتين، عادي. */
export function pickKeyword(random: () => number = Math.random): string {
  const i = Math.floor(random() * CHALLENGE_KEYWORDS.length);
  return CHALLENGE_KEYWORDS[Math.min(i, CHALLENGE_KEYWORDS.length - 1)]!;
}

/**
 * يطابق رسالة مع الكلمة الحالية.
 *
 * لا حساسية لحالة الأحرف، وبنقبل الكلمة لوحدها أو مع نص قبلها/بعدها،
 * لأن الناس بتكتب "!MT" أو "يا ناصر !MT الحين" — والنيّة واضحة.
 * لكن لازم الكلمة تكون حدود كلمة، وإلا "دخول" بتطابق "دخولCOME".
 */
export function matchesKeyword(content: string, keyword: string): boolean {
  const needle = keyword.trim();
  if (needle.length < 2) return false;
  // نطابق الكلمة الكلاشية (case-insensitive) — العربية ما فيها case،
  // واللاتينية نخليها insensitive عشان "!mt" و"!MT" نفس الشيء.
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'iu').test(content);
}

export interface ChallengeStateOptions {
  channelId: number;
  /** يبعت نص في الشات. */
  send: (text: string) => void;
  intervalMs?: number;
  /** للاختبار: مصدر بديل للحالة. */
  fetchActive?: () => Promise<ChallengeRow | null>;
  random?: () => number;
}

export class ChallengeState {
  private opts: ChallengeStateOptions;
  private timer?: NodeJS.Timeout;
  private current: ChallengeRow | null = null;
  /** اللي كتبوا الكلمة في الذاكرة — سرعة فقط، القاعدة هي الضمانة. */
  private seen = new Set<number>();
  private collectedCount = 0;
  /** آخر تحدي علنّا إعلانه، حتى ما نكرر الإعلان كل 15 ثانية. */
  private announcedId: number | null = null;
  private announcedKeyword = false;
  private polling = false;

  constructor(opts: ChallengeStateOptions) {
    this.opts = opts;
  }

  snapshot(): ChallengeSnapshot {
    const c = this.current;
    return {
      active: c !== null,
      id: c?.id ?? null,
      challenger: c?.challenger ?? '',
      status: c?.status ?? 'running',
      winner: c?.winner ?? null,
      keyword: c?.keyword ?? null,
      collected: this.collectedCount,
      collecting: c?.status === 'collecting' && c.keyword !== null,
    };
  }

  /**
   * هل الرسالة دي من محاول يكتب الكلمة الآن؟
   *
   * الراوتر يستدعيها لكل رسالة قبل حساب النقاط، عشان الكلمة ما تحسب
   * نقطة ولا تتحوّل لرسالة عادية.
   */
  isKeywordAttempt(content: string): boolean {
    const c = this.current;
    if (!c || c.status !== 'collecting' || !c.keyword) return false;
    return matchesKeyword(content, c.keyword);
  }

  /**
   * سجّل محاولة كتابة الكلمة. يرجع:
   *   'first'  → أول مرة (الجديد، يستاهل نحيّيه)
   *   'repeat' → كتب الكلمة قبل (يتجاهل)
   *   'closed' → ما في جمع مفتوح
   */
  async collect(userId: number, username: string): Promise<'first' | 'repeat' | 'closed'> {
    const c = this.current;
    if (!c || c.status !== 'collecting' || !c.keyword) return 'closed';
    if (this.seen.has(userId)) return 'repeat';

    this.seen.add(userId);
    this.collectedCount += 1;
    await recordEntry(c.id, userId, username);
    getLogger().info({ challenge: c.id, user: username, total: this.collectedCount }, 'challenge entry collected');
    return 'first';
  }

  /**
   * تحدّث من القاعدة. يرجع true إذا تغيّرت حاجة يستاهل إعلانها.
   *
   * بدون تغيير في الحالة، ما ينرسل شي — عشان ما يصير إزعاج في الشات.
   */
  async refresh(): Promise<boolean> {
    if (this.polling || !this.opts.channelId) return false;
    this.polling = true;
    try {
      const fetchActive = this.opts.fetchActive ?? (() => fetchActiveChallenge(this.opts.channelId));
      const next = await fetchActive();

      // ما في تحدي جارٍ (خلص أو انلغى) — نبدأ من الصفر.
      if (!next) {
        const had = this.current !== null;
        this.reset();
        return false;
      }

      const prev = this.current;
      const isNew = prev?.id !== next.id;
      this.current = next;

      if (isNew) {
        // تحدي جديد: حالة نظيفة + إعلان الافتتاح.
        this.seen.clear();
        this.collectedCount = 0;
        this.announcedKeyword = false;
        this.opts.send(messages.challengeStarted(next.title || 'تحدي رايس', next.challenger));
        this.announcedId = next.id;
        return true;
      }

      // نفس التحدي، بس صار "collecting" = انتهى وطلع وقت الكلمة.
      if (next.status === 'collecting' && !this.announcedKeyword) {
        // البوت اشتغل والتحدي صار "collecting" من أوله (إعادة تشغيل مثلاً):
        // نحمّل اللي كتبوا الكلمة من القاعدة بدل ما نحسبهم من الصفر.
        this.collectedCount = await countEntries(next.id);
        if (this.collectedCount > 0) {
          this.seen = new Set((await fetchEntries(next.id)).map((e) => e.kick_user_id));
        }
        this.opts.send(messages.challengeKeyword(next.challenger, next.keyword ?? '—', this.collectedCount));
        this.announcedKeyword = true;
        return true;
      }

      // تحدي انتهى بالكامل (status = done/cancelled): ننسى.
      if (next.status === 'done' || next.status === 'cancelled') {
        this.reset();
        return false;
      }

      return false;
    } catch (err) {
      getLogger().error({ err }, 'challenge: refresh failed, keeping previous state');
      return false;
    } finally {
      this.polling = false;
    }
  }

  private reset(): void {
    this.current = null;
    this.seen.clear();
    this.collectedCount = 0;
    this.announcedKeyword = false;
    this.announcedId = null;
  }

  startRefresh(intervalMs = 2000): void {
    this.stopRefresh();
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    this.timer.unref();
  }

  stopRefresh(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** آخر تحدي علنّاه — للاختبارات والتشخيص. */
  get lastAnnouncedId(): number | null {
    return this.announcedId;
  }
}

/**
 * ينشئ تحدياً جديداً ويختار له كلمة عشوائية فوراً.
 *
 * الداشبورد ينادي هالشي عند الضغط على "ابدأ التحدي"، والبوت يكتشفه في
 * refresh التالي (خلال ثانيتين) ويعلنه.
 */
export async function createChallenge(opts: {
  channelId: number;
  challenger: string;
  note?: string;
}): Promise<ChallengeRow | null> {
  const { getSupabase } = await import('../db/supabase.js');
  const keyword = pickKeyword();
  const { data, error } = await getSupabase()
    .from('challenges')
    .insert({
      channel_id: opts.channelId,
      challenger: opts.challenger.trim(),
      status: 'running',
      keyword,
      note: opts.note?.trim() ?? '',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`[supabase] create challenge: ${error.message}`);
  return data as ChallengeRow;
}