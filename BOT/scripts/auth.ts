/**
 * npm run auth
 *
 * PKCE Authorization Code flow against Kick's OAuth server (id.kick.com).
 * Starts a temporary listener on KICK_REDIRECT_URI, prints/opens the authorize
 * URL, exchanges the code, and stores the tokens in the `kick_tokens` table.
 * Tokens never touch the filesystem.
 *
 * Authorize with the account that OWNS the target channel.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { authorizeUrl, base64UrlSha256, exchangeCode, generateVerifier } from '../src/kick/oauth.js';
import { env } from '../src/config.js';
import { getOwnChannel, getChannelBySlug } from '../src/kick/api.js';
import { upsertChannel } from '../src/db/repo.js';
import { tokenManager } from '../src/kick/oauth.js';

const e = env();

function openBrowser(url: string): void {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  spawn(cmd, { shell: true, detached: true, stdio: 'ignore' }).unref();
}

async function main(): Promise<void> {
  const redirectUri = new URL(e.KICK_REDIRECT_URI);
  const port = Number(redirectUri.port || 3000);

  console.log('\n🔐 RanksBot — Kick OAuth (PKCE)\n');
  console.log(`  channel target : ${e.KICK_TARGET_CHANNEL_SLUG}`);
  console.log(`  redirect uri   : ${e.KICK_REDIRECT_URI}`);
  console.log(`  scopes         : ${e.KICK_SCOPES}\n`);
  console.log('  ⚠️  Authorize with the account that OWNS that channel, otherwise');
  console.log('      chat:write and events:subscribe will not cover it.\n');

  const verifier = generateVerifier();
  const challenge = base64UrlSha256(verifier);
  const state = generateVerifier();
  const url = authorizeUrl({ codeChallenge: challenge, state });

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (reqUrl.pathname !== redirectUri.pathname) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const err = reqUrl.searchParams.get('error');
      const gotState = reqUrl.searchParams.get('state') ?? '';
      const gotCode = reqUrl.searchParams.get('code') ?? '';

      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (err) {
        res.end('<html dir="rtl"><body>❌ فشل التفويض. اقفل النافذة.</body></html>');
        server.close();
        reject(new Error(`Authorization denied: ${err}`));
        return;
      }
      if (gotState !== state) {
        res.end('<html dir="rtl"><body>❌ state غير مطابق. اقفل النافذة.</body></html>');
        server.close();
        reject(new Error('state mismatch'));
        return;
      }
      res.end(
        '<html dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem">' +
          '<h2>✅ تم بنجاح!</h2><p>ارجع للطرفية. تقدر تقفل النافذة.</p></body></html>',
      );
      setTimeout(() => {
        server.close();
        resolve(gotCode);
      }, 300);
    });

    server.on('error', reject);
    server.listen(port, () => {
      console.log('  ⏳ waiting for the redirect on ' + redirectUri.origin + redirectUri.pathname);
      console.log('  🔗 ' + url + '\n');
      openBrowser(url);
    });
  });

  console.log('  ↩️  got the code, exchanging…');
  const token = await exchangeCode(code, verifier);
  if (!token.refresh_token) throw new Error('Kick did not return a refresh token');

  const userToken = token.access_token;
  console.log(`     token acquired (${userToken.length} chars, scope: ${token.scope ?? 'n/a'})`);

  // Resolve the TARGET channel (from .env), not just any channel the account
// happens to own. When you authorise with a bot account that also has its own
// channel, getOwnChannel() would return that one instead, and the token would
// be stored against the wrong channel_id.
let channel = await getChannelBySlug(e.KICK_TARGET_CHANNEL_SLUG, userToken).catch(() => null);
if (!channel) {
  channel = await getOwnChannel(userToken).catch(() => null);
}
if (!channel) {
    // Almost always one of two things, so say which.
    const probe = await fetch(
      `${e.KICK_API_BASE.replace(/\/$/, '')}/public/v1/channels`,
      { headers: { authorization: `Bearer ${userToken}`, accept: 'application/json' } },
    )
      .then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 200) }))
      .catch((err) => ({ status: 0, body: String(err) }));

    console.error('\n❌ The token is valid but Kick returned no channel for it.\n');
    console.error(`   GET /public/v1/channels → HTTP ${probe.status}  ${probe.body}\n`);
    console.error('   The usual causes:\n');
    console.error('     • You authorised with an account that does NOT own a channel.');
    console.error('       Create one first, or authorise with the broadcaster account.');
    console.error('     • The token lacks "channel:read". Re-run and accept every scope.');
    console.error('     • The account has a channel but it is not fully set up yet.');
    console.error('\n   Nothing was written to Supabase — just run `npm run auth` again.\n');
    process.exit(1);
  }

  await upsertChannel(channel.broadcasterUserId, channel.slug);
  await tokenManager.persist(channel.broadcasterUserId, channel.broadcasterUserId, token);

  console.log(`\n✅ Tokens stored in Supabase (kick_tokens) for #${channel.slug} (id ${channel.broadcasterUserId})`);
  console.log(`   expires in ~${token.expires_in ?? 3600}s · scope: ${token.scope ?? e.KICK_SCOPES}`);
  console.log('   (auto-refresh is handled by the bot; never copy the tokens into a file)\n');
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});