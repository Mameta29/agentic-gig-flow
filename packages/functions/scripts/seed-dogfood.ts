/**
 * Dogfooding seed — 開発者本人 (Mameta29) を worker として登録し、本リポを
 * 検収対象リポジトリに加える。これにより「自分の Dashboard 改善 PR を、この
 * プロダクトの Review Agent に本物として検収・自動マージさせる」ことが可能になる。
 *
 * これはピッチ S10 の「AI に検収させながら作った」を**事実**にするための配線。
 *
 * 実行:
 *   pnpm --filter @gigflow/functions exec tsx scripts/seed-dogfood.ts
 *
 * 環境変数 (任意):
 *   SEED_TENANT_ID         対象テナント (default: デモ live tenant)
 *   DOGFOOD_GITHUB_LOGIN   開発者の GitHub login (default: Mameta29)
 *   DOGFOOD_WALLET         着金先ウォレット (default: 既存デモ worker と同じでも可)
 *   DOGFOOD_REPOSITORY     検収対象リポ "owner/repo" (default: Mameta29/agentic-gig-flow)
 *
 * 注意:
 *   - tenant.defaultRepository は既存のデモ用 (gigflow-demo/workspace) を壊さないよう、
 *     本スクリプトは defaultRepository を**上書きしない**。代わりに allowedRepositories
 *     配列へ追記する。Contract Agent は companyContext.repositories の最初を既定に使い、
 *     発注文で repository を明示すればそれが優先される (tenantRepos 参照)。
 *   - 本番 Cosmos に書くため、Managed Identity / az login のクレデンシャルが要る。
 */
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { env } from '../src/lib/env.js';
import type { Account, Tenant } from '@gigflow/shared';

async function main() {
  const tenantId = process.env.SEED_TENANT_ID || 'demo-tenant-0001';
  const githubLogin = process.env.DOGFOOD_GITHUB_LOGIN || 'Mameta29';
  const repository =
    process.env.DOGFOOD_REPOSITORY || 'Mameta29/agentic-gig-flow';
  // 着金先。実送金を伴わない検収デモなら任意の検証用アドレスでよい。
  const wallet =
    process.env.DOGFOOD_WALLET ||
    '0x000000000000000000000000000000000000d09f';

  const client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  const db = client.database(env.cosmosDatabase());

  // 1) tenant に検収対象リポを追記（defaultRepository は壊さない）。
  const { resource: existingTenant } = await db
    .container('tenants')
    .item(tenantId, tenantId)
    .read<Tenant & { allowedRepositories?: string[] }>();

  if (!existingTenant) {
    throw new Error(
      `tenant ${tenantId} not found. 先に seed-cosmos.ts でテナントを作るか SEED_TENANT_ID を実テナントに合わせてください。`,
    );
  }

  const allowed = new Set<string>(existingTenant.allowedRepositories ?? []);
  if (existingTenant.defaultRepository)
    allowed.add(existingTenant.defaultRepository);
  allowed.add(repository);

  const updatedTenant = {
    ...existingTenant,
    allowedRepositories: [...allowed],
  };
  await db.container('tenants').items.upsert(updatedTenant);

  // 2) 開発者本人を worker として登録。
  const worker: Account = {
    id: `${tenantId}:${githubLogin.toLowerCase()}`,
    companyId: tenantId,
    type: 'worker',
    displayName: githubLogin,
    roles: ['Worker'],
    worker: {
      githubLogin,
      wallet,
      countryCode: 'JP',
      timezone: 'Asia/Tokyo',
    },
    createdAt: new Date().toISOString(),
  };
  await db.container('accounts').items.upsert(worker);

  console.log('dogfood seeded:');
  console.log({
    tenantId,
    worker: worker.id,
    githubLogin,
    repository,
    allowedRepositories: updatedTenant.allowedRepositories,
  });
  console.log(
    '\n次: Dashboard /orders/new から、この worker と repository を指定して発注 →' +
      ' Issue 起票 → PR → Review Agent が検収・自動マージ。',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
