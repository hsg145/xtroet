import { randomBytes, createHash } from 'node:crypto';
import { env } from '../config.js';
import { getLogger } from '../logger.js';
import { loadAnyToken, loadToken, saveToken, upsertChannel, type TokenRow } from '../db/repo.js';

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const e = env();
  const body = new URLSearchParams({
    client_id: e.KICK_CLIENT_ID,
    client_secret: e.KICK_CLIENT_SECRET,
    ...params,
  });

  const res = await fetch(`${e.KICK_OAUTH_BASE.replace(/\/$/, '')}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    // Never include params (they carry client_secret) in the message.
    throw new Error(`Kick token endpoint returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export function base64UrlSha256(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

/** Client-credentials token, for endpoints that accept an app access token. */
export async function fetchAppToken(): Promise<TokenResponse> {
  return tokenRequest({ grant_type: 'client_credentials' });
}

export function authorizeUrl(params: { codeChallenge: string; state: string }): string {
  const e = env();
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: e.KICK_CLIENT_ID,
    redirect_uri: e.KICK_REDIRECT_URI,
    scope: e.KICK_SCOPES,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
  });
  // Kick's frontend rewrites 127.0.0.1 -> localhost; the sacrificial param
  // documented by Kick keeps redirect_uri untouched.
  const host = new URL(e.KICK_REDIRECT_URI).hostname;
  if (host === '127.0.0.1') q.set('redirect', '127.0.0.1');
  return `${e.KICK_OAUTH_BASE.replace(/\/$/, '')}/oauth/authorize?${q.toString()}`;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const e = env();
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: e.KICK_REDIRECT_URI,
  });
}

export function generateVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Keeps one user access token in memory + the `kick_tokens` table.
 * Refresh is serialized with a promise chain because Kick refresh tokens can
 * be single-use: two concurrent refreshes would invalidate each other.
 */
export class TokenManager {
  private bundle: TokenBundle | null = null;
  private channelId = 0;
  private refreshing: Promise<TokenBundle> | null = null;
  private timer?: NodeJS.Timeout;
  private refreshMarginMs = 5 * 60 * 1000;

  async load(): Promise<TokenBundle> {
    if (this.bundle) return this.bundle;

    let row: TokenRow | null = null;
    try {
      row = this.channelId > 0 ? await loadToken(this.channelId) : await loadAnyToken();
    } catch (err) {
      getLogger().error({ err }, 'could not read kick_tokens -- run `npm run auth` first');
      throw new Error('No Kick token stored. Run: npm run auth');
    }

    if (!row) throw new Error('No Kick token stored. Run: npm run auth');
    this.channelId = row.channel_id;
    this.bundle = {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: new Date(row.expires_at),
      scope: row.scope ?? env().KICK_SCOPES,
    };
    return this.bundle;
  }

  setChannel(id: number): void {
    this.channelId = id;
  }

  /** Store a freshly issued token (called by `npm run auth`). */
  async persist(channelId: number, broadcasterUserId: number, res: TokenResponse): Promise<TokenBundle> {
    const e = env();
    await upsertChannel(channelId, e.KICK_TARGET_CHANNEL_SLUG);
    const expiresIn = res.expires_in ?? 3600;
    const bundle: TokenBundle = {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? '',
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scope: res.scope ?? e.KICK_SCOPES,
    };
    await saveToken({
      channel_id: channelId,
      broadcaster_user_id: broadcasterUserId,
      access_token: bundle.accessToken,
      refresh_token: bundle.refreshToken,
      expires_at: bundle.expiresAt.toISOString(),
      scope: bundle.scope,
    });
    this.channelId = channelId;
    this.bundle = bundle;
    return bundle;
  }

  /** Returns a valid access token, refreshing ~5 min before expiry. */
  async accessToken(): Promise<string> {
    const bundle = await this.load();
    if (bundle.accessToken && bundle.expiresAt.getTime() - Date.now() > this.refreshMarginMs) {
      return bundle.accessToken;
    }
    return (await this.refresh()).accessToken;
  }

  /** Serialized refresh: concurrent callers share one in-flight request. */
  async refresh(): Promise<TokenBundle> {
    if (this.refreshing) return this.refreshing;

    const task = (async () => {
      const current = this.bundle ?? (await this.load());
      if (!current.refreshToken) throw new Error('No refresh token available');

      getLogger().info('refreshing Kick access token');
      const res = await tokenRequest({ grant_type: 'refresh_token', refresh_token: current.refreshToken });

      const next: TokenBundle = {
        accessToken: res.access_token,
        refreshToken: res.refresh_token ?? current.refreshToken,
        expiresAt: new Date(Date.now() + (res.expires_in ?? 3600) * 1000),
        scope: res.scope ?? current.scope,
      };

      await saveToken({
        channel_id: this.channelId,
        broadcaster_user_id: this.channelId,
        access_token: next.accessToken,
        refresh_token: next.refreshToken,
        expires_at: next.expiresAt.toISOString(),
        scope: next.scope,
      });

      this.bundle = next;
      getLogger().info('Kick access token refreshed');
      return next;
    })().finally(() => {
      this.refreshing = null;
    });

    this.refreshing = task;
    return task;
  }

  /** Called when an API call returns 401: invalidate and refresh once. */
  async forceRefresh(): Promise<string> {
    if (this.bundle) this.bundle.expiresAt = new Date(0);
    return (await this.refresh()).accessToken;
  }

  startAutoRefresh(intervalMs = 60_000): void {
    this.stopAutoRefresh();
    this.timer = setInterval(() => {
      this.accessToken().catch((err) => getLogger().error({ err }, 'auto token refresh failed'));
    }, intervalMs);
    this.timer.unref();
  }

  stopAutoRefresh(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

export const tokenManager = new TokenManager();