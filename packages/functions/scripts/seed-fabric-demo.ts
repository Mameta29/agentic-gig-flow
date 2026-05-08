/**
 * Seed demo data for the Fabric / Power BI scene of the pitch video.
 * Inserts 6 months of orders with a downward trend for tenant DEMO_TENANT_ID.
 *   pnpm --filter @gigflow/functions exec tsx scripts/seed-fabric-demo.ts
 */
import { v4 as uuid } from 'uuid';
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';
import type { Order, OrderStatus } from '@gigflow/shared';

const TENANT = process.env.SEED_TENANT_ID || 'demo-tenant-0001';
const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];
const baseAmounts = [800_000, 750_000, 600_000, 500_000, 380_000, 250_000];

async function main() {
  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const orders = client.database(env.cosmosDatabase()).container('orders');

  for (const [i, ym] of months.entries()) {
    const target = baseAmounts[i] ?? 250_000;
    for (let j = 0; j < 8; j++) {
      const amount = Math.max(
        10_000,
        Math.floor((target / 8) * (0.8 + Math.random() * 0.4)),
      );
      const day = String(2 + (j * 3) % 25).padStart(2, '0');
      const createdAt = `${ym}-${day}T10:00:00Z`;
      const order: Order = {
        id: uuid(),
        companyId: TENANT,
        requesterId: 'demo-pm',
        workerGithubLogin: ['sato-taro', 'yamada-yuki', 'tanaka-ken'][j % 3]!,
        workerWallet: '0x000000000000000000000000000000000000sat0',
        description: `タスク ${ym}-${j}`,
        acceptanceCriteria: ['CI 通過', 'テスト追加'],
        amountJpyc: amount,
        deadline: `${ym}-28`,
        repository: 'gigflow-demo/workspace',
        status: 'bookkept' as OrderStatus,
        txHash: `0xdemo${i}${j}`.padEnd(66, '0'),
        blockNumber: 50_000_000 + i * 100 + j,
        settledAt: createdAt,
        bookkeepingArtifacts: {
          journalEntry: {
            debit: { account: '外注費', amount },
            credit: { account: '暗号資産（JPYC）', amount },
            description: `demo / ${ym}-${j}`,
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
    }
    console.log(`seeded ${ym} (target ~${target.toLocaleString()})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
