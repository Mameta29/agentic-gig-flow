import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listOrders } from '@/lib/api';
import { OrdersStream } from '@/components/orders-stream';

type OrderRow = {
  id: string;
  description: string;
  amountJpyc: number;
  status: string;
  workerGithubLogin: string;
  txHash?: string;
  createdAt: string;
};

export default async function OrdersPage() {
  const session = await auth();
  if (!session) return null;
  const { orders } = (await listOrders()) as { orders: OrderRow[] };
  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">注文一覧</h2>
        <Link
          href="/orders/new"
          className="rounded bg-[var(--gigflow-pink)] px-3 py-1.5 text-sm text-white"
        >
          + 新規発注
        </Link>
      </div>
      <OrdersStream />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-600">
            <th className="py-2">業務内容</th>
            <th>受注者</th>
            <th>金額</th>
            <th>状態</th>
            <th>tx</th>
            <th>作成日時</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 && (
            <tr>
              <td className="py-6 text-center text-neutral-400" colSpan={6}>
                まだ発注はありません
              </td>
            </tr>
          )}
          {orders.map((o) => (
            <tr key={o.id} className="border-b last:border-b-0" data-order-id={o.id}>
              <td className="py-2">
                <Link href={`/orders/${o.id}`} className="hover:underline">
                  {o.description}
                </Link>
              </td>
              <td>@{o.workerGithubLogin}</td>
              <td>{o.amountJpyc.toLocaleString()} JPYC</td>
              <td>
                <StatusBadge status={o.status} />
              </td>
              <td>
                {o.txHash ? (
                  <a
                    target="_blank"
                    href={`https://polygonscan.com/tx/${o.txHash}`}
                    className="text-blue-600 hover:underline"
                    rel="noreferrer"
                  >
                    {o.txHash.slice(0, 10)}…
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td>{new Date(o.createdAt).toLocaleString('ja-JP')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    created: 'bg-neutral-200 text-neutral-700',
    pr_opened: 'bg-blue-100 text-blue-700',
    review_passed: 'bg-amber-100 text-amber-700',
    review_failed: 'bg-red-100 text-red-700',
    settled: 'bg-emerald-100 text-emerald-700',
    bookkept: 'bg-emerald-200 text-emerald-800',
    cancelled: 'bg-neutral-300 text-neutral-700',
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-neutral-100'}`}
    >
      {status}
    </span>
  );
}
