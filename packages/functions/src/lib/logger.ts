import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'privateKey',
      'wallet-pk',
      '*.privateKey',
      'authorization',
      'headers.authorization',
      'github.token',
      '*.secret',
    ],
    censor: '[redacted]',
  },
  base: { service: 'gigflow-functions' },
});

export type Logger = typeof logger;
