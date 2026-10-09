import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import {
  parseFrame,
  parseFrameData,
  normalizePusherChat,
  subscribeFrame,
  PusherChatSource,
  resolveChatroomId,
  ChatroomIdError,
  __resetChatroomCache,
} from '../src/kick/pusher.js';
import {
  PUSHER_EVENT_CHAT_MESSAGE,
  chatroomChannel,
  pusherWsUrl,
  PUSHER_APP_KEY,
  PUSHER_HOST,
} from '../src/kick/pusher-constants.js';
import { MessageDedupe } from '../src/kick/webhook.js';
import { clockSkewMs } from '../src/kick/signature.js';

const BROADCASTER = 39763938;

/** Build the real double-encoded Pusher frame Kick sends. */
function chatFrame(inner: Record<string, unknown>): string {
  return JSON.stringify({
    event: PUSHER_EVENT_CHAT_MESSAGE,
    channel: chatroomChannel(999),
    data: JSON.stringify(inner),
  });
}

const VALID_CHAT = {
  id: 'msg-1',
  chatroom_id: 999,
  content: 'مرحبا',
  type: 'message',
  created_at: '2026-10-07T12:00:00.000Z',
  sender: {
    id: 111,
    username: 'alice',
    slug: 'alice',
    identity: {
      color: '#fff',
      badges: [
        { type: 'moderator', text: 'MOD' },
        { type: 'subscriber', text: 'SUB' },
        { type: 'broadcaster', text: 'OWNER' },
      ],
    },
  },
};

describe('pusher constants (verified live on 2026-10-07)', () => {
  it('builds the documented URL shape', () => {
    const url = pusherWsUrl();
    expect(PUSHER_HOST).toBe('ws-us2.pusher.com');
    expect(PUSHER_APP_KEY).toBe('32cbd69e4b950bf97679');
    expect(url).toContain(`wss://ws-us2.pusher.com/app/${PUSHER_APP_KEY}`);
    expect(url).toContain('protocol=7');
    expect(url).toContain('flash=false');
  });

  it('uses the .v2 chatroom channel shape', () => {
    expect(chatroomChannel(12345)).toBe('chatrooms.12345.v2');
  });
});

describe('parseFrame', () => {
  it('parses connection_established with a JSON-string data', () => {
    const frame = parseFrame(
      JSON.stringify({
        event: 'pusher:connection_established',
        data: '{"socket_id":"123.456","activity_timeout":120}',
      }),
    );
    expect(frame?.event).toBe('pusher:connection_established');
    expect(parseFrameData(frame!)).toEqual({ socket_id: '123.456', activity_timeout: 120 });
  });

  it('parses subscription_succeeded', () => {
    const frame = parseFrame(
      JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: 'chatrooms.1.v2', data: '{}' }),
    );
    expect(frame?.event).toBe('pusher_internal:subscription_succeeded');
  });

  it('parses a ping frame', () => {
    expect(parseFrame(JSON.stringify({ event: 'pusher:ping', data: '{}' }))?.event).toBe('pusher:ping');
  });

  it('returns null for garbage instead of throwing', () => {
    expect(parseFrame('not json at all')).toBeNull();
    expect(parseFrame(undefined)).toBeNull();
    expect(parseFrame(12345)).toBeNull();
  });

  it('accepts Buffer payloads', () => {
    const frame = parseFrame(Buffer.from(JSON.stringify({ event: 'pusher:pong', data: '{}' })));
    expect(frame?.event).toBe('pusher:pong');
  });

  it('handles data already being an object', () => {
    const frame = parseFrame(JSON.stringify({ event: 'x', data: { a: 1 } }));
    expect(parseFrameData(frame!)).toEqual({ a: 1 });
  });
});

