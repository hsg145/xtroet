/**
 * Unit tests must never touch the network or a real database.
 * Every module that talks to Supabase is replaced here; the Kick public key
 * endpoint is stubbed, and the dotenv file is intentionally NOT loaded so a
 * developer's real secrets can never influence a test run.
 */
import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.KICK_CLIENT_ID = 'test-client-id';
process.env.KICK_CLIENT_SECRET = 'test-client-secret';
process.env.KICK_REDIRECT_URI = 'http://localhost:3000/callback';
process.env.KICK_TARGET_CHANNEL_SLUG = 'testchannel';
process.env.SUPABASE_URL = 'https://project.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
process.env.LOG_LEVEL = 'silent';

const members = new Map<string, { points: number; message_count: number; rank_idx: number; username: string }>();

vi.mock('../src/db/repo.js', () => ({
  upsertChannel: vi.fn(async () => undefined),
  fetchRanks: vi.fn(async () => []),
  fetchMember: vi.fn(async (_channelId: number, userId: number) => {
    const row = members.get(String(userId));
    if (!row) return null;
    return { kick_user_id: userId, ...row };
  }),
  applyPoints: vi.fn(async () => []),
  setPoints: vi.fn(async () => []),
  fetchLeaderboard: vi.fn(async () => []),
  fetchPosition: vi.fn(async () => null),
  findMemberByUsername: vi.fn(async () => null),
  saveToken: vi.fn(async () => undefined),
  loadToken: vi.fn(async () => null),
  loadAnyToken: vi.fn(async () => null),
}));

vi.mock('../src/db/supabase.js', () => ({
  getSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    }),
  })),
}));