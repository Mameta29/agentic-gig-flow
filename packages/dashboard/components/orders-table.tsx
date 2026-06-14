'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  statusLabel,
  statusBadgeClass,
  isSettled,
} from '@/lib/order-status';

export type OrderRow = {
  id: string;
  description: string;
  amountJpyc: number;
  status: string;
  workerGithubLogin: string;
  txHash?: string;
  txUrl?: string;
  createdAt: string;
};

// Filter chips: 'all' plus the statuses worth filtering by in the demo.
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'open', label: '進行中' },
  { key: 'settled', label: '着金済み' },
  { key: 'bookkept', label: '記帳完了' },
  { key: 'review_failed', label: '差し戻し' },
];

function matchesFilter(status: string, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') {
    return ['created', 'in_progress', 'pr_opened', 'review_passed', 'settling'].includes(
      status,
    );
  }
  return status === filter;
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  // Summary is computed over ALL orders (not the filtered view) so the headline
  // numbers stay stable as the user filters.
  const summary = useMemo(() => {
    const settled = orders.filter((o) => isSettled(o.status));
    const totalSettledJpyc = settled.reduce((s, o) => s + o.amountJpyc, 0);
    return {
      count: orders.length,
      settledCount: settled.length,
      totalSettledJpyc,
    };
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(o.status, filter)) return false;
      if (!q) return true;
      // Search by business description and worker login.
      return (
        o.description.toLowerCase().includes(q) ||
        o.workerGithubLogin.toLowerCase().includes(q)
      );
    });
  }, [orders, filter, query]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="発注件数" value={`${summary.count} 件`} />
        <SummaryCard
          label="着金済み"
          value={`${summary.settledCount} 件`}
          tone="emerald"
        />
        <SummaryCard
          label="支払総額 (着金済み)"
          value={`${summary.totalSettledJpyc.toLocaleString()} JPYC`}
          tone="emerald"
        />
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === f.key
                ? 'border-[var(--gigflow-blue)] bg-[var(--gigflow-blue)] text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-[var(--gigflow-blue)]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="業務内容・受注者で検索"
          aria-label="検索"
          className="ml-auto w-56 max-w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-[var(--gigflow-blue)] focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left text-neutral-600">
              <th className="px-3 py-2 font-medium">業務内容</th>
              <th className="px-3 py-2 font-medium">受注者</th>
              <th className="px-3 py-2 font-medium text-right">金額</th>
              <th className="px-3 py-2 font-medium">状態</th>
              <th className="px-3 py-2 font-medium">tx</th>
              <th className="px-3 py-2 font-medium">作成日時</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-neutral-400" colSpan={6}>
                  {orders.length === 0
                    ? 'まだ発注はありません。「+ 新規発注」から始めましょう。'
                    : '条件に一致する発注はありません。'}
                </td>
              </tr>
            )}
            {visible.map((o) => (
              <tr
                key={o.id}
                data-order-id={o.id}
                className="border-b transition last:border-b-0 hover:bg-neutral-50"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-medium text-neutral-800 hover:text-[var(--gigflow-blue)] hover:underline"
                  >
                    {o.description}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-600">
                  @{o.workerGithubLogin}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {o.amountJpyc.toLocaleString()}
                  <span className="ml-1 text-xs text-neutral-400">JPYC</span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}
                  >
                    {statusLabel(o.status)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {o.txHash && o.txUrl ? (
                    <a
                      target="_blank"
                      href={o.txUrl}
                      className="font-mono text-xs text-blue-600 hover:underline"
                      rel="noreferrer"
                    >
                      {o.txHash.slice(0, 10)}…
                    </a>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {new Date(o.createdAt).toLocaleString('ja-JP')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length > 0 && (
        <p className="text-right text-xs text-neutral-400">
          {visible.length} / {orders.length} 件を表示
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'emerald';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : 'border-neutral-200 bg-white';
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-neutral-800">
        {value}
      </div>
    </div>
  );
}
