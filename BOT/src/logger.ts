import pino, { type Logger } from 'pino';
import { env } from './config.js';

let logger: Logger | undefined;

export function getLogger(): Logger {
  if (logger) return logger;

  const e = env();
  const pretty = e.NODE_ENV !== 'production' || process.argv.includes('--pretty');

  logger = pretty
    ? pino({
        level: e.LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,module' },
        },
        redact: {
          paths: [
            'access_token',
            'refresh_token',
            'client_secret',
            'code',
            'code_verifier',
            '*.access_token',
            '*.refresh_token',
            '*.client_secret',
          ],
          censor: '[redacted]',
        },
      })
    : pino({
        level: e.LOG_LEVEL,
        redact: {
          paths: ['access_token', 'refresh_token', 'client_secret', '*.access_token', '*.refresh_token'],
          censor: '[redacted]',
        },
      });

  return logger;
}

export type { Logger };