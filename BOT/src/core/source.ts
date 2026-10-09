import type { NormalizedMessage } from '../kick/types.js';

/**
 * A source of chat messages (webhook today, Pusher WebSocket tomorrow).
 * Everything downstream only talks to this interface.
 */
export interface ChatSource {
  /** Begin delivering messages to the registered callback. */
  start(): Promise<void> | void;
  /** Stop delivering messages. */
  stop(): Promise<void> | void;
  /** Register the message handler. Call before start(). */
  onMessage(cb: (msg: NormalizedMessage) => void): void;
  /** Milliseconds since the last delivered event, or null when none yet. */
  lastEventAt(): Date | null;
}

/**
 * ─────────────────────────────────────────────────────────────
 *  EXTENSION POINT — Pusher WebSocket source (NOT implemented)
 * ─────────────────────────────────────────────────────────────
 * Kick's official webhooks are the supported path and are used in production.
 * A community "Pusher" socket also carries chat events but is unofficial and
 * needs no public URL. To add it later:
 *
 *   1. npm i pusher-js
 *   2. Create PusherChatSource implements ChatSource in this folder:
 *        - start(): connect to the channel's Pusher channel/auth endpoint
 *        - onMessage(cb): map App\\Events\\ChatMessageSent to NormalizedMessage
 *        - stop(): disconnect
 *   3. In src/index.ts pick the source with an env flag:
 *        const source: ChatSource = process.env.CHAT_SOURCE === 'pusher'
 *          ? new PusherChatSource()
 *          : new WebhookChatSource(app);
 *
 * The router, points engine, flusher and sender need no changes.
 * ─────────────────────────────────────────────────────────────
 */
export type ChatSourceKind = 'webhook' | 'pusher';