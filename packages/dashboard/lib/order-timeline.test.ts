import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  mergeToSettledSeconds,
  latestReview,
} from './order-timeline';
import type { OrderEvent } from './api';

function ev(type: string, createdAt: string, payload?: Record<string, unknown>): OrderEvent {
  return { id: type + createdAt, orderId: 'o1', type, createdAt, payload };
}

describe('order-timeline', () => {
  it('marks steps done when their event exists, pending otherwise', () => {
    const events = [
      ev('order_created', '2026-06-14T00:00:00Z'),
      ev('pr_opened', '2026-06-14T00:01:00Z'),
    ];
    const steps = buildTimeline(events);
    const doneOf = (key: string) => steps.find((s) => s.key === key)?.done;
    expect(doneOf('created')).toBe(true);
    expect(doneOf('pr')).toBe(true);
    expect(doneOf('settled')).toBe(false);
    expect(doneOf('bookkept')).toBe(false);
  });

  it('computes merge→settled latency in seconds', () => {
    const events = [
      ev('settlement_started', '2026-06-14T00:00:00Z'),
      ev('settlement_completed', '2026-06-14T00:00:03Z'),
    ];
    expect(mergeToSettledSeconds(events)).toBe(3);
  });

  it('returns undefined latency when settlement is missing', () => {
    expect(mergeToSettledSeconds([ev('pr_opened', '2026-06-14T00:00:00Z')])).toBeUndefined();
  });

  it('extracts the latest review verdict + criteria', () => {
    const events = [
      ev('review_failed', '2026-06-14T00:01:00Z', {
        qualityScore: 60,
        criteriaResults: [{ criterion: 'tests', met: false, evidence: 'none' }],
      }),
      ev('review_completed', '2026-06-14T00:05:00Z', {
        qualityScore: 92,
        criteriaResults: [{ criterion: 'tests', met: true, evidence: 'x.test.ts' }],
      }),
    ];
    const r = latestReview(events);
    expect(r?.verdict).toBe('approve');
    expect(r?.qualityScore).toBe(92);
    expect(r?.criteriaResults[0]?.met).toBe(true);
  });

  it('returns undefined review when none has run', () => {
    expect(latestReview([ev('order_created', '2026-06-14T00:00:00Z')])).toBeUndefined();
  });
});
