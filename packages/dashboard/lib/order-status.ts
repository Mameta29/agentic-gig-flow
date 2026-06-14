// Human-facing labels and badge colors for order statuses. Shared across the
// orders list and detail screens so the lifecycle reads in Japanese instead of
// raw enum values (created / bookkept / …).

export type OrderStatusLabel = {
  label: string;
  /** Tailwind classes for the status badge. */
  badge: string;
};

const STATUS_LABELS: Record<string, OrderStatusLabel> = {
  created: { label: '発注済み', badge: 'bg-neutral-200 text-neutral-700' },
  in_progress: { label: '作業中', badge: 'bg-sky-100 text-sky-700' },
  pr_opened: { label: 'PR レビュー中', badge: 'bg-blue-100 text-blue-700' },
  review_failed: { label: '差し戻し', badge: 'bg-red-100 text-red-700' },
  review_passed: { label: '検収合格', badge: 'bg-amber-100 text-amber-700' },
  settling: { label: '送金中', badge: 'bg-amber-100 text-amber-800' },
  settled: { label: '着金済み', badge: 'bg-emerald-100 text-emerald-700' },
  bookkept: { label: '記帳完了', badge: 'bg-emerald-200 text-emerald-800' },
  cancelled: { label: 'キャンセル', badge: 'bg-neutral-300 text-neutral-700' },
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status]?.label ?? status;
}

export function statusBadgeClass(status: string): string {
  return STATUS_LABELS[status]?.badge ?? 'bg-neutral-100 text-neutral-600';
}

/** Statuses that count as "money sent" for summary totals. */
export function isSettled(status: string): boolean {
  return status === 'settled' || status === 'bookkept';
}
