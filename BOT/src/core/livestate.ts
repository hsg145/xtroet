/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  البوابة الوحيدة لمنح النقاط: لا نقاط إلا أثناء بث حيّ موثّق.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  القاعدة: لا أحد يجمع نقطة إلا إذا كان صاحب القناة (xtroet أو صاحب الحساب
 *  المسجّل في القناة) قد فتح بثاً حقيقياً. بدون بث = صفر نقاط، مهما كان عدد
 *  الرسائل.
 *
 *  مصدر الحقيقة هو `GET /public/v1/channels?slug=…` (نطاق channel:read)،
 *  وحقل `stream` داخله. الشكل الحقيقي المقيس من الـ API الحيّ:
 *
 *    stream: { url, key, is_live, is_mature, language,
 *              start_time, viewer_count, thumbnail }
 *
 *  ونتيجة أنه `is_live` وحده ما يكفي كدليل:
 *    - البث قد ينتهي ويترك `is_live: true` لحظات قبل أن يتحدّث.
 *    - قد يرد الـ API بقيمة `is_live: true` لنتيجة مؤقتة أو ناقصة.
 *
 *  فبنطلب أدلة متتالية قبل ما نسمح:
 *
 *    strong = is_live===true  &&  start_time سنة حقيقية  &&  url  &&  key
 *    weak   = is_live===true  &&  start_time سنة حقيقية  &&  (url ناقص أو key ناقص)
 *
 *  strong يفتح البوابة فوراً. weak لا يفتحها من أول مرة: لازم يتكرر
 *  `confirmChecks` مرة متتالية قبل ما نصدّقه. أي نقص = بث غير موثوق.
 *
 *  الأمان (fail-closed): أي شك = مقفول.
 *    - أول تشغيل قبل أول فحص = مقفول (لا نقاط بلا تحقق).
 *    - فشل الاتصال = نستخدم آخر نتيجة موثوقة بس لحد maxStaleMs، بعدها نقفل.
 *    - معرّف القناة الراجع من كيك لازم يطابق القناة المسجّلة عندنا.
 *
 *  نعالج التذبذب في الاتجاه الآمن فقط: لو كنا "مبثّ" ووصلنا offline مؤكد،
 *  نُبقي البوابة مفتوحة لمقدار grace (30s افتراضي) حتى لا تنقطع نقاط الناس
 *  بسبب فحص واحد ضاع. عكس ذلك (فتح بث) ما نأجله أبداً.
 */

import { getLogger } from '../logger.js';

/** استجابة كيك الخام للقناة — نقرأ منها `stream` فقط. */
export interface ChannelPayload {
  broadcaster_user_id?: unknown;
  slug?: unknown;
  stream?: unknown;
}

export type StreamVerdict =
  /** أدلة كاملة: بث حيّ مؤكد بلا شك. */
  | 'live-strong'
  /** is_live بس ناقص أدلة — يحتاج تكرار قبل ما نصدّقه. */
  | 'live-weak'
  /** ما في بث. */
  | 'offline'
  /** صاحب القناة ثاني أو البث ما يخصّنا. */
  | 'wrong-channel'
  /** ما في حقل stream أصلاً. */
  | 'no-stream';

export interface StreamEvaluation {
  verdict: StreamVerdict;
  /** جملة قصيرة تُسجَّل في اللوق — تساعد عند تشخيص الدخول. */
  reason: string;
  /** وقت بداية البث (ms)، أو null. */
  startedAt: number | null;
  /** مفتاح يميّز الجلسة عن غيرها (key + start_time). */
  sessionKey: string | null;
  viewerCount: number | null;
}

/** سبب منع النقاط — يظهر في اللوق وفي /health. */
export type GateReason =
  | 'live'
  | 'offline'
  | 'confirming'
  | 'no-stream'
  | 'wrong-channel'
  | 'stale'
  | 'no-channel'
  | 'disabled';

export interface GateVerdict {
  allowed: boolean;
  reason: GateReason;
}

