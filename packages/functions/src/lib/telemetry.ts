import * as appInsights from 'applicationinsights';
import { env } from './env.js';
import { logger } from './logger.js';

let started = false;

export function startTelemetry(): void {
  if (started) return;
  const conn = env.appInsightsConnectionString();
  if (!conn) {
    logger.info('Application Insights connection string not set; skipping');
    started = true;
    return;
  }
  appInsights
    .setup(conn)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setAutoDependencyCorrelation(true)
    .setUseDiskRetryCaching(true)
    .start();
  started = true;
  logger.info('Application Insights started');
}

export function trackEvent(
  name: string,
  properties: Record<string, unknown> = {},
  measurements: Record<string, number> = {},
): void {
  startTelemetry();
  if (!appInsights.defaultClient) return;
  appInsights.defaultClient.trackEvent({
    name,
    properties: stringifyProps(properties),
    measurements,
  });
}

export function trackException(
  err: unknown,
  properties: Record<string, unknown> = {},
): void {
  startTelemetry();
  if (!appInsights.defaultClient) return;
  appInsights.defaultClient.trackException({
    exception: err instanceof Error ? err : new Error(String(err)),
    properties: stringifyProps(properties),
  });
}

function stringifyProps(p: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}
