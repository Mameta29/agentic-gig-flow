import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AuthExpiredError, listOrders } from '@/lib/api';
import { txUrl } from '@/lib/explorer';
import { OrdersStream } from '@/components/orders-stream';
import { OrdersTable, type OrderRow } from '@/components/orders-table';

type RawOrder = Omit<OrderRow, 'txUrl'>;

export default async function OrdersPage() {
  const session = await auth();
  if (!session) redirect('/api/auth/signin');
  let orders: RawOrder[];
  try {
    ({ orders } = (await listOrders()) as { orders: RawOrder[] });
  } catch (err) {
    if (err instanceof AuthExpiredError) redirect('/api/auth/signin');
    throw err;
  }

  // Resolve the explorer URL server-side (txUrl reads a server env var) so the
  // client table component stays free of server-only config.
  const rows: OrderRow[] = orders.map((o) => ({
    ...o,
    txUrl: o.txHash ? txUrl(o.txHash) : undefined,
  }));

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">注文一覧</h2>
        <Link
          href="/orders/new"
          className="rounded bg-[var(--gigflow-pink)] px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          + 新規発注
        </Link>
      </div>
      <OrdersStream />
      <OrdersTable orders={rows} />
    </main>
  );
}