describe('normalizePusherChat', () => {
  it('normalizes a real-looking ChatMessageEvent', () => {
    const frame = parseFrame(chatFrame(VALID_CHAT))!;
    const msg = normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: 'hsg2' });
    expect(msg).not.toBeNull();
    expect(msg!.messageId).toBe('msg-1');
    expect(msg!.userId).toBe(111);
    expect(msg!.username).toBe('alice');
    expect(msg!.content).toBe('مرحبا');
    expect(msg!.broadcasterUserId).toBe(BROADCASTER);
    expect(msg!.isModerator).toBe(true);
    expect(msg!.isSubscriber).toBe(true);
    expect(msg!.isBroadcaster).toBe(true);
    expect(msg!.createdAt.toISOString()).toBe('2026-10-07T12:00:00.000Z');
  });

  it('ignores non-chat events', () => {
    const frame = parseFrame(JSON.stringify({ event: 'App\\Events\\FollowEvent', data: '{}' }))!;
    expect(normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null })).toBeNull();
  });

  it('ignores a non-message type', () => {
    const frame = parseFrame(chatFrame({ ...VALID_CHAT, type: 'system' }))!;
    expect(normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null })).toBeNull();
  });

  it('accepts an emote-only message (content is just an emote name)', () => {
    const frame = parseFrame(chatFrame({ ...VALID_CHAT, id: 'msg-emote', content: 'KEKW' }))!;
    const msg = normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null });
    expect(msg?.content).toBe('KEKW');
  });

  it('treats a missing type as a message', () => {
    const { type, ...noType } = VALID_CHAT;
    void type;
    const frame = parseFrame(chatFrame(noType))!;
    expect(normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null })).not.toBeNull();
  });

  it('treats a reply as a normal message', () => {
    const frame = parseFrame(
      chatFrame({ ...VALID_CHAT, id: 'msg-reply', metadata: { reply_to: 'msg-1' } }),
    )!;
    expect(normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null })).not.toBeNull();
  });

  it('returns null when the payload is unparseable', () => {
    const frame = parseFrame(JSON.stringify({ event: PUSHER_EVENT_CHAT_MESSAGE, data: '{"no":"sender"}' }))!;
    expect(normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null })).toBeNull();
  });

  it('tolerates a null identity', () => {
    const frame = parseFrame(chatFrame({ ...VALID_CHAT, sender: { ...VALID_CHAT.sender, identity: null } }))!;
    const msg = normalizePusherChat(frame, { broadcasterUserId: BROADCASTER, broadcasterSlug: null });
    expect(msg?.isModerator).toBe(false);
    expect(msg?.badges).toEqual([]);
  });
});

