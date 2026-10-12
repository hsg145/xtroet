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
| `!نقاطي` | your own rank, points and progress to the next one |
| `!رتبتي` | same as `!نقاطي` |
| `!توب` | top 5 on the leaderboard |
| `!رتب` | the full rank ladder |
| `!حالة` | bot status |
| `!addpts <name> <n>` | add points (xtroet only) |
| `!setpts <name> <n>` | set points, may be negative (xtroet only) |
| `!تصفير <name>` | reset a user to zero (xtroet only) |

`!نقاط` (without the ي) stays BotRix's and is deliberately not registered here.

## Points only count during a live broadcast

**Nobody earns a point unless the channel owner has an actual live broadcast
running.** No broadcast = zero points, no matter how many messages anyone
writes.

The gate is `src/core/livestate.ts`. It polls
`GET /public/v1/channels?slug=…` every `LIVE_POLL_MS` (default 20s), reads the
`stream` object, and decides before any point is recorded.

A stream counts as a verified broadcast only when **all** of these hold:

- `broadcaster_user_id` matches the channel the bot is bound to
- `stream.is_live === true` (strict boolean, not a truthy value)
- `stream.start_time` is a real date — Kick sends `0001-01-01T00:00:00Z` when
  nobody is broadcasting, and that is rejected
- `stream.url` and `stream.key` are both present

If `is_live` says yes but `url`/`key` are missing, the signal is only half
there: the gate requires `LIVE_CONFIRM_CHECKS` consecutive readings before it
believes it. One weak reading is never enough.

The gate is **fail-closed** — any doubt means no points:

| Situation | Result |
| --- | --- |
| Bot just started, no poll yet | closed |
| Kick unreachable | keep the last verified answer for up to `LIVE_MAX_STALE_MS`, then close |
| Answer older than `LIVE_MAX_STALE_MS` | closed |
| Channel id not resolved yet | closed |
| One dropped poll right after a broadcast ends | grace period (`LIVE_OFFLINE_GRACE_MS`, 30s) keeps it open so nobody loses points to a blip |

Opening is never delayed by the grace period — only closing is, and only when
Kick has *positively* said the broadcast ended.

When the gate opens or closes, the bot announces it in chat once, and the
`!نقاطي` / `!رتبتي` reply adds a second line reminding everyone that points
only count while Nasser is broadcasting.

## التثبيت — a real 1-minute channel timeout

The dashboard's **التثبيت** button is not the bot's point mute. It calls
Kick's moderation API, so the user genuinely cannot write in chat for one
full minute. The duration is fixed at 1 and cannot be changed from the UI.

### Required once: re-authorize with the new scope

The stored token was minted before `moderation:ban` existed, so Kick answers
401 until you re-link:

```
cd BOT
npm run auth
```

That flow now requests
`user:read channel:read chat:write events:subscribe moderation:ban`.
Until then the button answers `needs_reauth` ("أعد ربط البوت") instead of
pretending it worked.

### How it is wired

| Layer | What |
| --- | --- |
| `src/kick/api.ts` | `timeoutUser()` posts to `/public/v1/moderation/bans` with `duration: 1`; `untimeoutUser()` deletes it. A 401 surfaces as `KickApiError`, never swallowed. |
| `api/admin.ts` | `user_pin` / `user_unpin`. Reads the Kick token from `kick_tokens`, calls Kick, maps 401/403 to `needs_reauth`. |
| Dashboard → Users | **التثبيت** (fixed 1m, pin icon) and **فك التثبيت** next to the point mute, plus quick `+10/+50/+100/+500` point buttons, a Kick-profile link, copy-name, full reset (points + boost + unmute) and refresh. |

`GET /health` reports the whole gate state under `live` — open/closed, why,
last check, viewer count, and how many times it has flipped.

To turn the rule off temporarily (maintenance only):

