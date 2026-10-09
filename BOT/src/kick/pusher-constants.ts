/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  UNOFFICIAL — every value in this file is a reverse-engineered detail of
 *  Kick's own web client. None of it is documented by Kick and any of it can
 *  change without notice. Keep it all in ONE file so there is a single place
 *  to update when Kick rotates something.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * VERIFICATION LOG (2026-10-07, this machine, live network calls):
 *
 *  1. WebSocket URL + app key — CONFIRMED WORKING.
 *     `wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false`
 *     A real connection returned:
 *       {"event":"pusher:connection_established",
 *        "data":"{\"socket_id\":\"1741601.5307187\",\"activity_timeout\":120}"}
 *     so `activity_timeout` is 120s, which sets our watchdog threshold.
 *     Note: `version=8.4.0-rc2` and `version=7.6.0` also work; the non-rc
 *     string is what kick.com's current bundle uses.
 *
 *  2. Cluster / host — CONFIRMED. Community implementations (docs.rs
 *     `kick_api::live_chat`, Pkkls/kick-core, epjane/kick-chat-wrapper,
 *     public gists) all hard-code `ws-us2.pusher.com` and cluster `us2` with
 *     this same key. Verified by live connect above.
 *
 *  3. Channel shape — CONFIRMED. Subscribing anonymously to
 *     `chatrooms.<chatroomId>.v2` with `auth: ""` returned
 *     `pusher_internal:subscription_succeeded` (tested against two known
 *     public chatroom ids). The `.v2` suffix is required.
 *
 *  4. Chat event name — CONFIRMED by every community implementation:
 *     `App\Events\ChatMessageEvent` (single backslashes; in JSON source it is
 *     written `"App\\Events\\ChatMessageEvent"`).
 *
 *  5. Double-encoded `data` — CONFIRMED. The frame looks like
 *     {"event":"App\\Events\\ChatMessageEvent","channel":"...","data":"{...}"}
 *     where `data` is a JSON *string* and must be parsed a second time.
 *
 *  6. Chatroom id is NOT the broadcaster user id — CONFIRMED. It comes from
 *     `kick.com/api/v2/channels/<slug>` → `chatroom.id`. That endpoint is
 *     Cloudflare-protected and returns HTTP 403 "Request blocked by security
 *     policy" to plain fetch() from a server, so we can only try; the user
 *     may have to read the number from their browser and set
 *     KICK_CHATROOM_ID. The official api.kick.com channel payload does NOT
 *     contain a chatroom field (checked: keys are broadcaster_user_id, slug,
 *     channel_description, banner_picture, stream, stream_title, category,
 *     active_subscribers_count, active_gifted_subscribers_count,
 *     canceled_subscribers_count).
 *
 *  REJECTED: a third-party README (Pkkls/kick-core) claimed Kick "left the
 *  hosted Pusher cloud" and that this endpoint returns `4001 App key not in
 *  this cluster`, suggesting `wss://websockets.kick.com/viewer/v1/connect`.
 *  Empirically FALSE as of the verification date: this endpoint connected and
 *  subscribed successfully. That project also documents its own gateway as
 *  browser-extension-only. We do not implement the token-based gateway: it
 *  requires session cookies, so it cannot run server-side, and Kick's own
 *  docs state webhooks + the public API are the supported server paths.
 */

/** Pusher cluster host used by kick.com. */
export const PUSHER_HOST = 'ws-us2.pusher.com';

/** Public, non-secret Pusher application key baked into kick.com's bundle. */
export const PUSHER_APP_KEY = '32cbd69e4b950bf97679';

/** Pusher cluster name (informational; the host already encodes it). */
export const PUSHER_CLUSTER = 'us2';

/** Pusher protocol / client version advertised in the query string. */
export const PUSHER_PROTOCOL = 7;
export const PUSHER_CLIENT_VERSION = '8.4.0';
export const PUSHER_CLIENT = 'js';

/** Reported by `pusher:connection_established` as `activity_timeout` (120). */
export const PUSHER_ACTIVITY_TIMEOUT_MS = 120_000;

/** Full anonymous chat WebSocket URL. */
export function pusherWsUrl(): string {
  const q = new URLSearchParams({
    protocol: String(PUSHER_PROTOCOL),
    client: PUSHER_CLIENT,
    version: PUSHER_CLIENT_VERSION,
    flash: 'false',
  });
  return `wss://${PUSHER_HOST}/app/${PUSHER_APP_KEY}?${q.toString()}`;
}

/** Anonymous channel carrying chat traffic for one chatroom. */
export function chatroomChannel(chatroomId: number): string {
  return `chatrooms.${chatroomId}.v2`;
}

/** The only event we treat as a chat message. */
export const PUSHER_EVENT_CHAT_MESSAGE = 'App\\Events\\ChatMessageEvent';

/** Protocol-level control frames. */
export const PUSHER_EVENT_CONNECTION_ESTABLISHED = 'pusher:connection_established';
export const PUSHER_EVENT_PING = 'pusher:ping';
export const PUSHER_EVENT_PONG = 'pusher:pong';
export const PUSHER_EVENT_ERROR = 'pusher:error';
export const PUSHER_EVENT_SUBSCRIPTION_SUCCEEDED = 'pusher_internal:subscription_succeeded';

/** message `type` values that are real chat messages. */
export const PUSHER_MESSAGE_TYPE = 'message';

/** Browser-ish headers for the (Cloudflare-protected) chatroom lookup. */
export const KICK_WEB_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer: 'https://kick.com',
  origin: 'https://kick.com',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
};

// ─────────────────────────────────────────────────────────────────────────────
// Manual chatroom-id instructions (kick.com/api/v2 is behind a WAF, so a
// server-side lookup usually returns 403 and only the user can read the id).
// ─────────────────────────────────────────────────────────────────────────────

export function CHATROOM_ID_HELP_EN(slug: string): string {
  return (
    `Could not resolve the Kick chatroom id for "${slug}" automatically.\n` +
    `  Open this link in your normal browser:  https://kick.com/api/v2/channels/${slug}\n` +
    `  Find  "chatroom":{"id":NUMBER  and put that NUMBER in your .env as:\n` +
    `      KICK_CHATROOM_ID=NUMBER\n` +
    `  then restart the bot.`
  );
}

export function CHATROOM_ID_HELP_AR(slug: string): string {
  return (
    `\n  ما قدرت أعرف رقم الـ chatroom للقناة "${slug}".\n` +
    `  افتح هالرابط بمتصفحك العادي:  https://kick.com/api/v2/channels/${slug}\n` +
    `  دوّر على  "chatroom":{"id":NUMBER  وخذ الرقم، وحطه بملف .env:\n` +
    `      KICK_CHATROOM_ID=NUMBER\n` +
    `  وبعدين أعد تشغيل البوت.`
  );
}