describe('subscribeFrame', () => {
  it('subscribes anonymously to the .v2 channel', () => {
    const parsed = JSON.parse(subscribeFrame(555));
    expect(parsed).toEqual({
      event: 'pusher:subscribe',
      data: { auth: '', channel: 'chatrooms.555.v2' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fake socket
// ─────────────────────────────────────────────────────────────────────────────

class FakeSocket extends EventEmitter {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  readyState = 0;

  constructor(public url: string) {
    super();
    FakeSocket.instances.push(this);
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit('open');
  }
  deliver(raw: string): void {
    this.emit('message', Buffer.from(raw));
  }
  send(payload: string): void {
    this.sent.push(payload);
  }
  close(): void {
    this.readyState = 3;
    this.emit('close', 1000, Buffer.from(''));
  }
  terminate(): void {
    this.readyState = 3;
    this.emit('close', 1006, Buffer.from('terminated'));
  }
}

function makeSource(overrides: Partial<ConstructorParameters<typeof PusherChatSource>[0]> = {}) {
  const got: string[] = [];
  const dedupe = new MessageDedupe();
  const source = new PusherChatSource({
    broadcasterUserId: () => BROADCASTER,
    chatroomId: () => 999,
    dedupe,
    createSocket: (url) => new FakeSocket(url),
    backoffMaxMs: 4000,
    ...overrides,
  });
  source.onMessage((m) => got.push(m.messageId));
  return { source, got, dedupe };
}

describe('PusherChatSource', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes once the connection is established', async () => {
    const { source } = makeSource();
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.deliver(
      JSON.stringify({ event: 'pusher:connection_established', data: '{"socket_id":"1.1","activity_timeout":120}' }),
    );

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      event: 'pusher:subscribe',
      data: { auth: '', channel: 'chatrooms.999.v2' },
    });

    socket.deliver(
      JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: 'chatrooms.999.v2', data: '{}' }),
    );
    expect(source.stats(999).subscribed).toBe(true);
    expect(source.stats(999).state).toBe('subscribed');
    await source.stop();
  });

  it('answers ping with pong', async () => {
    const { source } = makeSource();
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.deliver(JSON.stringify({ event: 'pusher:ping', data: '{}' }));
    expect(JSON.parse(socket.sent[0]!).event).toBe('pusher:pong');
    await source.stop();
  });

  it('delivers chat messages and dedupes repeats', async () => {
    const { source, got } = makeSource();
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.deliver(chatFrame(VALID_CHAT));
    expect(got).toEqual(['msg-1']);
    socket.deliver(chatFrame(VALID_CHAT));
    expect(got).toEqual(['msg-1']);
    expect(source.stats(999).lastMessageAt).toBeInstanceOf(Date);
    await source.stop();
  });

  it('reconnects with exponential backoff after a close', async () => {
    const { source } = makeSource();
    await source.start();
    FakeSocket.instances[0]!.open();
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.instances[0]!.terminate();
    expect(source.stats(999).state).toBe('closed');

    // First retry scheduled ~1s (jittered 0.7-1.3x of 1000ms).
    vi.advanceTimersByTime(1400);
    expect(FakeSocket.instances.length).toBe(2);
    expect(source.stats(999).reconnects).toBeGreaterThanOrEqual(1);
    await source.stop();
  });

  it('grows the backoff across repeated failures and re-subscribes', async () => {
    const { source } = makeSource();
    await source.start();

    // fail 3 times in a row
    for (let i = 0; i < 3; i++) {
      FakeSocket.instances[i]!.open();
      FakeSocket.instances[i]!.terminate();
      vi.advanceTimersByTime(30_000);
    }
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(4);

    const socket = FakeSocket.instances[FakeSocket.instances.length - 1]!;
    socket.open();
    socket.deliver(JSON.stringify({ event: 'pusher:connection_established', data: '{"socket_id":"9.9","activity_timeout":120}' }));
    const subscribes = socket.sent.filter((s) => JSON.parse(s).event === 'pusher:subscribe');
    expect(subscribes.length).toBeGreaterThanOrEqual(1);
    await source.stop();
  });

  it('watchdog fires a reconnect when nothing arrives at all', async () => {
    const { source } = makeSource({ watchdogMs: 4000 });
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();

vi.advanceTimersByTime(5001); // interval ticks at ms/4 = 1000; check is strictly >
    // The watchdog terminates the socket, which schedules the retry on a backoff
    // timer, so the new socket appears a little later.
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(2);
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
    await source.stop();
  });

  it('does not fire the watchdog while pings keep arriving', async () => {
    const { source } = makeSource({ watchdogMs: 4000 });
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();

    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(1000);
      socket.deliver(JSON.stringify({ event: 'pusher:ping', data: '{}' }));
    }
    expect(FakeSocket.instances).toHaveLength(1);
    await source.stop();
  });

  it('records a pusher:error so a stale chatroom id fails loudly', async () => {
    const { source } = makeSource();
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.deliver(JSON.stringify({ event: 'pusher:error', data: '{"code":4001,"message":"No such channel"}' }));
    expect(source.stats(999).lastPusherError).toContain('4001');
    await source.stop();
  });

  it('stops cleanly and does not reconnect afterwards', async () => {
    const { source } = makeSource();
    await source.start();
    await source.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('dedupe shared across webhook + pusher', () => {
  it('does not double count the same Kick message id', () => {
    const dedupe = new MessageDedupe();
    expect(dedupe.admit('same-id')).toBe(true);
    expect(dedupe.admit('same-id')).toBe(false);
  });

  it('pusher source honours an externally primed dedupe (webhook already saw it)', async () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    const dedupe = new MessageDedupe();
    dedupe.admit('msg-1'); // pretend the webhook source accepted it first

    const got: string[] = [];
    const source = new PusherChatSource({
      broadcasterUserId: () => BROADCASTER,
      chatroomId: () => 999,
      dedupe,
      createSocket: (url) => new FakeSocket(url),
    });
    source.onMessage((m) => got.push(m.messageId));
    await source.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.deliver(chatFrame(VALID_CHAT));
    expect(got).toEqual([]);
    await source.stop();
    vi.useRealTimers();
  });
});

describe('resolveChatroomId', () => {
  beforeEach(() => __resetChatroomCache());
  afterEach(() => {
    __resetChatroomCache();
    vi.unstubAllGlobals();
  });

  it('always prefers the configured id and never hits the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await resolveChatroomId('hsg2', 4242)).toBe(4242);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

it('tries the next source when the first is blocked', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/v2/')) return new Response('blocked', { status: 403 });
      return new Response(JSON.stringify({ chatroom: { id: 4242 } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveChatroomId('hsg2')).toBe(4242);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('raises actionable instructions on the WAF 403 Kick actually returns', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })));
    await expect(resolveChatroomId('hsg2')).rejects.toBeInstanceOf(ChatroomIdError);
    await expect(resolveChatroomId('hsg2')).rejects.toThrow(/KICK_CHATROOM_ID=NUMBER/);
  });

  it('reports a response with no chatroom field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ livestream: true }), { status: 200 })));
    await expect(resolveChatroomId('hsg2')).rejects.toThrow(/kick.com\/api\/v2\/channels\/hsg2/);
  });
});

describe('clockSkewMs', () => {
  it('returns null without a Date header', () => {
    expect(clockSkewMs(null)).toBeNull();
    expect(clockSkewMs('not a date')).toBeNull();
  });

  it('is zero for a matching clock', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    expect(clockSkewMs('Tue, 07 Oct 2026 12:00:00 GMT', now)).toBe(0);
  });

  it('is positive when the PC is behind Kick', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    expect(clockSkewMs('Tue, 07 Oct 2026 12:01:00 GMT', now)).toBe(60_000);
  });

  it('is negative when the PC is ahead', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    expect(clockSkewMs('Tue, 07 Oct 2026 11:59:00 GMT', now)).toBe(-60_000);
  });
});