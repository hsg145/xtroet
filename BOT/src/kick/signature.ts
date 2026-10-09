import {
  createPublicKey,
  createVerify,
  type KeyObject,
} from 'node:crypto';
import { env } from '../config.js';
import { getLogger } from '../logger.js';

export interface SignatureHeaders {
  messageId: string;
  timestamp: string;
  signature: string;
  eventType: string;
  subscriptionId?: string;
  version?: string;
}

export class SignatureError extends Error {}

const MAX_TOLERANCE_MS = 5 * 60 * 1000;

/** Parse a PEM public key (SPKI or PKCS#1 RSA). */
export function parsePublicKey(pem: string): KeyObject {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'rsa') {
    throw new SignatureError(`Unexpected key type: ${String(key.asymmetricKeyType)}`);
  }
  return key;
}

/**
 * Verify a Kick webhook signature.
 *
 * Signed payload: `${messageId}.${timestamp}.${rawBody}` (raw bytes, never
 * re-serialized JSON), RSA-SHA256 PKCS#1 v1.5, base64 signature.
 */
export function verifySignature(key: KeyObject, rawBody: Buffer, headers: SignatureHeaders, now = Date.now()): void {
  if (!headers.messageId) throw new SignatureError('missing Kick-Event-Message-Id');
  if (!headers.timestamp) throw new SignatureError('missing Kick-Event-Message-Timestamp');
  if (!headers.signature) throw new SignatureError('missing Kick-Event-Signature');

  const ts = Date.parse(headers.timestamp);
  if (Number.isNaN(ts)) throw new SignatureError('unparseable Kick-Event-Message-Timestamp');
  if (Math.abs(now - ts) > MAX_TOLERANCE_MS) {
    throw new SignatureError('Kick-Event-Message-Timestamp outside the 5 minute window');
  }

  const payload = Buffer.concat([
    Buffer.from(`${headers.messageId}.${headers.timestamp}.`, 'utf8'),
    rawBody,
  ]);

  const verifier = createVerify('RSA-SHA256');
  verifier.update(payload);
  verifier.end();

  let ok = false;
  try {
    ok = verifier.verify(key, Buffer.from(headers.signature, 'base64'));
  } catch (err) {
    throw new SignatureError(`signature verification error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!ok) throw new SignatureError('signature mismatch');
}

/**
 * Fetches and caches Kick's rotating public key.
 * Docs: GET https://api.kick.com/public/v1/public-key -> { data: { public_key } }
 * The response may be JSON-wrapped or raw PEM, so handle both.
 */
export class PublicKeyCache {
  private key: KeyObject | null = null;
  private fetchedAt = 0;
  private ttlMs: number;

  constructor(ttlMs = 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Manual override, mainly for tests and offline runs. */
  set(pem: string): void {
    this.key = parsePublicKey(pem);
    this.fetchedAt = Date.now();
  }

  async get(): Promise<KeyObject> {
    if (this.key && Date.now() - this.fetchedAt < this.ttlMs) return this.key;

    const override = process.env.KICK_PUBLIC_KEY_PEM;
    if (override) {
      this.set(override);
      return this.key!;
    }

    const base = env().KICK_API_BASE;
    const url = `${base.replace(/\/$/, '')}/public/v1/public-key`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new SignatureError(`public-key endpoint returned ${res.status}`);

    const text = await res.text();
    let pem = text.trim();
    if (pem.startsWith('{')) {
      const parsed: unknown = JSON.parse(text);
      const maybe =
        (parsed as { data?: { public_key?: string } })?.data?.public_key ??
        (parsed as { public_key?: string })?.public_key;
      if (!maybe) throw new SignatureError('public-key response had no public_key field');
      pem = maybe;
    }

    this.set(pem);
    getLogger().debug({ url }, 'kick public key fetched');
    return this.key!;
  }
}

/**
 * Drift between the local clock and Kick's, in milliseconds.
 *
 * verifySignature() rejects anything outside a 5 minute window, so a PC whose
 * clock is off by more than that silently drops every event — and Kick then
 * unsubscribes the app. Positive means the PC is behind.
 *
 * Pure helper so it can be unit-tested; `measureClockSkew` does the network.
 */
export function clockSkewMs(kickDateHeader: string | null, localNow = Date.now()): number | null {
  if (!kickDateHeader) return null;
  const kick = Date.parse(kickDateHeader);
  if (Number.isNaN(kick)) return null;
  return kick - localNow;
}

export const CLOCK_SKEW_WARN_SECONDS = 60;

/** Ask Kick for its idea of "now" and compare it with ours. */
export async function measureClockSkew(apiBase = 'https://api.kick.com'): Promise<number | null> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/public/v1/public-key`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    return clockSkewMs(res.headers.get('date'), Date.now());
  } catch {
    return null;
  }
}

/**
 * Warns loudly when the local clock would break signature verification.
 * Returns the drift in seconds, or null when it could not be measured.
 */
export async function warnOnClockSkew(
  apiBase = 'https://api.kick.com',
  warnSeconds = CLOCK_SKEW_WARN_SECONDS,
): Promise<number | null> {
  const skewMs = await measureClockSkew(apiBase);
  if (skewMs === null) return null;
  const skewSec = Math.round(skewMs / 1000);
  if (Math.abs(skewSec) > warnSeconds) {
    getLogger().warn(
      { skewSec },
      `Your PC clock is off by ${skewSec}s; webhook signatures will be rejected. Sync the Windows clock (Settings > Time & language > Date & time).`,
    );
  }
  return skewSec;
}

export const publicKeyCache = new PublicKeyCache();