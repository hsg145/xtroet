/**
 * Pusher WebSocket chat source.
 *
 * Kick's own website chat runs on Pusher. Reading from it needs no webhook, no
 * tunnel and no public URL, which makes it the default ingestion path: the
 * bot works on a laptop with nothing exposed to the internet. Sending still
 * goes through the official POST /public/v1/chat.
 *
 * Everything Kick-specific and unofficial lives in ./pusher-constants.ts.
 * Frame parsing is exported separately and kept free of I/O so it can be
 * unit-tested without a socket.
 */
import WebSocket from 'ws';
import { z } from 'zod';
import { env } from '../config.js';
import { getLogger } from '../logger.js';
import { MessageDedupe } from './webhook.js';
import {
  CHATROOM_ID_HELP_AR,
  CHATROOM_ID_HELP_EN,
  KICK_WEB_HEADERS,
  PUSHER_ACTIVITY_TIMEOUT_MS,
  PUSHER_EVENT_CHAT_MESSAGE,
  PUSHER_EVENT_CONNECTION_ESTABLISHED,
  PUSHER_EVENT_ERROR,
  PUSHER_EVENT_PING,
  PUSHER_EVENT_PONG,
  PUSHER_EVENT_SUBSCRIPTION_SUCCEEDED,
  PUSHER_MESSAGE_TYPE,
  chatroomChannel,
  pusherWsUrl,
} from './pusher-constants.js';
import type { ChatSource } from '../core/source.js';
import type { KickBadge, NormalizedMessage } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Frame schemas
// ─────────────────────────────────────────────────────────────────────────────

/** One Pusher frame. `data` is always a JSON string on this protocol. */
export const pusherFrameSchema = z
  .object({
    event: z.string(),
    channel: z.string().optional(),
    data: z.union([z.string(), z.record(z.unknown()), z.unknown()]).optional(),
  })
  .passthrough();

export type PusherFrame = z.infer<typeof pusherFrameSchema>;

const badgeSchema = z
  .object({ type: z.string(), text: z.string().optional(), count: z.number().optional() })
  .passthrough();

const identitySchema = z
  .object({ color: z.string().optional(), badges: z.array(badgeSchema).optional() })
  .passthrough()
  .nullable()
  .optional();

const senderSchema = z
  .object({
    id: z.number().int(),
    username: z.string(),
    slug: z.string().optional(),
    identity: identitySchema,
  })
  .passthrough();

/**
 * Payload of App\Events\ChatMessageEvent, after the inner JSON.parse.
 * Undocumented by Kick; fields are validated loosely so a payload change
 * degrades to "ignored" instead of throwing.
 */
export const pusherChatMessageSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    chatroom_id: z.union([z.number(), z.string()]).optional(),
    content: z.string(),
    type: z.string().optional(),
    created_at: z.string().optional(),
    sender: senderSchema,
  })
  .passthrough();

export type PusherChatMessage = z.infer<typeof pusherChatMessageSchema>;

