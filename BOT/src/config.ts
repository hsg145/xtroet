import dotenv from 'dotenv';
import { z } from 'zod';

// override: .env wins over inherited process env vars. Otherwise a stale
// machine-level SUPABASE_URL silently points the bot at another project.
// Skipped in tests: test/setup.ts injects fake values and a real .env must
// never be able to influence a test run.
if (process.env.NODE_ENV !== 'test') dotenv.config({ override: true });

/**
 * كل متغيرات البوت تنتهي بـ _BOT داخل .env حتى لا تختلط بمتغيرات الموقع
 * (الموقع يستعمل SUPABASE_URL و KICK_CLIENT_* بقيمة مختلفة تماماً).
 * هنا نترجم الاسم المُلاحق إلى الاسم الداخلي مرة واحدة، فبقية الكود
 * ما يتأثر ويقرأ e.SUPABASE_URL كالمعتاد.
 */
const BOT_SUFFIX = '_BOT';

const BOT_ENV_KEYS = [
  'KICK_CLIENT_ID',
  'KICK_CLIENT_SECRET',
  'KICK_REDIRECT_URI',
  'KICK_TARGET_CHANNEL_SLUG',
  'KICK_SENDER_TYPE',
  'KICK_SCOPES',
  'KICK_API_BASE',
  'KICK_OAUTH_BASE',
  'KICK_CHATROOM_ID',
  'KICK_PUBLIC_KEY_PEM',
  'PUSHER_WATCHDOG_SECONDS',
  'PUSHER_BACKOFF_MAX_MS',
  'INGEST_MODE',
  'PUBLIC_BASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PORT',
  'NODE_ENV',
  'LOG_LEVEL',
  'TEST_MODE',
  'COMMAND_PREFIX',
  'POINTS_COOLDOWN_SECONDS',
  'FLUSH_INTERVAL_MS',
  'ANNOUNCE_RANKUPS',
  'IGNORED_USERNAMES',
  'ADMIN_USER_IDS',
  'RANKS_REFRESH_MS',
  'SUBSCRIPTION_REFRESH_MS',
  'EVENT_IDLE_WARN_SECONDS',
  'COMMAND_COOLDOWN_SECONDS',
  'GLOBAL_COMMAND_COOLDOWN_MS',
  'DUPLICATE_WINDOW_SECONDS',
  'MIN_MESSAGE_LENGTH',
  'CACHE_TTL_MS',
  'MAX_QUEUE_SIZE',
  'SEND_INTERVAL_MS',
  'POINTS_MIN',
  'CODE_VERIFIER',
  'CHAT_SOURCE',
] as const;

/** { KICK_CLIENT_ID_BOT: 'x' } → { KICK_CLIENT_ID: 'x' } */
function normalizeBotEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...source };
  for (const key of BOT_ENV_KEYS) {
    const suffixed = `${key}${BOT_SUFFIX}`;
    const value = source[suffixed];
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())));

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int());

const csv = (def: string[]) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v === undefined || v === '' ? def : v.split(',').map((s) => s.trim()).filter(Boolean)),
    );

