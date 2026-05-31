/**
 * One-shot: list orders created in 2026-05 and sum amountJpyc.
 *   pnpm --filter @gigflow/functions exec tsx scripts/check-may-orders.ts
 */
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';

async function main() {
  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const orders = client.database(env.cosmosDatabase()).container('orders');

  const { resources } = await orders.items
    .query<{
      id: string;
      companyId: string;
      amountJpyc: number;
      status: string;
      createdAt: string;
      workerGithubLogin: string;
      description: string;
    }>({
      query:
        "SELECT c.id, c.companyId, c.amountJpyc, c.status, c.createdAt, c.workerGithubLogin, c.description FROM c WHERE STARTSWITH(c.createdAt, '2026-05')",
    })
    .fetchAll();

  let total = 0;
  const byStatus: Record<string, { count: number; sum: number }> = {};
  for (const o of resources) {
    total += o.amountJpyc ?? 0;
    const s = o.status ?? 'unknown';
    byStatus[s] ??= { count: 0, sum: 0 };
    byStatus[s].count += 1;
    byStatus[s].sum += o.amountJpyc ?? 0;
  }

  console.log(`orders created in 2026-05: ${resources.length}`);
  console.log(`total amountJpyc: ${total.toLocaleString()} JPYC`);
  console.log('by status:', byStatus);
  console.log('\nrecent 10:');
  for (const o of resources.slice(-10)) {
    console.log(
      `  ${o.createdAt} ${o.status.padEnd(10)} ${String(o.amountJpyc).padStart(8)} JPYC  ${o.workerGithubLogin}  ${o.description?.slice(0, 40)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
