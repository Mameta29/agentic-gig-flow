/**
 * Append 2026-05 demo orders to the Fabric-mirrored Cosmos so the
 * "current month outsourcing cost" question in the Data Agent has data.
 * Extends the downward trend from seed-fabric-demo.ts (Nov 2025 ~ Apr 2026).
 *
 *   COSMOS_ENDPOINT=https://cosmos-gigflow-fabric.documents.azure.com:443/ \
 *   SEED_TENANT_ID=<entra-tenant-guid> \
 *   AZURE_TENANT_ID=<entra-tenant-guid> \
 *   pnpm --filter @gigflow/functions exec tsx scripts/seed-fabric-may.ts
 */
import { v4 as uuid } from 'uuid';
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';
import type { Order, OrderStatus } from '@gigflow/shared';

const TENANT = process.env.SEED_TENANT_ID;
if (!TENANT) {
  console.error('SEED_TENANT_ID is required (use the Entra tenant GUID used by seed-fabric-demo)');
  process.exit(1);
}

const YM = '2026-05';
const TARGET_TOTAL = 200_000; // continues the downward trend (Apr was ~257k)
const COUNT = 8;

async function main() {
  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const orders = client.database(env.cosmosDatabase()).container('orders');

  for (let j = 0; j < COUNT; j++) {
    const amount = Math.max(
      10_000,
      Math.floor((TARGET_TOTAL / COUNT) * (0.8 + Math.random() * 0.4)),
    );
    const day = String(2 + (j * 3) % 25).padStart(2, '0');
    const createdAt = `${YM}-${day}T10:00:00Z`;
    const order: Order = {
      id: uuid(),
      companyId: TENANT!,
      requesterId: 'demo-pm',
      workerGithubLogin: ['sato-taro', 'yamada-yuki', 'tanaka-ken'][j % 3]!,
      workerWallet: '0x000000000000000000000000000000000000sat0',
      description: `タスク ${YM}-${j}`,
      acceptanceCriteria: ['CI 通過', 'テスト追加'],
      amountJpyc: amount,
      deadline: `${YM}-28`,
      repository: 'gigflow-demo/workspace',
      status: 'bookkept' as OrderStatus,
      txHash: `0xdemo5${j}`.padEnd(66, '0'),
      blockNumber: 50_000_600 + j,
      settledAt: createdAt,
      bookkeepingArtifacts: {
        journalEntry: {
          debit: { account: '外注費', amount },
          credit: { account: '電子決済手段（JPYC）', amount },
          description: `demo / ${YM}-${j}`,
          dateLocal: createdAt.slice(0, 10),
        },
        withholding: {
          applies: false,
          rationale: 'プログラミング業務 + 海外居住者',
        },
        paymentStatementMarkdown: '# 支払調書 (demo)',
        needsHumanReview: false,
        generatedAt: createdAt,
      },
      createdAt,
      updatedAt: createdAt,
    };
    await orders.items.upsert(order);
    console.log(`  +${amount.toLocaleString()} JPYC  ${createdAt}  ${order.workerGithubLogin}`);
  }
  console.log(`\nseeded ${COUNT} orders for ${YM} (target ~${TARGET_TOTAL.toLocaleString()} JPYC)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
