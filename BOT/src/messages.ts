/**
 * ALL user-facing chat text lives here.
 * Edit the wording freely -- the rest of the bot never hardcodes chat strings.
 * Every message must be a SINGLE LINE (Kick chat has no line breaks);
 * use the SEPARATOR below instead of \n.
 */
import type { Rank } from './core/ranks.js';

export const SEPARATOR = ' ┃ ';

/** Kick chat content limit is 500 user-perceived characters. */
export const MAX_CHAT_LENGTH = 480;

export interface RankProgress {
  current: Rank;
  next: Rank | null;
  points: number;
  position: number | null;
  /** 0..1 progress towards the next rank. */
  ratio: number;
  /** Points still needed for the next rank. */
  remaining: number;
  fill: string;
  empty: string;
  percent: number;
}

/** 1234567 -> "1,234,567" (Western digits, easier to read in Kick chat). */
export function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Progress as a percentage string.
 *
 * Replaced a 10-segment bar: the bar plus a percentage plus a rank name
 * overflowed a 360px phone and wrapped into an unreadable block. The agreed
 * card format carries `50%` inline instead.
 */
export function progressBar(ratio: number): string {
  const safe = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return `${Math.round(safe * 100)}%`;
}

export function computeProgress(ranks: Rank[], points: number): RankProgress {
  const fill = '▰';
  const empty = '▱';
  const ordered = [...ranks].sort((a, b) => a.idx - b.idx);

  let current = ordered[0]!;
  for (const r of ordered) if (points >= r.min_points) current = r;

  const higher = ordered.filter((r) => r.min_points > current.min_points);
  const next = higher.length > 0 ? ordered[ordered.indexOf(current) + 1]! : null;

  if (!next) {
    return { current, next: null, points, position: null, ratio: 1, remaining: 0, fill, empty, percent: 100 };
  }

  const span = next.min_points - current.min_points;
  const gained = points - current.min_points;
  const ratio = span > 0 ? gained / span : 1;

  return {
    current,
    next,
    points,
    position: null,
    ratio: Math.min(1, Math.max(0, ratio)),
    remaining: Math.max(0, next.min_points - points),
    fill,
    empty,
    percent: Math.min(100, Math.max(0, Math.round(ratio * 100))),
  };
}

/** Strip control characters and clamp a username for safe display. */
export function safeUsername(name: string, max = 30): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2028\u2029]/g, '').trim();
  return clean.slice(0, max) || 'مجهول';
}

/** Force any string into a safe single line within Kick's limit. */
export function toSingleLine(text: string, max = MAX_CHAT_LENGTH): string {
  const flat = text.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if ([...flat].length <= max) return flat;
  return [...flat].slice(0, max - 1).join('') + '…';
}

/**
 * Display helpers.
 *
 * DESIGN RULES (Kick chat renders on phones, tablets and desktop):
 *  - Kick chat has NO line breaks. Anything long wraps unpredictably on a
 *    narrow phone, so every message must stay ONE tidy line.
 *  - Target 45 visible characters or fewer: that fits a 360px phone without
 *    wrapping, and still reads well on desktop.
 *  - Digits stay Western for numbers and Arabic-Indic only for the "remaining"
 *    counter, never mixed inside one token (it breaks bidi on some phones).
 *  - Emoji are used as icons, not decoration, to keep the line scannable.
 */
const parts = (items: string[]) => items.filter(Boolean).join(SEPARATOR);

/** `🔹700` — points count. */
const points = (n: number): string => `🔹${formatNumber(n)}`;

/** `🥇@name 3,000` — one leaderboard row, trimmed to fit a phone. */
const row = (medal: string, username: string, count: number): string =>
  toSingleLine(`${medal}@${safeUsername(username, 14)} ${formatNumber(count)}`);

/**
 * The rank name as plain text, taken from `name_ar` only.
 *
 * The card renders the rank's own marker itself, so the name must not carry an
 * emoji too or the glyphs stack up. Not truncated: the longest Arabic name is
 * short, and cutting one mid-word ("أوفيس 2") is worse than a slightly longer
 * line.
 */
const rankName = (r: Rank): string => r.name_ar.trim();

/** The star glyph that frames a rank name. */
const FLOWER = '⭐';

/**
 * `⭐ أوفيسر 3` — a rank name behind one leading star.
 *
 * A single star on both sides of the name: the card reads as a clean
 * `⭐ here ┃ points ┃ progress ➜ [🎯n] ⭐ goal @mention` line. Extra stars were
 * crowding the name on a narrow phone, so each rank gets exactly one.
 */
const rankGoalLabel = (r: Rank): string => `${FLOWER} ${rankName(r)}`;

/** `⭐ سولو كاديت` — the CURRENT rank: one leading star, matching the goal. */
const rankLabel = (r: Rank): string => rankGoalLabel(r);

/**
 * The points marker: a FIXED 🔹.
 *
 * Deliberately not the rank's own marker. When the points field took the rank
 * colour, every glyph in the line matched and the card went monochrome:
 *   🔹 أوفيسر 2 ┃🔹700 ┃ ... 🔹 أوفيسر 3
 * Pinning 🔹 to the points keeps one constant landmark the eye can find, while
 * the two rank labels still change colour on promotion:
 *   🔹 أوفيسر 2 ┃🔹700 ┃ 50% ➜ [🎯200] 🔸 أوفيسر 3
 */
