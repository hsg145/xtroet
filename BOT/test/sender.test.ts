/**
 * Two failures that made the bot look mute even though it was working:
 *
 *  1. A reply Kick refuses (400 "Invalid request" — the replied-to message is
 *     gone or not replyable) was treated as a failed send, so the ANSWER was
 *     thrown away. The command had run, the member got their points, and the
 *     channel saw nothing. Now the reply reference is dropped and the message
 *     goes out plain.
 *
 *  2. A permanently rejected message was unshifted back onto the queue forever
 *     — the drain loop retried it every ~1.2s for the life of the process,
 *     hammering the API and starving every message queued behind it. Retries
 *     are now bounded.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sendChatMessage, KickApiError } from '../src/kick/api.js';
import { ChatSender } from '../src/core/sender.js';

vi.mock('../src/kick/api.js', () => ({
  sendChatMessage: vi.fn(async () => ({ is_sent: true, message_id: 'x', via: 'bot' })),
  KickApiError: class KickApiError extends Error {
    status: number;
    body: string;
    constructor(status: number, body: string) {
      super(`Kick API ${status}: ${body}`);
      this.status = status;
      this.body = body;
    }
  },
  backoffDelay: vi.fn(async () => undefined),
}));

vi.mock('../src/kick/oauth.js', () => ({
  tokenManager: { accessToken: vi.fn(async () => 'token') },
}));

const sender = () => new ChatSender({ broadcasterUserId: 6095331, intervalMs: 1, maxSize: 50 });

beforeEach(() => {
  vi.mocked(sendChatMessage).mockReset();
  vi.mocked(sendChatMessage).mockResolvedValue({ is_sent: true, message_id: 'x', via: 'bot' });
});

describe('ChatSender replies', () => {
  it('sends plainly when Kick refuses the reply reference', async () => {
    vi.mocked(sendChatMessage)
      .mockRejectedValueOnce(new KickApiError(400, '{"message":"Invalid request"}'))
      .mockResolvedValueOnce({ is_sent: true, message_id: 'after', via: 'bot' });

    const s = sender();
    s.send('card', 'high', 'dead-message-id');
    await s.drainAll(3000);

    expect(sendChatMessage).toHaveBeenCalledTimes(2);
    // First try carried the reference, the retry dropped it.
    expect(vi.mocked(sendChatMessage).mock.calls[0]![2]).toMatchObject({ replyToMessageId: 'dead-message-id' });
    expect(vi.mocked(sendChatMessage).mock.calls[1]![2]).toMatchObject({ replyToMessageId: undefined });
    expect(s.stats.sent).toBe(1);
    expect(s.stats.failed).toBe(0);
  });

  it('does not retry forever on a message Kick rejects outright', async () => {
    // 400 with no reply reference is permanent: retrying it can never succeed.
    vi.mocked(sendChatMessage).mockRejectedValue(new KickApiError(400, '{"message":"Invalid request"}'));

    const s = sender();
    s.send('doomed', 'high');
    await s.drainAll(4000);

    // Bounded: the first attempt, plus MAX_QUEUE_ATTEMPTS-1 re-queues, then stop.
    expect(vi.mocked(sendChatMessage).mock.calls.length).toBeLessThanOrEqual(4);
    expect(s.stats.sent).toBe(0);
    expect(s.length).toBe(0);
  });

  it('keeps delivering later messages after one is dropped', async () => {
    vi.mocked(sendChatMessage).mockImplementation(async () => {
      throw new KickApiError(400, 'no');
    });

    const s = sender();
    s.send('first', 'high');
    s.send('second', 'high');
    await s.drainAll(4000);

    // Both were attempted and both were released — the queue drains.
    expect(s.length).toBe(0);
    expect(s.stats.failed).toBeGreaterThanOrEqual(2);
  });

  it('remembers the ids of what it posted so it never counts itself', async () => {
    vi.mocked(sendChatMessage).mockResolvedValue({ is_sent: true, message_id: 'echo-1', via: 'bot' });
    const s = sender();
    s.send('hello', 'high');
    await s.drainAll(3000);
    expect(s.isOwnMessage('echo-1')).toBe(true);
    expect(s.isOwnMessage('someone-else')).toBe(false);
  });
});