/** Parse a raw WebSocket payload into a frame, or null if unparseable. */
export function parseFrame(raw: unknown): PusherFrame | null {
  let text: string;
  if (typeof raw === 'string') text = raw;
  else if (raw instanceof Buffer) text = raw.toString('utf8');
  else if (Array.isArray(raw)) text = Buffer.concat(raw as Buffer[]).toString('utf8');
  else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString('utf8');
  else return null;

  try {
    const parsed = pusherFrameSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Pusher sends `data` as a JSON string on this connection. */
export function parseFrameData(frame: PusherFrame): Record<string, unknown> {
  const { data } = frame;
  if (typeof data === 'string') {
    try {
      const inner: unknown = JSON.parse(data);
      return typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  return {};
}

/**
 * Turn a ChatMessageEvent frame into a NormalizedMessage, or null when the
 * frame is not a normal chat message (pins, subs, errors, ...).
 */
export function normalizePusherChat(
  frame: PusherFrame,
  ctx: { broadcasterUserId: number; broadcasterSlug: string | null },
): NormalizedMessage | null {
  if (frame.event !== PUSHER_EVENT_CHAT_MESSAGE) return null;

  const inner = parseFrameData(frame);
  const parsed = pusherChatMessageSchema.safeParse(inner);
  if (!parsed.success) return null;
  const payload = parsed.data;

  // `type` other than "message" is not chat (e.g. system/announcement).
  // Absent `type` is treated as a message: older payloads omitted it.
  if (payload.type !== undefined && payload.type !== PUSHER_MESSAGE_TYPE) return null;

  const badges: KickBadge[] = payload.sender.identity?.badges ?? [];
  const types = new Set(badges.map((b) => b.type.toLowerCase()));

  const messageId = payload.id === undefined ? '' : String(payload.id);

  return {
    messageId,
    userId: payload.sender.id,
    username: payload.sender.username,
    content: payload.content,
    broadcasterUserId: ctx.broadcasterUserId,
    broadcasterSlug: payload.sender.slug ?? ctx.broadcasterSlug,
    createdAt: payload.created_at ? new Date(payload.created_at) : new Date(),
    badges,
    isModerator: types.has('moderator') || types.has('channel_moderator'),
    isSubscriber: types.has('subscriber'),
    isBroadcaster: types.has('broadcaster') || types.has('channel_owner'),
    isAnonymous: false,
  };
}

/** The subscribe frame for an anonymous chatroom channel. */
export function subscribeFrame(chatroomId: number): string {
  return JSON.stringify({
    event: 'pusher:subscribe',
    data: { auth: '', channel: chatroomChannel(chatroomId) },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Chatroom id resolution
// ─────────────────────────────────────────────────────────────────────────────

export class ChatroomIdError extends Error {
  constructor(slug: string, detail: string) {
    super(`${CHATROOM_ID_HELP_EN(slug)} (${detail})\n${CHATROOM_ID_HELP_AR(slug)}`);
    this.name = 'ChatroomIdError';
  }
}

let cachedChatroomId: number | undefined;

/** Network sources tried in order; every one is usually WAF-blocked. */
const CHATROOM_SOURCES = (slug: string): Array<{ name: string; url: string; parse: (text: string) => number | null }> => {
  const pickFromJson = (text: string): number | null => {
    const fromJson = /"chatroom"\s*:\s*\{\s*"id"\s*:\s*(\d+)/.exec(text);
    return fromJson ? Number(fromJson[1]) : null;
  };
  return [
    { name: 'api v2', url: `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, parse: pickFromJson },
    { name: 'api v1', url: `https://kick.com/api/v1/channels/${encodeURIComponent(slug)}`, parse: pickFromJson },
    { name: 'channel page', url: `https://kick.com/${encodeURIComponent(slug)}`, parse: pickFromJson },
  ];
};

/**
 * Resolve the chatroom id for the configured slug.
 *
 *  1. KICK_CHATROOM_ID from .env always wins (and is what works: Kick's WAF
 *     answers HTTP 403 "Request blocked by security policy" to server-side
 *     fetches, while a browser passes).
 *  2. Otherwise try every known source in order and take the first one that
 *     returns a chatroom id. A failure raises ChatroomIdError with manual
 *     instructions rather than crashing.
 *
 * Cached for the process lifetime.
 */
export async function resolveChatroomId(slug: string, configured?: number): Promise<number> {
  if (configured) {
    cachedChatroomId = configured;
    return configured;
  }
  if (cachedChatroomId) return cachedChatroomId;

  const failures: string[] = [];
  for (const source of CHATROOM_SOURCES(slug)) {
    let res: Response;
    try {
      res = await fetch(source.url, {
        headers: KICK_WEB_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      failures.push(`${source.name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!res.ok) {
      failures.push(`${source.name}: HTTP ${res.status}`);
      continue;
    }
    let id: number | null = null;
    try {
      id = source.parse(await res.text());
    } catch {
      failures.push(`${source.name}: unparseable response`);
      continue;
    }
    if (id && Number.isInteger(id) && id > 0) {
      cachedChatroomId = id;
      getLogger().info({ chatroomId: id, source: source.name }, 'chatroom resolved from the network');
      return id;
    }
    failures.push(`${source.name}: no chatroom id in the response`);
  }

  throw new ChatroomIdError(slug, failures.join(' · ') || 'no source attempted');
}

/** Test seam: forget the in-memory cache. */
export function __resetChatroomCache(): void {
  cachedChatroomId = undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The tiny slice of the `ws` WebSocket API this source actually uses.
 * Narrowing it keeps the test seam honest: a fake only has to implement these.
 */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  terminate(): void;
  on(event: 'open', cb: () => void): unknown;
  on(event: 'message', cb: (raw: unknown) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  on(event: 'close', cb: (code: number, reason: Buffer) => void): unknown;
}

export interface PusherChatSourceDeps {
  broadcasterUserId: () => number;
  broadcasterSlug?: () => string | null;
  chatroomId: () => number;
  /** Shared with the webhook path so running both sources cannot double count. */
  dedupe?: MessageDedupe;
  /** Overridable for tests. */
  createSocket?: (url: string) => SocketLike;
  watchdogMs?: number;
  backoffMaxMs?: number;
}

// ws exposes its states as static constants; this is WebSocket.OPEN.
const WS_OPEN = 1;

export type PusherState = 'idle' | 'connecting' | 'connected' | 'subscribed' | 'closed';

export interface PusherStats {
  connected: boolean;
  subscribed: boolean;
  chatroomId: number | null;
  lastMessageAt: Date | null;
  reconnects: number;
  state: PusherState;
  /** Latest pusher:error frame, if any. A subscribe rejection here almost always
   * means the chatroom id is wrong or stale — use a new KICK_CHATROOM_ID. */
  lastPusherError: string | null;
}

export class PusherChatSource implements ChatSource {
  private deps: PusherChatSourceDeps;
  private dedupe: MessageDedupe;
  private ws?: SocketLike;
  private cb?: (msg: NormalizedMessage) => void;
  private stopped = false;
  private attempt = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private watchdogTimer?: NodeJS.Timeout;
  private lastFrameAt = 0;
private state: PusherState = 'idle';
  private subscribed = false;
  private lastMessageAt: Date | null = null;
  private reconnects = 0;
  private lastPusherError: string | null = null;

  constructor(deps: PusherChatSourceDeps) {
    this.deps = deps;
    this.dedupe = deps.dedupe ?? new MessageDedupe();
  }

  onMessage(cb: (msg: NormalizedMessage) => void): void {
    this.cb = cb;
  }

stats(chatroomId: number | null = null): PusherStats {
    return {
      connected: this.ws?.readyState === WS_OPEN,
      subscribed: this.subscribed,
      chatroomId,
      lastMessageAt: this.lastMessageAt,
      reconnects: this.reconnects,
      state: this.state,
      lastPusherError: this.lastPusherError,
    };
  }

  private log() {
    return getLogger();
  }

  private setState(state: PusherState, detail?: Record<string, unknown>): void {
    if (this.state === state && !detail) return;
    this.state = state;
    this.log().info({ state, ...detail }, 'pusher chat source');
  }

  /** Exponential backoff 1s → max, with jitter. */
  backoffMs(): number {
    const max = this.deps.backoffMaxMs ?? env().PUSHER_BACKOFF_MAX_MS;
    const base = Math.min(max, 1000 * 2 ** this.attempt);
    return Math.round(base * (0.7 + Math.random() * 0.6));
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    const log = this.log();
    const url = pusherWsUrl();
    this.setState('connecting', { attempt: this.attempt });

    let socket: SocketLike;
    try {
      socket = this.deps.createSocket
        ? this.deps.createSocket(url)
        : new WebSocket(url);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'pusher socket could not be created');
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;
    this.lastFrameAt = Date.now();

    socket.on('open', () => {
      this.attempt = 0;
      this.setState('connected');
      this.armWatchdog();
    });

    socket.on('message', (raw: unknown) => this.onRawFrame(raw));

    socket.on('error', (err: Error) => {
      log.warn({ err: err.message }, 'pusher socket error');
    });

    socket.on('close', (code: number, reason: Buffer) => {
      this.subscribed = false;
      this.clearWatchdog();
      this.setState('closed', { code, reason: reason?.toString() || '' });
      this.scheduleReconnect();
    });
  }

  private onRawFrame(raw: unknown): void {
    this.lastFrameAt = Date.now();
    const frame = parseFrame(raw);
    if (!frame) return;

    switch (frame.event) {
      case PUSHER_EVENT_CONNECTION_ESTABLISHED: {
        const inner = parseFrameData(frame);
        const timeoutMs = Number(inner.activity_timeout ?? PUSHER_ACTIVITY_TIMEOUT_MS);
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
          this.armWatchdog(Math.min(timeoutMs * 1000 * 2, 600_000));
        }
        this.send(subscribeFrame(this.deps.chatroomId()));
        return;
      }

      case PUSHER_EVENT_SUBSCRIPTION_SUCCEEDED: {
        this.subscribed = true;
        this.setState('subscribed', { channel: frame.channel });
        return;
      }

      case PUSHER_EVENT_PING: {
        this.send(JSON.stringify({ event: PUSHER_EVENT_PONG, data: {} }));
        return;
      }

      case PUSHER_EVENT_PONG:
        return;

case PUSHER_EVENT_ERROR: {
        const detail = JSON.stringify(parseFrameData(frame)).slice(0, 200);
        this.lastPusherError = detail;
        this.log().error(
          { data: parseFrameData(frame) },
          'pusher returned an error frame — a subscribe rejection usually means the chatroom id is wrong; set a fresh KICK_CHATROOM_ID',
        );
        return;
      }

      default:
        break;
    }

    if (!frame.event.includes('Events')) return;

    const msg = normalizePusherChat(frame, {
      broadcasterUserId: this.deps.broadcasterUserId(),
      broadcasterSlug: this.deps.broadcasterSlug?.() ?? null,
    });
    if (!msg) return;

    if (!msg.messageId) {
      this.log().debug({ user: msg.username }, 'pusher chat message had no id, ignored');
      return;
    }
    if (!this.dedupe.admit(msg.messageId)) {
      this.log().debug({ messageId: msg.messageId }, 'pusher duplicate ignored');
      return;
    }

    this.lastMessageAt = new Date();
    this.log().debug({ user: msg.username, messageId: msg.messageId }, 'pusher chat message');
    this.cb?.(msg);
  }

  private send(payload: string): void {
    try {
      if (this.ws && this.ws.readyState === WS_OPEN) this.ws.send(payload);
    } catch (err) {
      this.log().warn({ err: err instanceof Error ? err.message : String(err) }, 'pusher send failed');
    }
  }

  private armWatchdog(overrideMs?: number): void {
    this.clearWatchdog();
    const ms =
      overrideMs ??
      this.deps.watchdogMs ??
      env().PUSHER_WATCHDOG_SECONDS * 1000;
    this.watchdogTimer = setInterval(() => {
      // Not even a ping arrived: the socket is a zombie, force a reconnect.
      if (Date.now() - this.lastFrameAt > ms) {
        this.log().warn({ idleMs: Date.now() - this.lastFrameAt }, 'pusher watchdog fired, reconnecting');
        this.forceReconnect();
      }
    }, Math.max(1000, Math.floor(ms / 4)));
    this.watchdogTimer.unref();
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = undefined;
  }

  private forceReconnect(): void {
    this.attempt += 1;
    try {
      this.ws?.terminate();
    } catch {
      /* already gone; close handler will schedule the retry */
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) return;
    const delay = this.backoffMs();
    this.reconnects += 1;
    this.log().info({ delayMs: delay, attempt: this.attempt }, 'pusher reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearWatchdog();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.subscribed = false;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = undefined;
    this.setState('idle');
  }

  lastEventAt(): Date | null {
    return this.lastMessageAt;
  }
}