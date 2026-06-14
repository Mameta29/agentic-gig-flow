import type { OrderEvent } from '@/lib/api';
import {
  buildTimeline,
  mergeToSettledSeconds,
  latestReview,
} from '@/lib/order-timeline';

function fmt(at?: string): string {
  return at ? new Date(at).toLocaleString('ja-JP') : '';
}

export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  const steps = buildTimeline(events);
  const latency = mergeToSettledSeconds(events);
  const review = latestReview(events);

  return (
    <div className="space-y-5">
      {/* Headline metric: merge → JPYC arrival */}
      {latency !== undefined && (
        <div className="rounded-md border border-[var(--gigflow-pink)]/40 bg-pink-50/50 p-4">
          <div className="text-xs text-neutral-500">PR マージ → JPYC 着金</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-[var(--gigflow-pink)]">
            {latency.toFixed(1)}
            <span className="ml-1 text-base font-bold text-neutral-500">秒</span>
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            銀行振込の「翌月末 + 3〜5日」を、約 {latency.toFixed(1)} 秒に。
          </div>
        </div>
      )}

      {/* Lifecycle timeline */}
      <div>
        <div className="mb-2 text-xs font-semibold text-neutral-700">
          ライフサイクル
        </div>
        <ol className="relative ml-2 border-l border-neutral-200">
          {steps.map((s) => (
            <li key={s.key} className="mb-4 ml-4">
              <span
                className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 ${
                  s.done
                    ? 'border-emerald-500 bg-emerald-400'
                    : 'border-neutral-300 bg-white'
                }`}
                aria-hidden
              />
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-medium ${
                    s.done ? 'text-neutral-800' : 'text-neutral-400'
                  }`}
                >
                  {s.label}
                </span>
                {s.at && (
                  <span className="text-xs tabular-nums text-neutral-400">
                    {fmt(s.at)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* AI review evidence (criteria × met × cited evidence) */}
      {review && (
        <div className="rounded-md border border-neutral-200 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-700">
              AI 検収結果
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                review.verdict === 'approve'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {review.verdict === 'approve' ? '合格' : '差し戻し'}
              {review.qualityScore !== undefined && ` ・ ${review.qualityScore}/100`}
            </span>
          </div>
          <ul className="space-y-2">
            {review.criteriaResults.map((c, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-start gap-2">
                  <span className={c.met ? 'text-emerald-600' : 'text-red-600'}>
                    {c.met ? '✅' : '❌'}
                  </span>
                  <span className="font-medium text-neutral-800">
                    {c.criterion}
                  </span>
                </div>
                {c.evidence && (
                  <p className="ml-6 mt-0.5 whitespace-pre-wrap break-words text-xs text-neutral-500">
                    {c.evidence}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">
            各基準の合否を diff から根拠引用つきで判定（Foundry gpt-5.1）。
          </p>
        </div>
      )}
    </div>
  );
}
