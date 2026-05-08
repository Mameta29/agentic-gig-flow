/**
 * Seed Cosmos with one demo tenant + a sample order + a worker account.
 * Run with: pnpm --filter @gigflow/functions exec tsx scripts/seed-cosmos.ts
 */
import { v4 as uuid } from 'uuid';
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';
import type { Order, Account, Tenant } from '@gigflow/shared';

async function main() {
  const tenantId = process.env.SEED_TENANT_ID || 'demo-tenant-0001';
  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const db = client.database(env.cosmosDatabase());

  const tenant: Tenant = {
    id: tenantId,
    displayName: 'Marche Co., Ltd.',
    domain: 'marche.example.co.jp',
    defaultRepository: 'gigflow-demo/workspace',
    defaultCurrency: 'JPYC',
    spendingLimitPerOrder: 200000,
    spendingLimitMonthly: 1000000,
    walletAddress: '0x0000000000000000000000000000000000000001',
    createdAt: new Date().toISOString(),
  };

  const worker: Account = {
    id: `${tenantId}:sato-taro`,
    companyId: tenantId,
    type: 'worker',
    displayName: 'Sato Taro',
    roles: ['Worker'],
    worker: {
      githubLogin: 'sato-taro',
      wallet: '0x000000000000000000000000000000000000sat0',
      countryCode: 'TH',
      timezone: 'Asia/Bangkok',
    },
    createdAt: new Date().toISOString(),
  };

  const order: Order = {
    id: uuid(),
    companyId: tenantId,
    requesterId: 'demo-pm-0001',
    workerGithubLogin: 'sato-taro',
    workerWallet: '0x000000000000000000000000000000000000sat0',
    description: 'ログイン機能を実装する',
    acceptanceCriteria: [
      '/login ページがレンダリングされる',
      'ログイン成功時に / にリダイレクトされる',
      'テストが追加されている',
      'CI が通過している',
    ],
    amountJpyc: 50000,
    deadline: '2026-05-23',
    repository: 'gigflow-demo/workspace',
    status: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.container('tenants').items.upsert(tenant);
  await db.container('accounts').items.upsert(worker);
  await db.container('orders').items.upsert(order);

  console.log('seeded:');
  console.log({ tenantId: tenant.id, orderId: order.id, workerId: worker.id });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
