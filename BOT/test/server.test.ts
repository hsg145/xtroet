/**
 * Regression guard for the middleware ordering bug: the catch-all 404 was
 * registered before the webhook router, so POST /webhooks/kick never reached
 * the signature check. Kick answers a 404 by unsubscribing the app, which
 * silently killed all chat intake.
 */
import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer, WebhookChatSource } from '../src/core/server.js';

describe('webhook routing', () => {
  it('reaches the webhook handler instead of the 404 fallback', async () => {
    const source = new WebhookChatSource({
      onMessage: () => undefined,
      broadcasterUserId: () => 1,
    });

    const server = createServer({
      health: () => ({ ok: true }),
      webhookRouter: source.router(),
    });

    // Port 0: ephemeral, so the suite never collides with a running bot.
    const listener = server.app.listen(0);
    await once(listener, 'listening');
    const port = (listener.address() as AddressInfo).port;

    try {
      // No Kick signature headers -> must be 401 from the webhook router.
      const unsigned = await fetch(`http://127.0.0.1:${port}/webhooks/kick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"content":"hi"}',
      });
      expect(unsigned.status).toBe(401);
      expect(await unsigned.json()).toMatchObject({ error: 'missing Kick signature headers' });

      // Health still answers.
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);

      // An unrelated path still 404s.
      const missing = await fetch(`http://127.0.0.1:${port}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      listener.close();
      await once(listener, 'close');
    }
  });
});