const envSchema = z
  .object({
    // --- Kick app ---
    KICK_CLIENT_ID: z.string().min(1, 'Kick app Client ID is required'),
    KICK_CLIENT_SECRET: z.string().min(1, 'Kick app Client Secret is required'),
    KICK_REDIRECT_URI: z.string().url('KICK_REDIRECT_URI must be a URL'),
    KICK_TARGET_CHANNEL_SLUG: z.string().min(1, 'KICK_TARGET_CHANNEL_SLUG is required'),
    KICK_SENDER_TYPE: z.enum(['user', 'bot']).default('bot'),
    KICK_SCOPES: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : 'user:read channel:read chat:write events:subscribe')),
    KICK_API_BASE: z.string().optional().default('https://api.kick.com'),
    KICK_OAUTH_BASE: z.string().optional().default('https://id.kick.com'),

    // --- Chat ingestion ---
    // pusher  = WebSocket only (default; no tunnel, no public URL)
    // webhook = official webhooks only (needs PUBLIC_BASE_URL)
    // both    = run both sources; MessageDedupe keeps them from double counting
    INGEST_MODE: z.enum(['pusher', 'webhook', 'both']).default('pusher'),
    /** Pusher needs the chatroom id, which is NOT the broadcaster user id. */
    KICK_CHATROOM_ID: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v.trim() === '' ? undefined : Number(v)))
      .pipe(z.number().int().positive().optional()),
    /** Pusher tuning. */
    PUSHER_WATCHDOG_SECONDS: int(120).pipe(z.number().min(30)),
    PUSHER_BACKOFF_MAX_MS: int(30_000).pipe(z.number().min(1000)),

    // --- Public URL (tunnel) — only needed when INGEST_MODE includes webhook ---
    PUBLIC_BASE_URL: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? '' : v.trim()))
      .refine((v) => v === '' || /^https:\/\//i.test(v), {
        message: 'PUBLIC_BASE_URL must start with https:// (Cloudflare tunnel URL)',
      }),

    // --- Supabase ---
    SUPABASE_URL: z.string().url('SUPABASE_URL is required'),
    SUPABASE_SECRET_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    // --- Server ---
    PORT: int(3000).pipe(z.number().min(1).max(65535)),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    TEST_MODE: bool(false),

    // --- Behaviour ---
    COMMAND_PREFIX: z.string().default('!'),
    POINTS_COOLDOWN_SECONDS: int(10).pipe(z.number().min(0)),
    FLUSH_INTERVAL_MS: int(1000).pipe(z.number().min(100)),
    ANNOUNCE_RANKUPS: bool(true),
    IGNORED_USERNAMES: csv(['botrix', 'kickbot', 'nightbot']),
    ADMIN_USER_IDS: csv([]),
    RANKS_REFRESH_MS: int(300_000).pipe(z.number().min(10_000)),
    SUBSCRIPTION_REFRESH_MS: int(600_000).pipe(z.number().min(60_000)),
    EVENT_IDLE_WARN_SECONDS: int(900).pipe(z.number().min(60)),
    COMMAND_COOLDOWN_SECONDS: int(5).pipe(z.number().min(0)),
    GLOBAL_COMMAND_COOLDOWN_MS: int(1000).pipe(z.number().min(0)),
    DUPLICATE_WINDOW_SECONDS: int(60).pipe(z.number().min(0)),
    MIN_MESSAGE_LENGTH: int(2).pipe(z.number().min(1)),
    CACHE_TTL_MS: int(21_600_000).pipe(z.number().min(60_000)),
    MAX_QUEUE_SIZE: int(50).pipe(z.number().min(1)),
    SEND_INTERVAL_MS: int(1200).pipe(z.number().min(200)),
    POINTS_MIN: bool(true),
  })
  .superRefine((env, ctx) => {
    if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_SECRET_KEY'],
        message: 'Set SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY)',
      });
    }
    // Only webhook modes need a public URL.
    if (env.INGEST_MODE !== 'pusher' && env.PUBLIC_BASE_URL === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_BASE_URL'],
        message: `INGEST_MODE=${env.INGEST_MODE} needs a public https URL (set PUBLIC_BASE_URL, or use INGEST_MODE=pusher)`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(normalizeBotEnv(source));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function env(): Env {
  if (!cached) return loadEnv();
  return cached;
}

/** Server-only Supabase key. Never the publishable/anon key. */
export function supabaseSecretKey(e: Env = env()): string {
  const key = e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('No Supabase server key configured');
  return key;
}

export function adminUserIds(e: Env = env()): Set<number> {
  return new Set(e.ADMIN_USER_IDS.map((id) => Number(id)).filter((n) => Number.isFinite(n)));
}