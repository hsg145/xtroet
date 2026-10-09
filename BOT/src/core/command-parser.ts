/**
 * Arabic normalization for command matching.
 *   trim -> strip tashkeel/tatweel -> lowercase
 *   أ إ آ ٱ -> ا | ى -> ي | ة -> ه | ؤ -> و | ئ -> ي | ء -> removed
 * So !رتبة, !رتبه, !رتبتي and !رتبة @user all match.
 */
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ARABIC_FOLD: Array<[RegExp, string]> = [
  [/[أإآٱ]/g, 'ا'],
  [/[ى]/g, 'ي'],
  [/[ؤ]/g, 'و'],
  [/[ئ]/g, 'ي'],
  [/[ة]/g, 'ه'],
  [/[ء]/g, ''],
];

export function normalizeArabic(input: string): string {
  let s = input.replace(TASHKEEL, '');
  for (const [re, to] of ARABIC_FOLD) s = s.replace(re, to);
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Mention forms: @user, user, or a bare name. */
export function parseTarget(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = normalizeArabic(raw.trim().replace(/^@+/, '')).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export interface CommandMatch {
  name: string;
  args: string[];
  rest: string;
}

/**
 * Split "!رتبه abc @x" into a normalized command name and its arguments.
 * The command name may be several words (e.g. !المتصدرين).
 */
export function parseCommand(content: string, prefix: string, aliases: Record<string, string>): CommandMatch | null {
  const normalizedPrefix = normalizeArabic(prefix);
  const normalized = normalizeArabic(content);
  if (normalizedPrefix && !normalized.startsWith(normalizedPrefix)) return null;

  const body = normalizedPrefix ? normalized.slice(normalizedPrefix.length) : normalized;
  const trimmed = body.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(' ');
  // Longest match first so multi-word aliases win over shorter ones.
  for (let take = Math.min(4, tokens.length); take >= 1; take--) {
    const candidate = tokens.slice(0, take).join(' ');
    const canonical = aliases[candidate];
    if (canonical) {
      const rest = tokens.slice(take).join(' ');
      return { name: canonical, args: rest ? rest.split(' ') : [], rest };
    }
  }

  return { name: 'unknown', args: trimmed.split(' '), rest: trimmed };
}

/**
 * Command registry.
 * `!نقاط` / `!points` are intentionally NOT registered: BotRix owns them and
 * their data may not be imported.
 */
export const COMMAND_ALIASES: Record<string, string> = {
  // own rank — !رتبتي only (no short form, so a typo never silently works)
  'رتبتي': 'rank',
  'رتبتيك': 'rank',
  'rank': 'rank',
  // ranks list
  'رتب': 'ranks',
  'ranks': 'ranks',
  'الرتب': 'ranks',
  // leaderboard
  'توب': 'top',
  'top': 'top',
  'المتصدرين': 'top',
  'المتصدرون': 'top',
  // admin
  'addpts': 'addpts',
  'اضافة': 'addpts',
  'اضافه': 'addpts',
  'setpts': 'setpts',
  'تعيين': 'setpts',
  'resetuser': 'resetuser',
  'تصفير': 'resetuser',
  'ranksbot': 'status',
  'حالة': 'status',
};

/** "name 250", "name = 250" or "name -250". */
export function parseAdminArgs(rest: string, allowNegative: boolean): { target: string; amount: number } | null {
  const tokens = rest.replace(/[=:]/g, ' ').split(' ').filter(Boolean);
  if (tokens.length < 2) return null;

  const amount = Number(tokens[tokens.length - 1]);
  if (!Number.isInteger(amount)) return null;
  if (!allowNegative && amount <= 0) return null;

  const target = parseTarget(tokens.slice(0, -1).join(' '));
  if (!target) return null;
  return { target, amount };
}