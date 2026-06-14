import type { OrderEvent } from './api';

// A single step shown in the order lifecycle timeline.
export type TimelineStep = {
  key: string;
  label: string;
  at?: string; // ISO timestamp, if this step has happened
  done: boolean;
};

// The canonical lifecycle order. Each step maps to one or more event types.
const STEPS: { key: string; label: string; types: string[] }[] = [
  { key: 'created', label: '発注（Issue 起票）', types: ['order_created', 'issue_created'] },
  { key: 'pr', label: 'PR 提出', types: ['pr_opened'] },
  { key: 'review', label: 'AI 検収', types: ['review_completed', 'review_failed', 'review_started'] },
  { key: 'settled', label: 'JPYC 着金', types: ['settlement_completed'] },
  { key: 'bookkept', label: '記帳', types: ['bookkeeping_completed'] },
];

function firstTime(events: OrderEvent[], types: string[]): string | undefined {
  const hit = events.find((e) => types.includes(e.type));
  return hit?.createdAt;
}

export function buildTimeline(events: OrderEvent[]): TimelineStep[] {
  return STEPS.map((s) => {
    const at = firstTime(events, s.types);
    return { key: s.key, label: s.label, at, done: Boolean(at) };
  });
}

/**
 * The headline metric: seconds from PR merge to JPYC arrival on-chain.
 * Uses pr_merged (or pr_opened as a fallback) → settlement_completed. Returns
 * undefined if either end is missing.
 */
export function mergeToSettledSeconds(events: OrderEvent[]): number | undefined {
  const mergedAt =
    firstTime(events, ['pr_merged']) ?? firstTime(events, ['settlement_started']);
  const settledAt = firstTime(events, ['settlement_completed']);
  if (!mergedAt || !settledAt) return undefined;
  const ms = Date.parse(settledAt) - Date.parse(mergedAt);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.round((ms / 1000) * 10) / 10;
}

export type CriterionResult = {
  criterion: string;
  met: boolean;
  evidence: string;
};

export type ReviewSummary = {
  verdict: 'approve' | 'reject' | string;
  qualityScore?: number;
  criteriaResults: CriterionResult[];
};

/**
 * Pull the most recent review verdict + cited criteria out of the events.
 * Review Agent writes criteriaResults into the review_completed / review_failed
 * event payload. Returns undefined if no review has run yet.
 */
export function latestReview(events: OrderEvent[]): ReviewSummary | undefined {
  const reviews = events.filter(
    (e) => e.type === 'review_completed' || e.type === 'review_failed',
  );
  const last = reviews[reviews.length - 1];
  if (!last?.payload) return undefined;
  const p = last.payload as {
    qualityScore?: number;
    criteriaResults?: CriterionResult[];
  };
  return {
    verdict: last.type === 'review_completed' ? 'approve' : 'reject',
    qualityScore: typeof p.qualityScore === 'number' ? p.qualityScore : undefined,
    criteriaResults: Array.isArray(p.criteriaResults) ? p.criteriaResults : [],
  };
}