```
LIVE_REQUIRED_BOT=false
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `LIVE_REQUIRED_BOT` | `true` | master switch — `false` counts points always |
| `LIVE_POLL_MS_BOT` | `20000` | how often Kick is asked |
| `LIVE_MAX_STALE_MS_BOT` | `90000` | when the last verified answer expires |
| `LIVE_OFFLINE_GRACE_MS_BOT` | `30000` | absorb one lost poll after a stream ends |
| `LIVE_CONFIRM_CHECKS_BOT` | `2` | consecutive weak readings needed to trust one |

Admin commands (`!addpts`, `!setpts`, `!تصفير`) are never gated — the owner can
still fix the leaderboard at any time.

## تحدي رايس — one person against the whole chat

A challenge between one member (Nasser / Raees / the admin) and the entire
chat. The admin controls every step from the **Challenge** tab in the
dashboard; the bot announces and executes.

### Required setup — run these once, in order

```
supabase/migrations/007_challenge.sql
supabase/migrations/008_challenge_preset.sql
```

Supabase Dashboard → SQL Editor → New query → paste → Run. Both are
idempotent, so running them twice is harmless. **008 is required** — without
it the API returns `db_error` and the tab says so instead of silently
pretending there is no activity.

### The flow

| Step | Who | What happens |
| --- | --- | --- |
| 1 | Admin | Type the **activity name**, pick the reward and the penalty, then press **ابدأ الفعالية**. The bot announces it in chat with that name within ~2s. |
| 2 | — | Points count normally, which means **only while a broadcast is live** (see the live gate above). |
| 3 | Admin | Press **أوقف** and pick the winner: Nasser, or the chat. |
| 4 | Bot | Picks a keyword at random from `!MT` / `!ناصر` / `!PM` / `!دخول` and announces it. |
| 5 | Chat | Everyone types the keyword. Each person is counted **once**, however many times they type it. The bot says **nothing** — the dashboard counter updates every 2s and that is the only feedback, so 100+ people typing does not flood the chat. |
| 6 | Admin | Press **إيقاف وتطبيق**. The option chosen in step 1 for whichever side won is applied. |

There is no timer on step 5 — it ends when the admin presses stop.

### Rewards and penalties, chosen up front

The admin picks both before the activity starts, so nothing is a surprise at
the end. Whoever lost is the one who receives it.

| If the chat wins | If Nasser wins |
| --- | --- |
| 🎁 **توزيع نقاط** — `+N` each | 💥 **تخريب** — half a point per message (`multiplier 0.5`) |
| ⚡ **تربل** — points doubled (`multiplier 2`) | 🕊️ **ما في عقاب** |
| 😐 **ما في جائزة** | |

Both take a duration in minutes (except `distribute`, which takes an amount).
Validation is on the server: `distribute` without an amount is rejected, and
so is a penalty with no duration, rather than silently applying zero.

`multiplier` is the same column the dashboard's boosts use, and `admin-state`
re-reads it every 15s, so the effect starts on its own.

### Running it twice is impossible

`apply_challenge_reward()` takes a `FOR UPDATE` row lock, returns early when
`applied_at` is already set, and marks it at the end. Pressing the button
five times still distributes once. It reads `winner` from the row and picks
the branch itself — the admin cannot send a reward the activity did not
declare.

### No duplicates, guaranteed by the database

`challenge_entries` has `primary key (challenge_id, kick_user_id)`. A user who
types the keyword twenty times gets one row — Postgres discards the other
nineteen. The bot's in-memory `Set` is only there to answer fast; the
constraint is the real guarantee.

One activity can be active per channel at a time, enforced by a partial
unique index rather than only by the UI.

### The site lags the points by up to 3 minutes

`/api/leaderboard` is cached (`s-maxage=45, stale-while-revalidate=180`), so
right after a distribution the public board can still show the old number for
a minute or three. The points are already in the database; refresh after a
little while, or check `/health`.

### Live state

`GET /health` reports the challenge under `challenge`: status, the keyword
while collecting, and how many people have entered.

### Keeping Supabase logs (and the free quota) small

The bot is designed to ask the database almost nothing while nothing is
happening — query volume is what burns the Log Ingestion quota:

| What | When quiet | When active |
| --- | --- | --- |
| Challenge watcher | 1 query / 30s | every 2s |
| Team battle watcher | 1 query / 30s | every 2s |
| Point flusher | no query at all (empty batch is skipped in memory) | 1 RPC per tick |
| Admin promos | every 15s (mutes must land fast) | every 15s |
| Outbox announcements | 1 cheap query / 5s | 1 cheap query / 5s |
| Ranks | every 5 min | every 5 min |

The two watchers used to poll every 2 seconds around the clock — about
86,000 queries a day just to ask "anything new?". Adaptive polling cut that
to ~6,000. An announcement after creating something from the dashboard can
lag up to 30 seconds in the worst case; that is the trade, and it is worth
it.

## معركة الفرق — the chat against itself

Teams from chat compete against each other (unlike the challenge, which is
one person against everyone). Nasser sets it all up from the **Teams** tab.

### Required setup — run this once

```
supabase/migrations/009_team_battle.sql
```

Idempotent. Without it the tab says which migration to run instead of
pretending nothing exists.

### The flow

| Step | Who | What happens |
| --- | --- | --- |
| 1 | Nasser | Type the battle name, add 2–8 teams, pick the winner reward and the loser penalty, then press **ابدأ التصويت**. The bot announces the teams. |
| 2 | Chat | Everyone types their exact team name. **One vote each** — the first counts, the rest are ignored, even for a different team. Counters update live every 2s. The bot stays silent. |
| 3 | Nasser | Press **ابدأ الفعالية**. Points count (live broadcast only, same gate). |
| 4 | Nasser | Pick the winning team (final, with confirmation). |
| 5 | Nasser | Press **إنهاء وتطبيق**. Distribution is immediate; double hits **only the winning team's members**; sabotage hits **only the losers**. |

### Voting matches exactly — on purpose

`ناصر`, `الناصر` and `!ناصر` all vote for the same team (the definite
article and `!` are stripped after Arabic normalization). But `وين ناصر؟`
does not vote — a vote must be deliberate, so a passing sentence never
joins anyone to a team.

Two team names that normalize to the same value (like `الأحمر` and
`الاحمر`) are rejected as duplicates at creation, because one vote would
match both and nobody could tell them apart.

### No double votes, guaranteed by the database

`team_votes` has `primary key (battle_id, kick_user_id)`. Typing twenty
times still records one row. Changing your mind is not allowed by design:
the first vote stands.

`apply_team_reward()` locks the row, returns early on `applied_at`, and
applies each branch only to that branch's members — winners never receive
the losers' penalty and vice versa. One active battle per channel, enforced
by a partial unique index.

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