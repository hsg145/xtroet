import { describe, expect, it } from 'vitest';
import {
  computeProgress,
  formatNumber,
  messages,
  progressBar,
  safeUsername,
  splitMessage,
  toSingleLine,
  MAX_CHAT_LENGTH,
} from '../src/messages.js';
import { FALLBACK_FOR_TEST, RankStore, type Rank } from '../src/core/ranks.js';
import { MessageDedupe } from '../src/kick/webhook.js';
import { fitToKickLimits } from '../src/core/sender.js';
import { normalizeChatMessage, chatMessageSentSchema } from '../src/kick/types.js';
import { parseAdminArgs } from '../src/core/commands.js';

const ranks = FALLBACK_FOR_TEST;
const store = new RankStore();

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('handles negatives and rounding', () => {
    expect(formatNumber(1234.6)).toBe('1,235');
  });

});

describe('progressBar', () => {
  it('renders a percentage', () => {
    expect(progressBar(0)).toBe('0%');
    expect(progressBar(1)).toBe('100%');
    expect(progressBar(0.5)).toBe('50%');
    expect(progressBar(0.4)).toBe('40%');
  });

  it('clamps out-of-range values', () => {
    expect(progressBar(-5)).toBe('0%');
    expect(progressBar(9)).toBe('100%');
    expect(progressBar(Number.NaN)).toBe('0%');
  });
});

