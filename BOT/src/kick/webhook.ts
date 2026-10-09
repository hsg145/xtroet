import express, { Router, type Request, type Response } from 'express';
import { getLogger } from '../logger.js';
import { publicKeyCache, SignatureError, verifySignature } from './signature.js';
import { EVENT_CHAT_MESSAGE_SENT, chatMessageSentSchema, normalizeChatMessage, type NormalizedMessage } from './types.js';

const MAX_BODY_BYTES = 100 * 1024;

/** LRU-ish dedupe on Kick-Event-Message-Id (Kick may deliver duplicates). */
export class MessageDedupe {
  private seen = new Map<string, number>();
  private max: number;
  private ttlMs: number;

  constructor(max = 10_000, ttlMs = 10 * 60 * 1000) {
    this.max = max;
    this.ttlMs = ttlMs;
  }

  /** true when this id is new. Marks it as seen. */
  admit(id: string, now = Date.now()): boolean {
    const prev = this.seen.get(id);
    if (prev !== undefined && now - prev < this.ttlMs) return false;

    this.seen.delete(id);
    this.seen.set(id, now);

    if (this.seen.size > this.max) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

export interface WebhookDeps {
  onMessage: (msg: NormalizedMessage) => void;
  /** Broadcaster user id this bot serves; other channels are ignored. */
  broadcasterUserId: () => number | null;
  dedupe?: MessageDedupe;
  /** Called for every hit, before verification, so diagnostics can expose it. */
  onHit?: (info: { at: Date; eventType?: string; signed: boolean; bytes: number }) => void;
  onReject?: (info: { at: Date; reason: string }) => void;
  onAccepted?: (at: Date) => void;
}

/**
 * POST /webhooks/kick
 *
 * IMPORTANT: the body is read as a raw Buffer so the signature can be checked
 * against the exact bytes Kick sent. Verifying JSON.stringify(req.body) breaks
 * the signature, and a webhook that keeps failing gets auto-unsubscribed.
 *
 * Responds 200 fast, then processes. Bad signature -> 401.
 */
export function createWebhookRouter(deps: WebhookDeps): Router {
  const router = Router();
  const dedupe = deps.dedupe ?? new MessageDedupe();
  const log = getLogger();

  router.post(
    '/webhooks/kick',
    express.raw({ type: '*/*', limit: MAX_BODY_BYTES }),
    async (req: Request, res: Response) => {
      const raw = req.body as Buffer;
      if (!Buffer.isBuffer(raw)) {
        res.status(400).json({ ok: false, error: 'raw body required' });
        return;
      }

      const messageId = header(req, 'kick-event-message-id');
      const timestamp = header(req, 'kick-event-message-timestamp');
      const signature = header(req, 'kick-event-signature');
      const eventType = header(req, 'kick-event-type');
      const subscriptionId = header(req, 'kick-event-subscription-id');
      const version = header(req, 'kick-event-version');

      // Log EVERY hit before verifying. Kick delivers only to the URL saved in
      // the app dashboard, so "no hit logged at all" means the tunnel URL is
      // wrong/stale — a completely different problem from a rejected
      // signature. The body is never logged.
      const bytes = raw.length;
      const signed = Boolean(messageId && timestamp && signature);
      deps.onHit?.({ at: new Date(), eventType, signed, bytes });
      log.info({ eventType: eventType ?? '(none)', signed, bytes }, 'webhook hit');

      if (!messageId || !timestamp || !signature || !eventType) {
        const reason = 'missing Kick signature headers';
        deps.onReject?.({ at: new Date(), reason });
        res.status(401).json({ ok: false, error: reason });
        return;
      }

      try {
        const key = await publicKeyCache.get();
        verifySignature(key, raw, { messageId, timestamp, signature, eventType, subscriptionId, version });
      } catch (err) {
        const reason = err instanceof SignatureError ? err.message : 'verification failed';
        deps.onReject?.({ at: new Date(), reason });
        log.warn({ reason, eventType }, 'rejected webhook request');
        res.status(401).json({ ok: false, error: 'invalid signature' });
        return;
      }

      deps.onAccepted?.(new Date());

      if (!dedupe.admit(messageId)) {
        log.debug({ messageId }, 'duplicate webhook delivery ignored');
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }

      if (eventType !== EVENT_CHAT_MESSAGE_SENT) {
        res.status(200).json({ ok: true, ignored: eventType });
        return;
      }

      // Ack immediately; the work happens after the response.
      res.status(200).json({ ok: true });

      void (async () => {
        try {
          const parsed = chatMessageSentSchema.safeParse(JSON.parse(raw.toString('utf8')));
          if (!parsed.success) {
            log.warn({ issues: parsed.error.issues.slice(0, 3) }, 'invalid chat.message.sent payload');
            return;
          }
          const msg = normalizeChatMessage(parsed.data);
          const target = deps.broadcasterUserId();
          if (target !== null && msg.broadcasterUserId !== target) {
            log.debug({ channel: msg.broadcasterUserId, target }, 'event for another channel, ignored');
            return;
          }
          deps.onMessage(msg);
        } catch (err) {
          log.error({ err, messageId }, 'webhook handler threw (caught)');
        }
      })();
    },
  );

  return router;
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}