const POINTS_MARKER = '🔹';

/** `🔹700` — the points count behind its fixed marker. */
const pointsMarked = (n: number): string => `${POINTS_MARKER}${formatNumber(n)}`;

export const messages = {
  /**
* The card, exactly this shape:
   *   ⭐ ▫️ سولو كاديت ⭐ ┃🔹101 ┃ 1% ➜ [🎯149] ⭐ أوفيسر 1 ⭐ @POWR_HSG
   *
   * Rules that keep it readable on a phone:
   *  - ONE line, no embedded newlines.
   *  - Both rank names are framed by stars; the mention sits at the END so the
   *    ranks are the first thing the eye lands on.
   *  - Remaining points go in [🎯n] with Western digits throughout.
   */
  rankOf: (p: {
    username: string;
    rank: Rank;
    points: number;
    position: number | null;
    ratio: number;
    remaining: number;
    nextRank: Rank | null;
    percent: number;
  }): string => {
    const mention = `@${safeUsername(p.username, 14)}`;
    const body = toSingleLine(
      `${rankLabel(p.rank)}┃${pointsMarked(p.points)} ┃ ${progressBar(p.ratio)} ➜ [🎯${formatNumber(p.remaining)}]`,
    );

    const goal = p.nextRank ? rankGoalLabel(p.nextRank) : '🎖️ أعلى رتبة';
    return toSingleLine(`${body} ${goal} ${mention}`);
  },

  /** Rank-up: one line, in the agreed format, mention last. */
  rankUp: (username: string, rank: Rank): string =>
    toSingleLine(`🎉⭐ ${rankName(rank)} 🔥 @${safeUsername(username, 18)}`),

  /** Leaderboard: one line, rows joined by a thin separator. */
  top: (rows: Array<{ username: string; points: number }>): string => {
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const top5 = rows.slice(0, 5);
    if (top5.length === 0) return toSingleLine('🏆 لا أحد بعد — كن أول المتصدرين!');
    const body = top5.map((r, i) => row(medals[i] ?? `${i + 1}.`, r.username, r.points)).join(' ');
    return toSingleLine(`🏆 ${body}`);
  },

  /** The rank ladder: split into Kick-safe lines, a few ranks per line. */
  ranksList: (ranks: Rank[]): string[] => {
    const ordered = [...ranks].sort((a, b) => a.idx - b.idx);
    const lines: string[] = [];
    let current = '🎖️ الرتب';
    for (const r of ordered) {
      const token = `${r.emoji} ${r.name_ar} ${formatNumber(r.min_points)}`;
      if ([...`${current} ${token}`].length > MAX_CHAT_LENGTH) {
        lines.push(toSingleLine(current));
        current = `   ${token}`;
      } else {
        current = `${current} ${token}`;
      }
    }
    if (current.trim()) lines.push(toSingleLine(current));
    return lines;
  },

  pointsAdded: (username: string, amount: number, rank: Rank): string =>
    toSingleLine(`✅+${formatNumber(amount)} @${safeUsername(username, 14)} → ${rankName(rank)}`),

  pointsSet: (username: string, total: number, rank: Rank): string =>
    toSingleLine(`✅ @${safeUsername(username, 14)}=${formatNumber(total)} → ${rankName(rank)}`),

  userReset: (username: string): string =>
    toSingleLine(`♻️ @${safeUsername(username, 14)} → 🔰كاديت`),

  rankUpAdmin: (username: string, rank: Rank): string => messages.rankUp(username, rank),

  status: (info: {
    uptime: string;
    channel: string;
    mode: string;
    queue: number;
    pending: number;
    lastFlush: string;
    lastEvent: string;
    subscriptionOk: boolean;
  }): string =>
    toSingleLine(
      parts([
        '🤖',
        info.mode === 'test' ? '🧪' : '🚀',
        `⏱️${info.uptime}`,
        `📺${safeUsername(info.channel, 12)}`,
        `📬${formatNumber(info.queue)}`,
        info.subscriptionOk ? '🔔' : '⚠️',
      ]),
    ),

  rankOfOtherNotFound: (username: string): string =>
    toSingleLine(`🔍 ما لقيت @${safeUsername(username, 14)} — لازم يكتب قبل`),
};

/**
 * Split a long single-line message into several Kick-safe lines.
 * Words are kept whole where possible; a single oversized token is hard-split.
 */
export function splitMessage(text: string, max = MAX_CHAT_LENGTH): string[] {
  if ([...text].length <= max) return [text];

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) chunks.push(toSingleLine(current, max));
    current = '';
  };

  for (const token of text.split(' ')) {
    const chars = [...token];

    // A token longer than the limit on its own: hard-split it.
    if (chars.length > max) {
      pushCurrent();
      for (let i = 0; i < chars.length; i += max) {
        chunks.push(chars.slice(i, i + max).join(''));
      }
      continue;
    }

    const candidate = current ? `${current} ${token}` : token;
    if ([...candidate].length > max) {
      pushCurrent();
      current = token;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks;
}