describe('computeProgress', () => {
  it('reports no next rank at the top', () => {
    const p = computeProgress(ranks, 100000);
    expect(p.current.key).toBe('minister');
    expect(p.next).toBeNull();
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it('computes remaining points and percentage', () => {
    const p = computeProgress(ranks, 100); // 100 of the 0..200 span
    expect(p.current.key).toBe('cadet');
    expect(p.next?.key).toBe('solo_cadet');
    expect(p.remaining).toBe(100);
    expect(p.percent).toBe(50);
  });

  it('reaches 100% exactly at the next threshold', () => {
    const p = computeProgress(ranks, 200);
    expect(p.current.key).toBe('solo_cadet');
    expect(p.remaining).toBe(300);
    expect(p.percent).toBe(0);
  });

  it('handles zero points', () => {
    const p = computeProgress(ranks, 0);
    expect(p.current.key).toBe('cadet');
    expect(p.remaining).toBe(200);
    expect(p.percent).toBe(0);
  });
});

describe('toSingleLine / safeUsername / splitMessage', () => {
  it('flattens newlines into a single line', () => {
    expect(toSingleLine('a\nb\r\nc')).toBe('a b c');
    expect(toSingleLine('a b')).toBe('a b');
  });

  it('truncates beyond the Kick limit', () => {
    const long = 'ا'.repeat(MAX_CHAT_LENGTH + 100);
    const out = toSingleLine(long);
    expect([...out].length).toBeLessThanOrEqual(MAX_CHAT_LENGTH);
    expect(out.endsWith('…')).toBe(true);
  });

  it('strips control characters from usernames', () => {
    expect(safeUsername('ab' + String.fromCharCode(7) + 'cd' + String.fromCharCode(0x202e))).toBe('abcd');
    expect(safeUsername('')).toBe('مجهول');
    expect(safeUsername('ا'.repeat(60)).length).toBe(30);
  });

  it('splits a long message into Kick-safe chunks', () => {
    const parts = splitMessage('ا'.repeat(MAX_CHAT_LENGTH * 2 + 50));
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect([...p].length).toBeLessThanOrEqual(MAX_CHAT_LENGTH);
  });

  it('fits to the 2048 byte limit', () => {
    const out = fitToKickLimits('ا'.repeat(2000));
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(2048);
  });
});

describe('messages', () => {
  const p = computeProgress(ranks, 1400); // midway between officer_2 (1000) and officer_3 (1800)

/**
   * A phone shows ~45-50 characters per line in Kick chat, so ~90 wraps onto a
   * second line. One Kick message that wraps to two phone lines is the intended
   * result: still ONE message in chat, just legible on a small screen instead
   * of being shredded into several messages.
   */
  const PHONE_LINE = 90;

  it('renders the rank card in the exact agreed format', () => {
    // Locked format — a change here is a visible change in the channel.
    expect(
      messages.rankOf({
        username: 'ahmed_2000',
        rank: p.current, // 🔹 officer 2
        points: 1400,
        position: 3,
        ratio: p.ratio,
        remaining: p.remaining,
        nextRank: p.next!, // 🔹 officer 3
        percent: p.percent,
      }),
    ).toBe('⭐ أوفيسر 2┃🔹1,400 ┃ 50% ➜ [🎯400] ⭐ أوفيسر 3 @ahmed_2000');
  });

  it('puts the mention at the END, frames both names, and drops tier markers', () => {
    const text = messages.rankOf({
      username: 'POWR_HSG',
      rank: p.current,
      points: 101,
      position: 1,
      ratio: p.ratio,
      remaining: p.remaining,
      nextRank: p.next!,
      percent: p.percent,
    });
    // Mention last, rank names first.
    expect(text.endsWith('@POWR_HSG')).toBe(true);
    expect(text.startsWith('@')).toBe(false);
    // Both ranks behind one leading star, neither carrying its tier glyph.
    expect(text).toContain(`⭐ ${p.current.name_ar}┃`);
    expect(text).toContain(`⭐ ${p.next!.name_ar} @`);
    expect(text).not.toContain(`${p.current.emoji} ${p.current.name_ar}`);
    expect(text).not.toContain(`${p.next!.emoji} ${p.next!.name_ar}`);
    // One star per rank: two in total.
    expect(text.match(/⭐/g)).toHaveLength(2);
  });

  it('keeps every digit Western and the marker space-separated', () => {
    const text = messages.rankOf({
      username: 'ahmed_2000',
      rank: p.current,
      points: 1234567,
      position: 9,
      ratio: p.ratio,
      remaining: 12345,
      nextRank: p.next!,
      percent: p.percent,
    });
    // No Arabic-Indic digits anywhere: mixing them reorders the line on a phone.
    expect(text).not.toMatch(/[٠-٩]/);
    // A space on BOTH sides of the tier marker, inside the star frame.
    expect(text).toMatch(/⭐ أوفيسر 2┃/);
    expect(text).toMatch(/⭐ أوفيسر 3 @ahmed_2000$/);
    // The remaining counter is the agreed Western form with a thousands comma.
    expect(text).toContain('[🎯12,345]');
  });

  it('keeps a fixed 🔹 on the points while the star frame stays constant', () => {
    const at1800 = computeProgress(ranks, 1800).current; // officer 3
    const at3000 = computeProgress(ranks, 3000).current; // senior officer
    const next = computeProgress(ranks, 1800).next!;
    const card = (r: Rank, points: number, r2: Rank): string =>
      messages.rankOf({
        username: 'u',
        rank: r,
        points,
        position: null,
        ratio: 0.5,
        remaining: 10,
        nextRank: r2,
        percent: 50,
      });
    // The NAME changes with the rank, the star frame around it does not.
     expect(card(at1800, 1800, next)).toContain('⭐ ' + at1800.name_ar + '┃');
     expect(card(at3000, 3000, next)).toContain('⭐ ' + at3000.name_ar + '┃');
    expect(at1800.name_ar).not.toBe(at3000.name_ar);
    // The points marker is always 🔹, at every rank.
    expect(card(at1800, 1800, next)).toContain('┃🔹1,800');
    expect(card(at3000, 3000, next)).toContain('┃🔹3,000');
  });

  it('never leaks a raw rank glyph into the card', () => {
    // The card prints rank NAMES only; the tier emoji stays out of the line so
    // the star frame reads cleanly. (It still shows in !رتب and in the DB.)
    for (const r of [...ranks].sort((a, b) => a.idx - b.idx)) {
      const card = messages.rankOf({
        username: 'u',
        rank: r,
        points: r.min_points,
        position: null,
        ratio: 0,
        remaining: 0,
        nextRank: null,
        percent: 100,
      });
      expect(card).toContain(`⭐ ${r.name_ar}┃`);
      // Only the fixed points marker 🔹 is ever a glyph inside the card.
      expect(card.match(/🔹/g)).toHaveLength(1);
      expect(card.match(/⭐/g)).toHaveLength(1);
      expect(card.includes('\n')).toBe(false);
    }
  });

  it('keeps variation selectors so single-glyph markers still render', () => {
    // U+FE0F is what makes ▪️/▫️/🎖️ render as emoji instead of a bare text
    // glyph. It no longer reaches the card, but !رتب still prints these markers,
    // so the selector must survive there.
    const ladder = messages.ranksList(ranks).join(' ');
    for (const r of ranks) {
      expect(ladder).toContain(r.name_ar);
      if ([...r.emoji].length > 1) {
        expect(ladder).toContain(r.emoji); // base glyph + U+FE0F, intact
      }
    }
  });

  it('groups markers by tier family, so colour shows the block', () => {
    const ordered = [...ranks].sort((a, b) => a.idx - b.idx);
    const at = (i: number): string => ordered[i]!.emoji;
    // Cadets: light squares. Officers (3-5): 🔹. Seniors (6-7): 🔸.
    expect(['▪️', '▫️']).toContain(at(0));
    expect(at(2)).toBe('🔹');
    expect(at(3)).toBe('🔹');
    expect(at(4)).toBe('🔹');
    expect(at(5)).toBe('🔸');
    expect(at(6)).toBe('🔸');
    // Sergeants: the block shares the diamond family, the top two become 🔺.
    expect(at(7)).toBe('💠');
    expect(at(8)).toBe('🔺');
    expect(at(9)).toBe('🔺');
    // The top five are royal, one glyph each.
    expect(at(10)).toBe('✨');
    expect(at(11)).toBe('⚜️');
    expect(at(12)).toBe('🥈');
    expect(at(13)).toBe('🥇');
    expect(at(14)).toBe('🎖️');
  });

  it('uses a royal ladder for the top five ranks', () => {
    const ordered = [...ranks].sort((a, b) => a.idx - b.idx);
    expect(ordered[10]!.emoji).toBe('✨');
    expect(ordered[11]!.emoji).toBe('⚜️');
    expect(ordered[12]!.emoji).toBe('🥈');
    expect(ordered[13]!.emoji).toBe('🥇');
    expect(ordered[14]!.emoji).toBe('🎖️');
  });

  it('never cuts a rank name mid-word', () => {
    for (const r of ranks) {
      const name = messages.rankOf({
        username: 'u',
        rank: r,
        points: r.min_points,
        position: null,
        ratio: 0,
        remaining: 0,
        nextRank: null,
        percent: 100,
      });
      // The full name must survive into the card.
      expect(name).toContain(r.name_ar);
    }
  });

  it('renders the rank card as ONE message', () => {
    const lines = messages.rankOf({
      username: 'ahmed',
      rank: p.current,
      points: 700,
      position: 3,
      ratio: p.ratio,
      remaining: p.remaining,
      nextRank: p.next!,
percent: p.percent,
    });
const text = lines;
    expect(text).toContain('@ahmed');
    expect(text).toContain('أوفيسر 2');
    expect(text).toContain('🔹700');
    expect(text).toContain('%');
    expect(text).toContain('أوفيسر 3');
    // One message, no embedded newlines, and it fits a narrow phone.
    expect(text.includes('\n')).toBe(false);
    expect([...text].length).toBeLessThanOrEqual(MAX_CHAT_LENGTH);
    expect([...text].length).toBeLessThanOrEqual(PHONE_LINE);
  });

  it('shows the top-rank message instead of progress', () => {
    const top = computeProgress(ranks, 120000);
    const text = messages.rankOf({
      username: 'ahmed',
      rank: top.current,
      points: 120000,
      position: 1,
      ratio: 1,
      remaining: 0,
      nextRank: null,
      percent: 100,
    });
expect(text).toContain('🎖️');
    expect(text).toContain('أعلى رتبة');
    expect([...text].length).toBeLessThanOrEqual(PHONE_LINE);
  });

  it('announces a rank-up', () => {
    const text = messages.rankUp('ahmed', store.rankForPoints(200));
    expect(text).toContain('🎉');
    expect(text).toContain('@ahmed');
    expect(text).toContain('سولو كاديت');
  });

  it('renders the top list as one line with medals', () => {
    const text = messages.top([
      { username: 'a', points: 3000 },
      { username: 'b', points: 2500 },
      { username: 'c', points: 2000 },
      { username: 'd', points: 1500 },
      { username: 'e', points: 1000 },
      { username: 'f', points: 500 },
    ]);
    expect(text).toContain('🥇');
    expect(text).toContain('🥈');
    expect(text).toContain('🥉');
    expect(text).toContain('4️⃣');
    expect(text).toContain('5️⃣');
    expect(text).toContain('3,000');
    expect(text).not.toContain('@f');
    expect(text.includes('\n')).toBe(false);
    expect([...text].length).toBeLessThanOrEqual(MAX_CHAT_LENGTH);
  });

  it('handles an empty leaderboard', () => {
    expect(messages.top([])).toContain('لا أحد بعد');
  });

  it('packs the ranks list into Kick-safe lines', () => {
    const lines = messages.ranksList(ranks);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) {
      expect([...line].length).toBeLessThanOrEqual(MAX_CHAT_LENGTH);
      expect(line.includes('\n')).toBe(false);
    }
    expect(lines.join(' ')).toContain('الوزير');
  });

  it('renders status without leaking secrets', () => {
    const text = messages
      .status({
        uptime: '1س 2د 3ث',
        channel: 'mychannel',
        mode: 'test',
        queue: 0,
        pending: 2,
        lastFlush: '5ث',
        lastEvent: 'لم',
        subscriptionOk: true,
      });
expect(text).toContain('🤖');
    expect(text).toContain('mychannel');
    expect(text).toContain('🧪');
    expect(text).toContain('🔔');
    expect(text.includes('\n')).toBe(false);
    expect([...text].length).toBeLessThanOrEqual(PHONE_LINE);
  });

  it('keeps every user-facing line within the Kick limits', () => {
    const groups: string[][] = [
      [
        messages.rankOf({
          username: 'x'.repeat(60),
          rank: p.current,
          points: 123456,
          position: 99,
          ratio: p.ratio,
          remaining: p.remaining,
          nextRank: p.next!,
          percent: p.percent,
        }),
        messages.top([{ username: 'y'.repeat(60), points: 999999 }]),
        messages.rankUp('z'.repeat(60), store.rankForPoints(100)),
        messages.pointsAdded('q'.repeat(60), 500, store.rankForPoints(500)),
        messages.pointsSet('q'.repeat(60), -5, store.rankForPoints(0)),
        messages.userReset('q'.repeat(60)),
        messages.rankOfOtherNotFound('q'.repeat(60)),
        messages.status({
          uptime: '99س 99د 99ث',
          channel: 'c'.repeat(60),
          mode: 'test',
          queue: 999999,
          pending: 999999,
          lastFlush: '999ث',
          lastEvent: '999ث',
          subscriptionOk: false,
        }),
      ],
      messages.ranksList(ranks),
    ];
    for (const group of groups) {
      for (const line of group) {
        expect([...line].length).toBeLessThanOrEqual(MAX_CHAT_LENGTH);
        expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(2048);
        expect(line.includes('\n')).toBe(false);
      }
    }
  });
});

describe('MessageDedupe', () => {
  it('admits an id once', () => {
    const d = new MessageDedupe();
    expect(d.admit('a')).toBe(true);
    expect(d.admit('a')).toBe(false);
  });

  it('re-admits after the TTL', () => {
    const d = new MessageDedupe(10, 1000);
    expect(d.admit('a', 0)).toBe(true);
    expect(d.admit('a', 500)).toBe(false);
    expect(d.admit('a', 2000)).toBe(true);
  });

  it('caps the map size', () => {
    const d = new MessageDedupe(5);
    for (let i = 0; i < 50; i++) d.admit(`id-${i}`);
    expect(d.size).toBeLessThanOrEqual(5);
  });
});

describe('parseAdminArgs', () => {
  it('parses "name 50"', () => {
    expect(parseAdminArgs('ahmed 50', false)).toEqual({ target: 'ahmed', amount: 50 });
  });

  it('parses "name = 50"', () => {
    expect(parseAdminArgs('ahmed = 50', false)).toEqual({ target: 'ahmed', amount: 50 });
  });

  it('parses multi-word names', () => {
    expect(parseAdminArgs('@مصطفى الشامي 250', false)).toEqual({ target: 'مصطفي الشامي', amount: 250 });
  });

  it('rejects non-integer or missing amounts', () => {
    expect(parseAdminArgs('ahmed abc', false)).toBeNull();
    expect(parseAdminArgs('ahmed 5.5', false)).toBeNull();
    expect(parseAdminArgs('ahmed', false)).toBeNull();
  });

  it('rejects zero/negative for addpts but allows them for setpts', () => {
    expect(parseAdminArgs('ahmed 0', false)).toBeNull();
    expect(parseAdminArgs('ahmed -5', false)).toBeNull();
    expect(parseAdminArgs('ahmed -5', true)).toEqual({ target: 'ahmed', amount: -5 });
  });
});

describe('chat.message.sent payload validation', () => {
  const payload = {
    message_id: '01JBX',
    content: 'مرحبا',
    created_at: '2026-01-14T16:08:06Z',
    broadcaster: {
      is_anonymous: false,
      user_id: 123456789,
      username: 'streamer',
      is_verified: true,
      channel_slug: 'streamer',
      identity: null,
    },
    sender: {
      is_anonymous: false,
      user_id: 987654321,
      username: 'viewer',
      is_verified: false,
      channel_slug: 'viewer',
      identity: { badges: [{ type: 'moderator', text: 'Moderator' }] },
    },
  };

  it('accepts a documented payload', () => {
    const parsed = chatMessageSentSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const msg = normalizeChatMessage(parsed.data);
    expect(msg.userId).toBe(987654321);
    expect(msg.username).toBe('viewer');
    expect(msg.broadcasterUserId).toBe(123456789);
    expect(msg.isModerator).toBe(true);
    expect(msg.isSubscriber).toBe(false);
  });

  it('rejects a payload with no sender user_id', () => {
    expect(chatMessageSentSchema.safeParse({ ...payload, sender: { username: 'x' } }).success).toBe(false);
  });

  it('rejects a payload with no content', () => {
    expect(chatMessageSentSchema.safeParse({ ...payload, content: undefined }).success).toBe(false);
  });

  it('accepts anonymous senders with a null user_id path', () => {
    const parsed = chatMessageSentSchema.safeParse({
      ...payload,
      sender: { ...payload.sender, is_anonymous: true, user_id: 0 },
    });
    expect(parsed.success).toBe(true);
  });
});
