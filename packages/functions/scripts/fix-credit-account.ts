/**
 * One-shot migration: rewrite legacy `暗号資産（JPYC）` credit account
 * to `電子決済手段（JPYC）` for all orders that already have bookkeeping
 * artifacts. JPYC is classified as 電子決済手段 (資金移動業型) under the
 * 改正資金決済法, not 暗号資産.
 *
 *   pnpm --filter @gigflow/functions exec tsx scripts/fix-credit-account.ts
 *   FIX_TENANT_ID=<tenant> pnpm ... (limit to a single tenant)
 *   DRY_RUN=1 pnpm ...             (preview without writing)
 */
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';
import type { Order } from '@gigflow/shared';

const LEGACY = '暗号資産（JPYC）';
const REPLACEMENT = '電子決済手段（JPYC）';

async function main() {
  const tenantFilter = process.env.FIX_TENANT_ID;
  const dryRun = process.env.DRY_RUN === '1';

  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const orders = client.database(env.cosmosDatabase()).container('orders');

  const query = tenantFilter
    ? {
        query:
          'SELECT * FROM c WHERE c.companyId = @t AND IS_DEFINED(c.bookkeepingArtifacts)',
        parameters: [{ name: '@t', value: tenantFilter }],
      }
    : {
        query: 'SELECT * FROM c WHERE IS_DEFINED(c.bookkeepingArtifacts)',
      };

  const { resources } = await orders.items.query<Order>(query).fetchAll();

  let scanned = 0;
  let updated = 0;
  for (const order of resources) {
    scanned += 1;
    const credit = order.bookkeepingArtifacts?.journalEntry?.credit;
    if (!credit || credit.account !== LEGACY) continue;

    credit.account = REPLACEMENT;
    console.log(
      `${dryRun ? '[dry-run] ' : ''}order=${order.id} companyId=${order.companyId} credit -> ${REPLACEMENT}`,
    );
    if (!dryRun) {
      await orders
        .item(order.id, order.companyId)
        .replace(order);
    }
    updated += 1;
  }

  console.log(`\nscanned=${scanned} updated=${updated} dryRun=${dryRun}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
