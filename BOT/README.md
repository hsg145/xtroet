# RanksBot

A Kick chat bot that awards points per message, tracks 15 rank tiers, announces
rank-ups, and answers commands — backed by Supabase.

## Env vars: always suffixed `_BOT`

Every variable in `.env` ends with `_BOT` (`KICK_CLIENT_ID_BOT`,
`SUPABASE_URL_BOT`, `PORT_BOT`, …). The site at the repo root uses the *same*
names (`KICK_CLIENT_ID`, `SUPABASE_URL`, …) with completely different values,
so the suffix is what stops them mixing on Railway/Vercel/local.

`src/config.ts` maps `X_BOT → X` once at load (`normalizeBotEnv`), so all the
rest of the code reads the plain names (`e.SUPABASE_URL`). Rename nothing in
source; just use the `_BOT` name in the env file and on your host's dashboard.

The site's own OAuth (`/api/kick-login`) reads the **unsuffixed** names in the
site's Vercel project — that is intentional, they are two separate deployments.

## Run it locally (normal way — no tunnel, no public URL)

```powershell
npm install
npm run doctor      # one command that finds whichever stage is broken
npm start
```

The default `INGEST_MODE=pusher` reads chat from the same WebSocket feed
kick.com's own website uses. **Nothing is exposed to the internet and no tunnel
is involved**, so the bot works on a laptop and survives without any DNS or
dashboard changes.

If you do not know your chatroom id yet, `npm run doctor` and `npm start` will
print instructions: open `https://kick.com/api/v2/channels/<slug>` in your
browser, find `"chatroom":{"id":NUMBER`, and put that number in `.env` as
`KICK_CHATROOM_ID_BOT`.

## Commands

| Command | Meaning |
| --- | --- |
| `!رتبة` | your own rank, points and progress to the next one |
| `!توب` | top 5 on the leaderboard |
| `!رتب` | the full rank ladder |
| `!حالة` | bot status |
| `!addpts <name> <n>` | add points (xtroet only) |
| `!setpts <name> <n>` | set points, may be negative (xtroet only) |
| `!تصفير <name>` | reset a user to zero (xtroet only) |

Each normal chat message is worth +1 point, subject to
`POINTS_COOLDOWN_SECONDS` (default 10s).

## Commands you may need

| Command | What it does |
| --- | --- |
| `npm run doctor` | Checks config, Node, Supabase, Kick token/scopes, chatroom id, a live Pusher connect, clock skew, and (with `--send`) actually posts a message. Exits non-zero on failure. |
| `npm run doctor -- --send` | Adds a real `✅ RanksBot متصل` post to your channel, proving `chat:write` works. |
| `npm run simulate -- --dry --user alice --msg hello` | Feeds fake messages through the real router + real database with no Kick connection at all. If this works but live chat does not, the fault is ingestion, not the engine. |
| `npm run auth` | OAuth (PKCE) login. Authorise with the account that **owns** the channel. |
| `npm run resubscribe` | Deletes and recreates the `chat.message.sent` webhook subscription, re-binding it to the current URL. |
| `npm run launch` | **webhook mode only.** Starts a Cloudflare quick tunnel, updates `PUBLIC_BASE_URL`, then starts the bot. |
| `npm run typecheck` / `npm test` | Strict TypeScript check and the test suite. |

## Webhook mode (optional, for a VPS)

Kick's official webhooks need a stable public HTTPS URL, so they do not work
from a laptop with a changing tunnel hostname. Set `INGEST_MODE=webhook`, give
the bot a fixed URL on a VPS, put `<url>/webhooks/kick` in the Kick developer
dashboard with the **Enable webhooks** switch on, then `npm start`. `both` runs
the two sources together; a shared dedupe means a message is never counted
twice.

`GET /health` reports `ingest.pusher` and `ingest.webhook`, including
`lastHitAt`, `lastRejectReason` and whether any event has actually been
delivered — a listed subscription is not proof of delivery, so the readiness
banner says so instead of claiming success.

## Setup

1. Create a Kick app at <https://kicks.com/developer>. Add
   `https://ixtroet.vercel.app/api/kick-callback` as a redirect URI (plus
   `http://localhost:3000/callback` for local `npm run auth`) and enable the
   scopes `user:read channel:read chat:write events:subscribe`. Leave
   "webhook" off — pusher mode needs no public URL.
2. Create a Supabase project and run `supabase/migrations/001_init.sql`, then
   `002_fix_rpc.sql`, then `003_rank_emoji.sql`, then `004_first_lieutenant.sql`,
   then `005_double_points.sql`, then `006_admin.sql` in the SQL editor.
3. Link the channel from the website (`/api/kick-login` on the site). That writes
   the `channels` and `kick_tokens` rows — without the `channels` row the
   `apply_points` RPC fails its foreign key.
4. Copy `.env.example` to `.env`, fill it in (keep every `_BOT` suffix), and put
   the chatroom id from step "chatroom id" above into `KICK_CHATROOM_ID_BOT`.
5. `npm run doctor`, then `npm run auth` if the token check fails.

## Admin dashboard (site section `#admin`, owner only)

A password-locked control room on the website (needs `ADMIN_PASSWORD` in the
site's Vercel env): user points/rank/reset, timeouts (work on moderators too),
per-user boosts and punishments (2x/3x/half/freeze), global events
(double/triple/sabotage with durations), hidden drop codes, rank-price editing
(live everywhere), manual chat announcements, and a full audit log. Login is
HMAC-token based (12h), 10 wrong passwords per device/IP = 24h lockout.

The bot polls the `006_admin.sql` tables every 15s and enforces everything in
the points engine (integer-safe: fractional multipliers bank credit until whole
points), and drains `bot_outbox` into chat every 5s. No bot restart needed.

## Hosting the bot (Railway)

Root directory `BOT` — Railway reads `railway.json` automatically. Add the same
variables **with the `_BOT` suffix** in Railway's Variables tab, then set
`PUBLIC_BASE_URL_BOT` to the generated Railway domain.

## Notes

- Tokens are stored in Supabase (`kick_tokens`) and refreshed automatically.
  They are never written to disk or to logs.
- The only server key used is the Supabase secret key; the bot never uses the
  publishable/anon key.
- Unofficial Pusher constants live in exactly one file,
  `src/kick/pusher-constants.ts`, with the verification log. If Kick rotates the
  host or app key, that is the only file to update.