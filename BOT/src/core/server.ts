import express, { type Express, type Request, type Response, type Router } from 'express';
import { env } from '../config.js';
import { getLogger } from '../logger.js';
import { createWebhookRouter, MessageDedupe } from '../kick/webhook.js';
import type { NormalizedMessage } from '../kick/types.js';
import type { ChatSource, ChatSourceKind } from './source.js';

export interface HttpServerDeps {
  health: () => Record<string, unknown>;
  /**
   * OAuth redirect handler for GET /callback. Lets you re-authorize without
   * restarting the bot (npm run auth uses its own temporary listener).
   */
  onCode?: (code: string, state: string) => Promise<void> | void;
  /**
   * Mounted before the catch-all 404 so it actually receives requests.
   * Express matches middleware in registration order and the 404 handler
   * terminates the chain, so anything registered after it is unreachable.
   */
  webhookRouter?: Router;
}

export interface ChatSourceDeps {
  onMessage: (msg: NormalizedMessage) => void;
  broadcasterUserId: () => number | null;
  /** Shared with the Pusher source so both modes together cannot double count. */
  dedupe?: MessageDedupe;
}

/** Per-hit diagnostics, surfaced in /health to localise delivery problems. */
export interface WebhookDiagnostics {
  onHit?: (info: { at: Date; eventType?: string; signed: boolean; bytes: number }) => void;
  onReject?: (info: { at: Date; reason: string }) => void;
  onAccepted?: (at: Date) => void;
}

/** The webhook chat source, implemented on top of the express server. */
export class WebhookChatSource implements ChatSource {
  private last: Date | null = null;
  private cb?: (msg: NormalizedMessage) => void;
  private built?: Router;

  constructor(
    private deps: ChatSourceDeps,
    private diagnostics: WebhookDiagnostics = {},
  ) {}

  onMessage(cb: (msg: NormalizedMessage) => void): void {
    this.cb = cb;
  }

  /** Hand this to createServer({ webhookRouter }) before it starts listening. */
  router(): Router {
    if (!this.built) {
      this.built = createWebhookRouter({
        onMessage: (msg) => {
          this.last = new Date();
          this.cb?.(msg);
        },
        broadcasterUserId: this.deps.broadcasterUserId,
        dedupe: this.deps.dedupe ?? new MessageDedupe(),
        ...this.diagnostics,
      });
    }
    return this.built;
  }

  async start(): Promise<void> {
    getLogger().info({ path: '/webhooks/kick' }, 'webhook chat source ready');
  }

  async stop(): Promise<void> {
    /* the http server is closed by the caller */
  }

  // eslint-disable-next-line class-methods-use-this
  lastEventAt(): Date | null {
    return this.last;
  }
}

export interface HttpServer {
  app: Express;
  listen(): Promise<{ port: number }>;
  close(): Promise<void>;
}

export function createServer(deps: HttpServerDeps): HttpServer {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ...deps.health() });
  });

  // Kick OAuth redirect target: /callback
  app.get('/callback', (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const error = typeof req.query.error === 'string' ? req.query.error : '';

    if (error) {
      res.status(400).send(`Authorization failed: ${error}`);
      return;
    }
    if (!code) {
      res.status(400).send('Missing authorization code.');
      return;
    }

    void (async () => {
      try {
        await deps.onCode?.(code, state);
        res
          .status(200)
          .send(
            '<html dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem">' +
              '<h2>✅ تم تسجيل الدخول بنجاح</h2><p>تقدر ترجع للبث الحين.</p></body></html>',
          );
      } catch (err) {
        getLogger().error({ err }, 'oauth callback failed');
        res.status(500).send(`Token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });

  // Must be registered before the catch-all below, which never calls next().
  if (deps.webhookRouter) app.use(deps.webhookRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    getLogger().error({ err }, 'unhandled express error');
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ ok: false, error: 'internal error' });
  });

  let httpServer: ReturnType<Express['listen']> | undefined;

  return {
    app,
    listen() {
      const port = env().PORT;
      return new Promise((resolve, reject) => {
        httpServer = app.listen(port, () => {
          getLogger().info({ port }, 'http server listening');
          resolve({ port });
        });
        httpServer.on('error', reject);
      });
    },
    close() {
      return new Promise((resolve) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close(() => resolve());
        httpServer.closeIdleConnections?.();
      });
    },
  };
}

export type { ChatSource, ChatSourceKind };