export interface LiveSnapshot {
  /** هل البوابة مفتوحة الآن؟ */
  live: boolean;
  reason: GateReason;
  /** آخر محاولة فحص. */
  checkedAt: number | null;
  /** آخر فحص نجح ونتجته موثوقة. */
  confirmedAt: number | null;
  startedAt: number | null;
  sessionKey: string | null;
  viewerCount: number | null;
  pendingConfirm: number;
  pollsOk: number;
  pollsFailed: number;
  lastError: string | null;
  /** هل البوابة مطلوبة أصلاً (LIVE_REQUIRED)؟ */
  required: boolean;
}

/**
 * كيك يرسل `0001-01-01T00:00:00Z` وقت ما يكون البث مقفول. لو مرّ هذا
 * كـ "وقت بداية حقيقي" لانقلب الحكم كله، لأن كل بث مقفول صار يطابق شرط
 * البداية. فنرفض أي سنة قبل 2000.
 */
const MIN_PLAUSIBLE_YEAR = 2000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** يقرأ لحظة بداية البث ويرفض التاريخ الصفري. */
export function parseStartTime(value: unknown): number | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  if (!Number.isFinite(year) || year < MIN_PLAUSIBLE_YEAR) return null;
  return ms;
}

/**
 * يقرأ موضع البث من استجابة كيك ويقرر إن كان بثاً حقيقياً.
 *
 * `expectedChannelId`: معرّف صاحب القناة عندنا. لو رجع من كيك معرّف غيره فال بث
 * ما يخصّنا ونرفضه — يمنع أي إعادة توجيه للنطاق.
 */
export function evaluateStream(
  payload: unknown,
  expectedChannelId: number | null,
): StreamEvaluation {
  const miss = (verdict: StreamVerdict, reason: string): StreamEvaluation => ({
    verdict,
    reason,
    startedAt: null,
    sessionKey: null,
    viewerCount: null,
  });

  const channel = asRecord(payload);
  if (!channel) return miss('no-stream', 'استجابة كيك ما فيها قناة');

  // 0 أو null = ما تحل معرّف القناة بعد، فما فيه اللي نقارنه.
  const expected = Number(expectedChannelId ?? 0);
  const remoteId = Number(channel.broadcaster_user_id);
  if (expected > 0 && Number.isFinite(remoteId) && remoteId !== expected) {
    return miss('wrong-channel', `معرّف القناة ${remoteId} مختلف عن ${expected}`);
  }

  const stream = asRecord(channel.stream);
  if (!stream) return miss('no-stream', 'ما في حقل stream بالاستجابة');

  const rawViewers = Number(stream.viewer_count);
  const viewerCount = Number.isFinite(rawViewers) ? rawViewers : null;

  // لازم boolean true صريح — مش أي قيمة تقيّمية.
  if (stream.is_live !== true) {
    return {
      verdict: 'offline',
      reason: 'is_live ليس true',
      startedAt: null,
      sessionKey: null,
      viewerCount,
    };
  }

  const startedAt = parseStartTime(stream.start_time);
  if (startedAt === null) {
    // is_live يقول نعم بس ما في وقت بداية حقيقي = ما نصدّقه.
    return {
      verdict: 'offline',
      reason: 'is_live=true بدون start_time حقيقي',
      startedAt: null,
      sessionKey: null,
      viewerCount,
    };
  }

  const key = nonEmptyString(stream.key);
  const url = nonEmptyString(stream.url);
  const sessionKey = `${key ?? 'nokey'}@${startedAt}`;

  if (key && url) {
    return { verdict: 'live-strong', reason: 'is_live + url + key', startedAt, sessionKey, viewerCount };
  }

  const missing = [!url && 'url', !key && 'key'].filter(Boolean).join('+');
  return { verdict: 'live-weak', reason: `is_live بس ناقص ${missing}`, startedAt, sessionKey, viewerCount };
}

