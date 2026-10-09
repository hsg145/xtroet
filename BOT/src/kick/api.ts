import { env } from '../config.js';
import { getLogger } from '../logger.js';
import { tokenManager } from './oauth.js';
import {
  EVENT_CHAT_MESSAGE_SENT,
  EVENT_CHAT_MESSAGE_SENT_VERSION,
  kickChannelsSchema,
  kickSubscriptionsSchema,
} from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface KickChannel {
  broadcasterUserId: number;
  slug: string;
}

export class KickApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Kick API ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string; query?: Record<string, string | number> } = {},
): Promise<T> {
  const e = env();
  const url = new URL(`${e.KICK_API_BASE.replace(/\/$/, '')}${path}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, String(v));
  }

  const { token, query: _query, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('accept', 'application/json');
  if (rest.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...rest, headers });

  if (res.status === 401) {
    // Refresh once, then replay.
    const fresh = await tokenManager.forceRefresh().catch(() => null);
    if (fresh) {
      headers.set('authorization', `Bearer ${fresh}`);
      const retry = await fetch(url, { ...rest, headers });
      return readBody<T>(retry);
    }
  }

  return readBody<T>(res);
}

async function readBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new KickApiError(res.status, text);
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** GET /public/v1/channels?slug=... */
export async function getChannelBySlug(slug: string, token: string): Promise<KickChannel | null> {
  const raw = await request<unknown>('/public/v1/channels', { token, query: { slug } });
  const parsed = kickChannelsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const channel = parsed.data.data?.find((c) => c.slug.toLowerCase() === slug.toLowerCase());
  if (!channel) return null;
  return { broadcasterUserId: channel.broadcaster_user_id, slug: channel.slug };
}

/** GET /public/v1/channels (no params) -> the channel of the authorized account. */
export async function getOwnChannel(token: string): Promise<KickChannel | null> {
  const raw = await request<unknown>('/public/v1/channels', { token });
  const parsed = kickChannelsSchema.safeParse(raw);
  const channel = parsed.success ? parsed.data.data?.[0] : undefined;
  if (!channel) return null;
  return { broadcasterUserId: channel.broadcaster_user_id, slug: channel.slug };
}

export interface ChatSendOptions {
  replyToMessageId?: string;
  /** User access token -> broadcaster_user_id required. Bot token ignores it. */
  broadcasterUserId?: number;
  signal?: AbortSignal;
}

/**
 * POST /public/v1/chat with chat:write.
 * `content` max 500 user-perceived chars and max 2048 UTF-8 bytes.
 *
 * `type: "bot"` posts under the app's own bot identity — that is what makes the
 * messages look like they come from a bot rather than from the broadcaster's
 * personal account. Kick only accepts it when the app actually has a bot
 * attached to the channel; otherwise the endpoint answers 404 Not Found.
 *
 * So the configured type is attempted first, and a bot that is not installed
 * falls back to the broadcaster rather than silently posting nothing. Which one
 * actually worked is reported back so callers can log it once instead of
 * guessing.
 */
export interface ChatSendResult {
  is_sent: boolean;
  message_id: string;
  /** How the message actually went out: "bot", or "user" after a fallback. */
  via?: 'bot' | 'user';
}

export async function sendChatMessage(
  content: string,
  token: string,
  options: ChatSendOptions = {},
): Promise<ChatSendResult> {
  const e = env();

  const post = async (type: 'user' | 'bot'): Promise<ChatSendResult> => {
    const payload: Record<string, unknown> = { content, type };
    // Only a user post needs a target channel; for a bot Kick ignores it.
    if (type === 'user' && options.broadcasterUserId) {
      payload.broadcaster_user_id = options.broadcasterUserId;
    }
    if (options.replyToMessageId) payload.reply_to_message_id = options.replyToMessageId;

    const res = await request<{ data?: ChatSendResult }>('/public/v1/chat', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    return res.data ?? { is_sent: false, message_id: '' };
  };

  if (e.KICK_SENDER_TYPE === 'user') {
    return { ...(await post('user')), via: 'user' };
  }

  try {
    return { ...(await post('bot')), via: 'bot' };
  } catch (err) {
    // 404 is Kick saying "this app has no bot on this channel". Anything else
    // (rate limit, outage) should surface instead of double-posting.
    const status = err instanceof KickApiError ? err.status : 0;
    if (status !== 404) throw err;
    getLogger().warn(
      { status },
      'bot posting unavailable on this channel — falling back to the broadcaster account',
    );
    return { ...(await post('user')), via: 'user' };
  }
}

export interface EventSubscription {
  id: string;
  event: string;
  version?: number;
  broadcaster_user_id?: number;
  method?: string;
}

/** GET /public/v1/events/subscriptions (user or app token). */
export async function listSubscriptions(token: string, broadcasterUserId?: number): Promise<EventSubscription[]> {
  const raw = await request<unknown>('/public/v1/events/subscriptions', {
    token,
    query: broadcasterUserId ? { broadcaster_user_id: broadcasterUserId } : {},
  });
  const parsed = kickSubscriptionsSchema.safeParse(raw);
  return (parsed.success ? parsed.data.data : undefined) ?? [];
}

/** POST /public/v1/events/subscriptions  { broadcaster_user_id, events, method } */
export async function createSubscription(
  token: string,
  broadcasterUserId: number,
  events: Array<{ name: string; version: number }>,
): Promise<Array<{ name: string; version: number; subscription_id?: string; error?: string }>> {
  const res = await request<{ data?: Array<{ name: string; version: number; subscription_id?: string; error?: string }> }>(
    '/public/v1/events/subscriptions',
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        broadcaster_user_id: broadcasterUserId,
        events,
        method: 'webhook',
      }),
    },
  );
  return res.data ?? [];
}

/** DELETE /public/v1/events/subscriptions?id=... (204 No Content) */
export async function deleteSubscription(token: string, id: string): Promise<void> {
  const e = env();
  const url = new URL(`${e.KICK_API_BASE.replace(/\/$/, '')}/public/v1/events/subscriptions`);
  url.searchParams.set('id', id);

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok && res.status !== 204) {
    throw new KickApiError(res.status, await res.text());
  }
}

export async function subscribeChatMessages(
  token: string,
  broadcasterUserId: number,
): Promise<Array<{ name: string; version: number; subscription_id?: string; error?: string }>> {
  return createSubscription(token, broadcasterUserId, [
    { name: EVENT_CHAT_MESSAGE_SENT, version: EVENT_CHAT_MESSAGE_SENT_VERSION },
  ]);
}

export interface EnsureResult {
  ok: boolean;
  action: 'already-subscribed' | 'created' | 'failed';
  detail?: string;
}

/**
 * Reconciler: list subscriptions for the broadcaster, and create
 * chat.message.sent v1 when it is missing. Kick auto-unsubscribes apps whose
 * webhook keeps failing, so this runs at boot and on a timer.
 */
export async function reconcileSubscription(token: string, broadcasterUserId: number): Promise<EnsureResult> {
  try {
    const subs = await listSubscriptions(token, broadcasterUserId);
    const found = subs.find(
      (s) => s.event === EVENT_CHAT_MESSAGE_SENT && (s.version ?? 1) === EVENT_CHAT_MESSAGE_SENT_VERSION,
    );
    if (found) {
      getLogger().info({ subscriptionId: found.id, event: found.event }, 'chat.message.sent already subscribed');
      return { ok: true, action: 'already-subscribed' };
    }

    const created = await subscribeChatMessages(token, broadcasterUserId);
    const errored = created.find((c) => c.error);
    if (errored) {
      getLogger().error({ err: errored.error }, 'subscription creation failed');
      return { ok: false, action: 'failed', detail: errored.error };
    }
    getLogger().info({ subscriptionId: created[0]?.subscription_id }, 'chat.message.sent subscription created');
    return { ok: true, action: 'created' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    getLogger().error({ err }, 'subscription reconcile failed');
    return { ok: false, action: 'failed', detail: message };
  }
}

/** Backoff used by the sender on 429/5xx. */
export async function backoffDelay(attempt: number): Promise<void> {
  await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400));
}