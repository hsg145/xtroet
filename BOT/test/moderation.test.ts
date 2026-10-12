/**
 * اختبارات moderation في كيك: التثبيت (timeout) وفكه.
 *
 * ما تلمس الشبكة أبداً — نستبدل fetch العالمي بستب ونتحقق من الشكل
 * المرسل لكيك (endpoint + دقائق + سبب)، ومن ترجمة 401 لخطأ واضح.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KickApiError, timeoutUser, untimeoutUser } from '../src/kick/api.js';

const calls: Array<{ url: string; method: string; body: unknown }> = [];

function stubFetch(status: number, text = '{}') {
  (globalThis as any).fetch = vi.fn(async (url: unknown, init: any) => {
    let body: unknown = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = String(init?.body ?? '');
    }
    calls.push({ url: String(url), method: String(init?.method ?? 'GET'), body });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  });
}

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe('timeoutUser (التثبيت)', () => {
  it('posts to /moderation/bans with the user and a duration', async () => {
    stubFetch(200, '{}');
    await timeoutUser('tok', 6095331, 123, { duration: 1, reason: 'تثبيت من غرفة القيادة' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.kick.com/public/v1/moderation/bans');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toMatchObject({
      broadcaster_user_id: 6095331,
      user_id: 123,
      duration: 1,
    });
  });

  it('omits duration for a permanent ban', async () => {
    stubFetch(200, '{}');
    await timeoutUser('tok', 6095331, 123, {});
    expect(calls[0]!.body).toMatchObject({ broadcaster_user_id: 6095331, user_id: 123 });
    expect(calls[0]!.body).not.toHaveProperty('duration');
  });

  it('clamps the reason to 100 chars (what Kick allows)', async () => {
    stubFetch(200, '{}');
    await timeoutUser('tok', 6095331, 123, { duration: 1, reason: 'x'.repeat(500) });
    expect(String((calls[0]!.body as any).reason)).toHaveLength(100);
  });

  it('surfaces 401 so the caller can ask for a re-auth', async () => {
    stubFetch(401, '{"message":"Unauthorized"}');
    const err = await timeoutUser('tok', 6095331, 123, { duration: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(KickApiError);
    expect((err as KickApiError).status).toBe(401);
  });
});

describe('untimeoutUser (فك التثبيت)', () => {
  it('deletes with both ids in the query', async () => {
    stubFetch(200, '{}');
    await untimeoutUser('tok', 6095331, 123);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toContain('/public/v1/moderation/bans');
    expect(calls[0]!.url).toContain('broadcaster_user_id=6095331');
    expect(calls[0]!.url).toContain('user_id=123');
  });
});