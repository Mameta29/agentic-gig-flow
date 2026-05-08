import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'gigflow-mcp' },
  redact: {
    paths: ['authorization', 'headers.authorization'],
    censor: '[redacted]',
  },
});
