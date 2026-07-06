import { pino, type Logger } from 'pino';
import { getEnv } from './env.js';

/** Structured JSON logger. One child logger per service, request-id aware. */
export function createLogger(service: string): Logger {
  const env = getEnv();
  return pino({
    name: service,
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    // Redact anything that could leak credentials into logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.refreshToken',
        '*.apiKey',
      ],
      censor: '[REDACTED]',
    },
    base: { service },
  });
}
