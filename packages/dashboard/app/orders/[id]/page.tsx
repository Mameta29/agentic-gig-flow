import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AuthExpiredError, listOrders } from '@/lib/api';
import { txUrl } from '@/lib/explorer';

type OrderRow = {
  id: string;
  description: string;
  amountJpyc: number;
  status: string;
  workerGithubLogin: string;
  txHash?: string;
  issueUrl?: string;
  prUrl?: string;
  bookkeepingArtifacts?: {
    journalEntry: { debit: { account: string; amount: number }; credit: { account: string; amount: number } };
    withholding: { applies: boolean; rate?: number; rationale: string };
    paymentStatementMarkdown: string;
    needsHumanReview: boolean;
  };
  createdAt: string;
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/api/auth/signin');
  let orders: OrderRow[];
  try {
    ({ orders } = (await listOrders()) as { orders: OrderRow[] });
  } catch (err) {
    if (err instanceof AuthExpiredError) redirect('/api/auth/signin');
    throw err;
  }
  const order = orders.find((o) => o.id === id);
  if (!order) {
    return <main>order not found</main>;
  }
  return (
    <main className="space-y-4">
      <h2 className="text-xl font-semibold">{order.description}</h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-neutral-500">受注者</dt>
        <dd>@{order.workerGithubLogin}</dd>
        <dt className="text-neutral-500">金額</dt>
        <dd>{order.amountJpyc.toLocaleString()} JPYC</dd>
        <dt className="text-neutral-500">状態</dt>
        <dd>{order.status}</dd>
        {order.issueUrl && (
          <>
            <dt className="text-neutral-500">Issue</dt>
            <dd>
              <a className="text-blue-600 hover:underline" href={order.issueUrl} target="_blank" rel="noreferrer">
                {order.issueUrl}
              </a>
            </dd>
          </>
        )}
        {order.prUrl && (
          <>
            <dt className="text-neutral-500">PR</dt>
            <dd>
              <a className="text-blue-600 hover:underline" href={order.prUrl} target="_blank" rel="noreferrer">
                {order.prUrl}
              </a>
            </dd>
          </>
        )}
        {order.txHash && (
          <>
            <dt className="text-neutral-500">TxHash</dt>
            <dd>
              <a
                className="text-blue-600 hover:underline"
                href={txUrl(order.txHash)}
                target="_blank"
                rel="noreferrer"
              >
                {order.txHash}
              </a>
            </dd>
          </>
        )}
      </dl>
      {order.bookkeepingArtifacts && (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <h3 className="mb-2 font-medium">経理処理</h3>
          <p>
            仕訳: 借方{' '}
            {order.bookkeepingArtifacts.journalEntry.debit.account}{' '}
            {order.bookkeepingArtifacts.journalEntry.debit.amount} / 貸方{' '}
            {order.bookkeepingArtifacts.journalEntry.credit.account}{' '}
            {order.bookkeepingArtifacts.journalEntry.credit.amount}
          </p>
          <p>
            源泉徴収:{' '}
            {order.bookkeepingArtifacts.withholding.applies
              ? `${order.bookkeepingArtifacts.withholding.rate}%`
              : 'なし'}{' '}
            ({order.bookkeepingArtifacts.withholding.rationale})
          </p>
          {order.bookkeepingArtifacts.needsHumanReview && (
            <p className="mt-2 text-amber-700">
              ⚠️ 税理士確認推奨
            </p>
          )}
          {order.bookkeepingArtifacts.paymentStatementMarkdown && (
            <details className="mt-3">
              <summary className="cursor-pointer font-medium">
                支払調書
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-white p-3 text-xs text-gray-800">
                {order.bookkeepingArtifacts.paymentStatementMarkdown}
              </pre>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
