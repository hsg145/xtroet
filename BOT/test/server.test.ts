/**
 * Two regression guards for the webhook intake, both of which cost the bot its
 * voice for days while /health reported everything as fine:
 *
 *  1. Middleware ordering: the catch-all 404 used to be registered before the
 *     webhook router, so POST /webhooks/kick never reached the signature check.
 *     Kick answers a 404 by unsubscribing the app.
 *
 *  2. THE SILENT ONE: WebhookChatSource only ever called the callback given to
 *     onMessage(), and index.ts wired its handler into the constructor instead.
 *     Kick's events were verified, accepted, logged as `delivering: true` — and
 *     dropped. No commands, no points, no rank-ups, no error anywhere.
 *
 * The second test therefore posts a properly SIGNED chat.message.sent payload
 * and asserts it reaches the handler. Status codes are not enough: the whole
 * failure mode looked like success from outside.
 */
import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createServer, WebhookChatSource } from '../src/core/server.js';
import { publicKeyCache } from '../src/kick/signature.js';
import type { NormalizedMessage } from '../src/kick/types.js';

const CHANNEL_ID = 6095331;

async function serve(source: WebhookChatSource) {
  const server = createServer({ health: () => ({ ok: true }), webhookRouter: source.router() });
  // Port 0: ephemeral, so the suite never collides with a running bot.
  const listener = server.app.listen(0);
  await once(listener, 'listening');
  const port = (listener.address() as AddressInfo).port;
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    async close() {
      listener.close();
      await once(listener, 'close');
    },
  };
}

/** Wait for the post-response async work inside the webhook handler. */
async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition never became true');
}

function signedRequest(payload: unknown, key: string): { headers: Record<string, string>; body: string } {
  const body = JSON.stringify(payload);
  const messageId = '11111111-2222-3333-4444-555555555555';
  const timestamp = new Date().toISOString();
  const signer = createSign('RSA-SHA256');
  signer.update(Buffer.concat([Buffer.from(`${messageId}.${timestamp}.`, 'utf8'), Buffer.from(body, 'utf8')]));
  signer.end();
  const signature = signer.sign(key).toString('base64');
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'kick-event-message-id': messageId,
      'kick-event-message-timestamp': timestamp,
      'kick-event-signature': signature,
      'kick-event-type': 'chat.message.sent',
      'kick-event-version': '1',
    },
  };
}

const chatPayload = {
  message_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  content: '!رتبتي',
  created_at: new Date().toISOString(),
  broadcaster: { user_id: CHANNEL_ID, username: 'xtroet' },
  sender: { user_id: 42, username: 'someone' },
};

describe('webhook routing', () => {
  it('reaches the webhook handler instead of the 404 fallback', async () => {
    const source = new WebhookChatSource({
      onMessage: () => undefined,
      broadcasterUserId: () => 1,
    });

    const server = await serve(source);

    try {
      // No Kick signature headers -> must be 401 from the webhook router.
      const unsigned = await fetch(server.url('/webhooks/kick'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"content":"hi"}',
      });
      expect(unsigned.status).toBe(401);
      expect(await unsigned.json()).toMatchObject({ error: 'missing Kick signature headers' });

      // Health still answers.
      const health = await fetch(server.url('/health'));
      expect(health.status).toBe(200);

      // An unrelated path still 404s.
      const missing = await fetch(server.url('/nope'));
      expect(missing.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('delivers a signed chat message to the handler passed to the constructor', async () => {
    // Seed the signature cache with a generated key so no network is needed.
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    publicKeyCache.set(publicKey.export({ type: 'spki', format: 'pem' }).toString());

    const received: NormalizedMessage[] = [];
    // Exactly how index.ts wires it: handler in the constructor, no onMessage().
    const source = new WebhookChatSource({
      onMessage: (msg) => received.push(msg),
      broadcasterUserId: () => CHANNEL_ID,
    });

    expect(source.wired).toBe(true);

    const server = await serve(source);
    try {
      const req = signedRequest(chatPayload, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
      const res = await fetch(server.url('/webhooks/kick'), { method: 'POST', headers: req.headers, body: req.body });
      expect(res.status).toBe(200);

      await waitFor(() => received.length > 0);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        messageId: chatPayload.message_id,
        content: '!رتبتي',
        userId: 42,
        username: 'someone',
        broadcasterUserId: CHANNEL_ID,
      });
      expect(source.droppedMessages).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('reports an unwired source instead of dropping silently', async () => {
    const source = new WebhookChatSource({
      onMessage: () => undefined,
      broadcasterUserId: () => CHANNEL_ID,
    });
    // Simulate the mistake that caused the outage: nothing listening.
    (source as unknown as { cb?: unknown }).cb = undefined;
    expect(source.wired).toBe(false);

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    publicKeyCache.set(publicKey.export({ type: 'spki', format: 'pem' }).toString());

    const server = await serve(source);
    try {
      const req = signedRequest({ ...chatPayload, message_id: 'ffffffff-0000-0000-0000-000000000000' }, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
      const res = await fetch(server.url('/webhooks/kick'), { method: 'POST', headers: req.headers, body: req.body });
      expect(res.status).toBe(200);

      // The drop is counted and visible, not silent.
      await waitFor(() => source.droppedMessages > 0);
      expect(source.droppedMessages).toBe(1);
    } finally {
      await server.close();
    }
  });
});