export interface LiveGateOptions {
  /** يجلب استجابة القناة من كيك. يرمي عند فشل الشبكة، ويرجع null لو ما لقاها. */
  probe: (slug: string) => Promise<ChannelPayload | null>;
  slug: string;
  /** معرّف صاحب القناة؛ 0 لما لسّ ما تحل. */
  channelId: () => number;
  /** false = البوابة مقفلة والنقاط تُحتسب دائماً (وضع المشرف). */
  required: boolean;
  pollMs: number;
  /** بعد هالكم من الفشل، آخر نتيجة موثوقة تنتهي صلاحيتها. */
  maxStaleMs: number;
  /** مهلة أمان بعد إغلاق بث مؤكد، تمنع انقطاع النقاط من فحص واحد ضاع. */
  offlineGraceMs: number;
  /** كم فحص ضعيف متتالي لازم قبل ما نصدّق البث. */
  confirmChecks: number;
}

export class LiveGate {
  private opts: LiveGateOptions;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private polling: Promise<void> | null = null;
  private listeners: Array<(snap: LiveSnapshot, prev: LiveSnapshot) => void> = [];

  private live = false;
  private reason: GateReason = 'offline';
  private checkedAt: number | null = null;
  private confirmedAt: number | null = null;
  private startedAt: number | null = null;
  private sessionKey: string | null = null;
  private viewerCount: number | null = null;
  private lastLiveAt: number | null = null;
  private pendingConfirm = 0;
  private pollsOk = 0;
  private pollsFailed = 0;
  private lastError: string | null = null;

  constructor(opts: LiveGateOptions) {
    this.opts = opts;
    if (!opts.required) this.reason = 'disabled';
  }

  /** يُستدعى عند تغيّر حالة البث (يبدأ أو ينتهي). */
  onChange(fn: (snap: LiveSnapshot, prev: LiveSnapshot) => void): void {
    this.listeners.push(fn);
  }

  snapshot(): LiveSnapshot {
    return {
      live: this.live,
      reason: this.reason,
      checkedAt: this.checkedAt,
      confirmedAt: this.confirmedAt,
      startedAt: this.startedAt,
      sessionKey: this.sessionKey,
      viewerCount: this.viewerCount,
      pendingConfirm: this.pendingConfirm,
      pollsOk: this.pollsOk,
      pollsFailed: this.pollsFailed,
      lastError: this.lastError,
      required: this.opts.required,
    };
  }

  /**
   * هل نسمح بمنح نقطة الآن؟ — يستدعيها الراوتر قبل كل رسالة.
   *
   * تقرأ الذاكرة بس (ما في شبكة بهالمسار) لأن الخلفية تحدّث الحالة كل pollMs.
   * ترجع false عند أي شك.
   */
  allowsAward(now = Date.now()): GateVerdict {
    if (!this.opts.required) return { allowed: true, reason: 'disabled' };

    if (this.opts.channelId() <= 0) return { allowed: false, reason: 'no-channel' };
    if (!this.live) return { allowed: false, reason: this.reason };

    // آخر نتيجة موثوقة لازم تكون طازجة. بعد هالوقت البوابة تقفل حتى لو ما
    // قدرنا نتأكد — الاستمرار على نتيجة قديمة = تسريب نقاط.
    if (this.confirmedAt === null || now - this.confirmedAt > this.opts.maxStaleMs) {
      return { allowed: false, reason: 'stale' };
    }
    return { allowed: true, reason: 'live' };
  }

  /**
   * يدمج نتيجة فحص واحدة. منفصل عن pollOnce ليكون قابل للاختبار بلا شبكة
   * وبلا مؤقتات.
   */
  applyEvaluation(ev: StreamEvaluation, now: number): void {
    this.checkedAt = now;
    this.viewerCount = ev.viewerCount;

    switch (ev.verdict) {
      case 'live-strong': {
        this.pendingConfirm = 0;
        this.confirmedAt = now;
        this.open(ev, now);
        return;
      }
      case 'live-weak': {
        this.pendingConfirm += 1;
        if (this.pendingConfirm >= this.opts.confirmChecks) {
          this.pendingConfirm = 0;
          this.confirmedAt = now;
          this.open(ev, now);
        } else {
          // لسّ ما تأكّدنا — البوابة تبقى مقفولة ما لم تكن مفتوحة أصلاً.
          if (!this.live) this.reason = 'confirming';
        }
        return;
      }
      default: {
        this.pendingConfirm = 0;
        this.close(now, ev.verdict, ev.reason);
      }
    }
  }

