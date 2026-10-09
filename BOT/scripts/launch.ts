/**
 * One-command launcher: starts the public tunnel, writes the URL into .env,
 * restarts the bot, and prints the webhook URL to paste into the Kick
 * developer dashboard.
 *
 *   npm run launch
 *
 * A quick tunnel (trycloudflare.com) changes hostname every restart, and Kick
 * only posts events to the URL configured in its dashboard. Doing that by hand
 * is the single most error-prone part of running this bot locally, so this
 * script owns the tunnel lifecycle and keeps .env in sync.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = `${ROOT}/.env`;
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const CLOUDFLARED = `${process.env.LOCALAPPDATA}\\Programs\\cloudflared\\cloudflared.exe`;
const PORT = 3000;

function patchEnv(url: string): void {
  const src = readFileSync(ENV_FILE, 'utf8');
  const next = /^PUBLIC_BASE_URL=.*$/m.test(src)
    ? src.replace(/^PUBLIC_BASE_URL=.*$/m, `PUBLIC_BASE_URL=${url}`)
    : `${src.trimEnd()}\nPUBLIC_BASE_URL=${url}\n`;
  writeFileSync(ENV_FILE, next, 'utf8');
}

/** Read INGEST_MODE without zod; defaults to pusher like config.ts. */
function readDotenv(): { INGEST_MODE: string } {
  try {
    const m = /^INGEST_MODE\s*=\s*(\S+)\s*$/m.exec(readFileSync(ENV_FILE, 'utf8'));
    const mode = m?.[1]?.trim().toLowerCase();
    return { INGEST_MODE: mode === 'webhook' || mode === 'both' ? mode : 'pusher' };
  } catch {
    return { INGEST_MODE: 'pusher' };
  }
}

function get<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const h = await get<{ ok: boolean }>('/health');
      if (h.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('bot did not become healthy on :' + PORT);
}

/** Kill whatever currently holds :3000 so the bot can bind it. */
function freePort(): void {
  const ps = `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
}

async function main(): Promise<void> {
  const mode = readDotenv().INGEST_MODE;
  const needsTunnel = mode === 'webhook' || mode === 'both';

  if (!needsTunnel) {
    console.log('\n  INGEST_MODE=pusher — no tunnel is needed. Starting the bot directly.\n');
    console.log('  (npm run launch is webhook-only. Use npm start, same effect.)\n');
  } else if (
    spawnSync('powershell', ['-NoProfile', '-Command', `Test-Path '${CLOUDFLARED}'`], { encoding: 'utf8' }).stdout
      .trim() !== 'True'
  ) {
    throw new Error(`cloudflared not found at ${CLOUDFLARED}`);
  }

  freePort();
  await sleep(1000);

  let tunnel: ChildProcess | null = null;
  let url: string | null = null;

  if (needsTunnel) {
    tunnel = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const child = tunnel;

    url = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      const onData = (chunk: Buffer): void => {
        buffer += chunk.toString();
        const found = buffer.match(TUNNEL_URL_RE);
        if (found) resolve(found[0]);
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('exit', (code) => reject(new Error(`tunnel exited early (code ${code})`)));
      setTimeout(() => reject(new Error('tunnel did not print a URL within 60s')), 60_000);
    }).catch((err: unknown) => {
      child.kill();
      throw err;
    });

    patchEnv(url);
    console.log(`\n  tunnel up : ${url}`);

    const shutdown = (): void => {
      child.kill();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  const bot: ChildProcess = spawn(
    process.execPath,
    [resolve('node_modules', 'tsx', 'dist', 'cli.mjs'), resolve('src', 'index.ts')],
    { stdio: 'inherit', cwd: ROOT, env: { ...process.env, FORCE_COLOR: '1' } },
  );
  bot.on('exit', (code) => {
    tunnel?.kill();
    process.exit(code ?? 0);
  });

  await waitForHealth();

  const usePusher = mode === 'pusher' || mode === 'both';
  const useWebhook = mode === 'webhook' || mode === 'both';
  const startWait = Date.now();

  // The ingest source connects a few seconds into boot. Poll briefly so the
  // banner reports the truth instead of a boot race.
  type HealthSnapshot = {
    channel: string;
    ranksLoaded: number;
    lastEventAt: string | null;
    ingest: {
      mode: string;
      pusher: { enabled: boolean; connected: boolean; subscribed: boolean; chatroomId: number | null };
      webhook: { enabled: boolean; subscribed: boolean; delivering: boolean };
    };
  };

  let health: HealthSnapshot;
  for (;;) {
    health = await get<HealthSnapshot>('/health');
    const pusherReady = !usePusher || health.ingest.pusher.subscribed;
    const hookReady = !useWebhook || health.ingest.webhook.subscribed;
    if (pusherReady && hookReady) break;
    await sleep(1500);
    // Hard cap so a broken source cannot hang the launcher.
    if (Date.now() - startWait > 60_000) break;
  }
  console.log(
    `  bot up     : channel #${health.channel} | ranks ${health.ranksLoaded} | ingest=${health.ingest.mode}` +
      (health.ingest.pusher.enabled
        ? ` pusher=${health.ingest.pusher.subscribed ? `subscribed(chatrooms.${health.ingest.pusher.chatroomId}.v2)` : 'not subscribed yet'}`
        : '') +
      (health.ingest.webhook.enabled
        ? ` webhook=${health.ingest.webhook.subscribed ? (health.ingest.webhook.delivering ? 'delivering' : 'subscribed, no event yet') : 'no'}`
        : ''),
  );

  if (!needsTunnel || !url) {
    console.log('\n  ✅ Pusher mode: no dashboard URL to save. Type  !رتبة  in the channel.\n');
    return;
  }

  // Probe the public URL from the outside. A quick tunnel usually needs a few
  // seconds to finish provisioning, so retry instead of reporting a failure.
  let publicOk = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const probe = await fetch(`${url}/health`, { signal: AbortSignal.timeout(15_000) });
      if (probe.ok) {
        console.log(`  public     : /health -> HTTP ${probe.status} (after ${attempt} attempt${attempt > 1 ? 's' : ''})`);
        publicOk = true;
        break;
      }
      console.log(`  public     : attempt ${attempt} -> HTTP ${probe.status}`);
    } catch (err) {
      console.log(`  public     : attempt ${attempt} -> ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(4000);
  }

  console.log('\n  ─────────────────────────────────────────────────────────');
  console.log('  Paste this into the Kick developer dashboard');
  console.log('  (Application -> Webhooks -> URL), then Save:');
  console.log(`\n    ${url}/webhooks/kick\n`);
  console.log('  Kick needs the event  chat.message.sent');
  console.log('  ─────────────────────────────────────────────────────────');
  if (!publicOk) {
    console.log('\n  ⚠️  The public URL did not answer yet. Wait ~30s and open');
    console.log(`     ${url}/health — once it shows {"ok":true}, save the URL above.\n`);
  } else {
    console.log('\n  ✅ The URL is live. Save it, then type  !رتبة  in #hsg2.\n');
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
  // Never leave an orphaned tunnel behind: it would hold a hostname that
  // Kick may still be pointed at while nothing serves it.
  spawnSync('powershell', ['-NoProfile', '-Command', "Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force"], {
    stdio: 'ignore',
  });
  process.exit(1);
});