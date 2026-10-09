import { getLogger } from '../logger.js';
import { sendChatMessage, KickApiError, backoffDelay } from '../kick/api.js';
import { tokenManager } from '../kick/oauth.js';
import { toSingleLine, MAX_CHAT_LENGTH } from '../messages.js';

export type Priority = 'high' | 'low';

export interface OutgoingMessage {
  text: string;
  priority: Priority;
  replyToMessageId?: string;
}

interface QueueItem extends OutgoingMessage {
  seq: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Trim to Kick's limits: <=500 graphemes and <=2048 UTF-8 bytes. */
export function fitToKickLimits(text: string): string {
  let out = toSingleLine(text, MAX_CHAT_LENGTH);
  while (Buffer.byteLength(out, 'utf8') > 2048 && out.length > 0) {
    out = [...out].slice(0, -1).join('');
  }
  return out;
}

/**
 * Single outgoing queue: one message every ~1.2 s, exponential backoff on
 * 429/5xx, oldest low-priority messages dropped when over capacity.
 * Everything the bot says goes through here.
 */
export class ChatSender {
  private queue: QueueItem[] = [];
  private seq = 0;
  private running = false;
  private intervalMs: number;
  private maxSize: number;
  private broadcasterUserId: number;
  private dropped = 0;
  private sent = 0;
  private failed = 0;

  /**
   * Message ids of what we just posted, newest last.
   *
   * Kick delivers our own messages back on the same chat feed, and with
   * `sender_type: bot` they arrive carrying the BROADCASTER's user id — so an
   * id check cannot tell them apart, and excluding that id also excluded the
   * channel owner's real messages. Matching the exact ids we were handed back
   * by the send API identifies our own output precisely, with no false
   * positives and no need to guess a bot user id.
   */
  private ownIds: string[] = [];

  isOwnMessage(messageId: string): boolean {
    return messageId !== '' && this.ownIds.includes(messageId);
  }

  private rememberOwn(messageId: string): void {
    if (!messageId) return;
    this.ownIds.push(messageId);
    // Only recent ids matter: the echo arrives within seconds.
    if (this.ownIds.length > 200) this.ownIds.splice(0, this.ownIds.length - 200);
  }

  constructor(opts: { broadcasterUserId: number; intervalMs?: number; maxSize?: number }) {
    this.broadcasterUserId = opts.broadcasterUserId;
    this.intervalMs = opts.intervalMs ?? 1200;
    this.maxSize = opts.maxSize ?? 50;
  }

  get length(): number {
    return this.queue.length;
  }

  get stats(): { sent: number; failed: number; dropped: number } {
    return { sent: this.sent, failed: this.failed, dropped: this.dropped };
  }

  /** Enqueue one single-line message. Never throws. */
  send(text: string, priority: Priority = 'low', replyToMessageId?: string): void {
    if (!text) return;
    const item: QueueItem = { text: fitToKickLimits(text), priority, seq: this.seq++, replyToMessageId };
    if (item.text) this.push(item);
  }

  /** Enqueue several messages in order (e.g. the ranks list). */
  sendAll(texts: string[], priority: Priority = 'low'): void {
    for (const t of texts) this.send(t, priority);
  }

  private push(item: QueueItem): void {
    this.queue.push(item);
    if (this.queue.length > this.maxSize) {
      // Drop the oldest low-priority item first; never drop high-priority.
      const idx = this.queue.findIndex((q) => q.priority === 'low');
      if (idx >= 0) this.queue.splice(idx, 1);
      else this.queue.shift();
      this.dropped += 1;
      getLogger().warn({ droppedTotal: this.dropped }, 'outgoing queue overflow, dropped a message');
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        const ok = await this.deliver(item);
        if (!ok) {
          this.failed += 1;
          // High-priority failures are re-queued once at the front.
          if (item.priority === 'high') this.queue.unshift(item);
        } else {
          this.sent += 1;
        }
        if (this.queue.length > 0) await sleep(this.intervalMs);
      }
    } finally {
      this.running = false;
    }
  }

  private async deliver(item: QueueItem): Promise<boolean> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const token = await tokenManager.accessToken();
        const res = await sendChatMessage(item.text, token, {
          broadcasterUserId: this.broadcasterUserId,
          replyToMessageId: item.replyToMessageId,
        });
        this.rememberOwn(res.message_id);
        getLogger().debug({ chars: item.text.length }, 'chat message sent');
        return true;
      } catch (err) {
        const status = err instanceof KickApiError ? err.status : 0;
        const retryable = status === 429 || status >= 500 || status === 0;
        getLogger().warn({ attempt, status, err: err instanceof Error ? err.message : String(err) }, 'send failed');
        if (!retryable || attempt === 3) return false;
        await backoffDelay(attempt);
      }
    }
    return false;
  }

  /** Wait for the queue to drain (used on shutdown). */
  async drainAll(timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ((this.running || this.queue.length > 0) && Date.now() < deadline) {
      await sleep(100);
    }
  }
}