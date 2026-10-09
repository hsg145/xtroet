import { getLogger } from '../logger.js';
import { reconcileSubscription, type EnsureResult } from './api.js';
import { tokenManager } from './oauth.js';

export type SubscriptionState = 'unknown' | 'subscribed' | 'failed';

/**
 * Reconciler: list subscriptions for the broadcaster, and create
 * chat.message.sent v1 when it is missing. Kick auto-unsubscribes apps whose
 * webhook keeps failing, so this runs at boot and on a timer.
 *
 * NOTE: finding a subscription proves only that Kick *recorded* one. It says
 * nothing about delivery — if the dashboard URL is wrong, Kick happily keeps
 * listing a subscription that will never fire. `delivering()` is therefore
 * only true once a real signed event was accepted.
 */
export class SubscriptionReconciler {
  private timer?: NodeJS.Timeout;
  private channelId = 0;
  private intervalMs: number;
  private state: SubscriptionState = 'unknown';
  private lastDetail: string | null = null;
  private lastCheckAt: Date | null = null;
  private sawEvent = false;

  constructor(channelId: number, intervalMs: number) {
    this.channelId = channelId;
    this.intervalMs = intervalMs;
  }

  get ok(): boolean {
    return this.state === 'subscribed';
  }

  /** True only after a signed webhook event was actually accepted. */
  delivering(): boolean {
    return this.sawEvent;
  }

  markEventReceived(): void {
    this.sawEvent = true;
  }

  get detail(): string | null {
    return this.lastDetail;
  }

  get lastCheck(): Date | null {
    return this.lastCheckAt;
  }

  async check(): Promise<EnsureResult> {
    let token: string;
    try {
      token = await tokenManager.accessToken();
    } catch (err) {
      this.state = 'failed';
      this.lastDetail = err instanceof Error ? err.message : String(err);
      this.lastCheckAt = new Date();
      return { ok: false, action: 'failed', detail: this.lastDetail };
    }

    const result = await reconcileSubscription(token, this.channelId);
    this.state = result.ok ? 'subscribed' : 'failed';
    this.lastDetail = result.detail ?? null;
    this.lastCheckAt = new Date();
    return result;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Warn (without alarming) when nothing has arrived for a while. */
export class IdleWatcher {
  private timer?: ReturnType<typeof setInterval>;
  private lastEventAt: Date | null;
  private warnAfterSec: number;
  private warned = false;

  constructor(warnAfterSec: number) {
    this.warnAfterSec = warnAfterSec;
    this.lastEventAt = null;
  }

  mark(): void {
    this.lastEventAt = new Date();
    this.warned = false;
  }

  get last(): Date | null {
    return this.lastEventAt;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      if (!this.lastEventAt) return;
      const idleSec = Math.floor((Date.now() - this.lastEventAt.getTime()) / 1000);
      if (idleSec >= this.warnAfterSec && !this.warned) {
        this.warned = true;
        getLogger().warn(
          { idleSec },
          'no Kick events received recently -- this may simply mean the chat is quiet, but also check the webhook URL and subscription in the Kick developer dashboard',
        );
      }
    }, 60_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}