  private open(ev: StreamEvaluation, now: number): void {
    const prev = this.snapshot();
    const wasLive = this.live;
    this.live = true;
    this.reason = 'live';
    this.startedAt = ev.startedAt;
    this.sessionKey = ev.sessionKey;
    this.lastLiveAt = now;
    this.lastError = null;
    // لحظة الانتقال هي اللي تهم المستمعين: فتحنا البوابة للتو.
    this.emit(!wasLive, prev, now);
  }

  private close(now: number, verdict: StreamVerdict, why: string): void {
    // مهلة الأمان: لو كنا بثّاً حقيقياً ووصلنا إغلاق مؤكد، ننتظر شوي قبل
    // ما نقفل — فحص واحد ضاع ما يوقف نقاط الناس بلا سبب.
    if (this.live && this.lastLiveAt !== null && now - this.lastLiveAt <= this.opts.offlineGraceMs) {
      this.lastError = why;
      return;
    }

    const prev = this.snapshot();
    const wasLive = this.live;
    this.live = false;
    this.reason = verdict === 'wrong-channel' ? 'wrong-channel' : 'offline';
    this.startedAt = null;
    this.sessionKey = null;
    this.pendingConfirm = 0;
    this.lastError = why;
    this.emit(wasLive, prev, now);
  }

  /** يفحص كيك مرّة واحدة ويسجّل النتيجة. ما يرمي أبداً. */
  async pollOnce(): Promise<void> {
    if (this.polling) return this.polling;
    this.polling = this.doPoll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  private async doPoll(): Promise<void> {
    const now = Date.now();
    if (!this.opts.required) {
      this.live = true;
      this.reason = 'disabled';
      this.confirmedAt = now;
      return;
    }
    try {
      const payload = await this.opts.probe(this.opts.slug);
      this.pollsOk += 1;
      if (!payload) {
        this.applyEvaluation(
          {
            verdict: 'no-stream',
            reason: 'القناة ما لقيتها عند كيك',
            startedAt: null,
            sessionKey: null,
            viewerCount: null,
          },
          now,
        );
        return;
      }
      this.applyEvaluation(evaluateStream(payload, this.opts.channelId()), now);
    } catch (err) {
      this.pollsFailed += 1;
      this.lastError = err instanceof Error ? err.message : String(err);
      this.checkedAt = now;
      // ما نغيّر الحالة هنا: نترك allowsAward تقرر. لو انتهت صلاحية آخر نتيجة
      // موثوقة بتقفل البوابة لحالها عند maxStaleMs.
    }
  }

  /** يبدأ الفحص الدوري مع أول فحص فوري. */
  start(): void {
    if (this.timer) return;
    this.running = true;
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.opts.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * يطلق المستمعين ويسجّل الحالة — بس عند انتقال حقيقي في `live`.
   *
   * لازم `changed` يحمي المستمعين مو اللوق بس: الفحص كل 20 ثانية يفحص نفس
   * البث المفتوح hundreds مرة، وكل مرة نطلق فيها كان البوت يسوي إعلان
   * "البث انطلق" في كل مرة.
   */
  private emit(changed: boolean, prev: LiveSnapshot, now: number): void {
    if (!changed) return;
    const snap = this.snapshot();
    getLogger().info(
      {
        live: snap.live,
        reason: snap.reason,
        since: snap.startedAt,
        viewers: snap.viewerCount,
      },
      snap.live ? 'live gate OPEN — البث بدأ، النقاط تشتغل' : 'live gate CLOSED — البث خلص',
    );
    for (const fn of this.listeners) {
      try {
        fn(snap, prev);
      } catch (err) {
        getLogger().error({ err }, 'live-gate listener failed');
      }
    }
    void now;
  }
}