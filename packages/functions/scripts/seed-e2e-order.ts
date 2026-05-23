/**
 * Seed ONE order purpose-built for an end-to-end "PR merge -> JPYC settlement"
 * rehearsal against the real demo repo on Polygon Amoy.
 *
 * Differs from seed-cosmos.ts:
 *  - repository matches the live demo repo (Mameta29/gigflow-demo-workspace)
 *  - workerWallet is a real Amoy address (settlement guardrails would reject
 *    the placeholder 0x...sat0 used by the generic seed)
 *  - workerGithubLogin matches the human Worker account that opens the PR
 *  - status starts at 'in_progress' so the PR-opened webhook can transition
 *    in_progress -> pr_opened -> review_passed without hitting an invalid jump
 *  - small amount + simple acceptanceCriteria so the Review Agent approves
 *
 * Run:
 *   set -a; source .env; set +a
 *   pnpm --filter @gigflow/functions exec tsx scripts/seed-e2e-order.ts
 *
 * Prints the orderId and the hidden marker to paste into the GitHub issue body.
 */
import { v4 as uuid } from 'uuid';
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';
import type { Order } from '@gigflow/shared';

async function main() {
  const tenantId = process.env.SEED_TENANT_ID || 'demo-tenant-0001';
  const repository =
    process.env.E2E_REPOSITORY || 'Mameta29/gigflow-demo-workspace';
  const workerGithubLogin = process.env.E2E_WORKER_LOGIN || 'ei-chan-bot';
  const workerWallet =
    process.env.E2E_WORKER_WALLET ||
    '0x7F37f6D0c5B4D41E3722d12930430FE309489389';
  const amountJpyc = Number(process.env.E2E_AMOUNT_JPYC || '100');

  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const db = client.database(env.cosmosDatabase());

  const now = new Date().toISOString();
  const order: Order = {
    id: uuid(),
    companyId: tenantId,
    requesterId: 'demo-pm-0001',
    workerGithubLogin,
    workerWallet,
    description: 'README に About セクションを追加する',
    acceptanceCriteria: [
      'README.md に "## About" セクションが追加されている',
      'About セクションにプロジェクトの説明が1文以上書かれている',
    ],
    amountJpyc,
    deadline: '2026-06-01',
    repository,
    status: 'in_progress',
    createdAt: now,
    updatedAt: now,
  };

  await db.container('orders').items.upsert(order);

  const marker = `<!-- gigflow:orderId=${order.id} -->`;
  console.log('seeded e2e order:');
  console.log(
    JSON.stringify(
      {
        orderId: order.id,
        tenantId,
        repository,
        workerGithubLogin,
        workerWallet,
        amountJpyc,
        status: order.status,
      },
      null,
      2,
    ),
  );
  console.log('\nissue body marker (paste into the GitHub issue):');
  console.log(marker);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
