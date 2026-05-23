/**
 * Re-tenant existing Cosmos data so that companyId == the real Entra tenant id.
 *
 * Why: the dashboard/functions scope every query by `companyId == token.tid`.
 * Seed data used the literal "demo-tenant-0001", which never matches a real
 * Entra `tid` (a GUID), so a signed-in user sees an empty orders table.
 *
 * This rewrites orders / tenants / accounts from OLD_TENANT to NEW_TENANT.
 * `orders` and `tenants` have partition keys that include the tenant id, so
 * those rows are recreated under the new key and the old rows deleted.
 *
 * Usage (dry run first):
 *   OLD_TENANT=demo-tenant-0001 NEW_TENANT=3894eada-7a32-44e1-9c8b-6098a6a92a2d \
 *     pnpm --filter @gigflow/functions exec tsx scripts/retenant-cosmos.ts --dry-run
 *   ... then without --dry-run to apply.
 */
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

const ENDPOINT =
  process.env.COSMOS_ENDPOINT ||
  'https://cosmos-gigflow-28fa80.documents.azure.com:443/';
const DB = process.env.COSMOS_DATABASE || 'gigflow';
const OLD = process.env.OLD_TENANT || 'demo-tenant-0001';
const NEW = process.env.NEW_TENANT;
const DRY = process.argv.includes('--dry-run');

async function main() {
  if (!NEW) throw new Error('NEW_TENANT env required');
  if (NEW === OLD) throw new Error('NEW_TENANT must differ from OLD_TENANT');
  const client = new CosmosClient({
    endpoint: ENDPOINT,
    aadCredentials: new DefaultAzureCredential(),
  });
  const db = client.database(DB);
  console.log(
    `re-tenant: ${OLD} -> ${NEW} (${DRY ? 'DRY RUN' : 'APPLY'}) on ${ENDPOINT}`,
  );

  // --- orders: PK = /companyId -> recreate under new companyId, delete old ---
  const ordersC = db.container('orders');
  const { resources: orders } = await ordersC.items
    .query<Record<string, unknown>>({
      query: 'SELECT * FROM c WHERE c.companyId = @t',
      parameters: [{ name: '@t', value: OLD }],
    })
    .fetchAll();
  console.log(`orders to move: ${orders.length}`);
  for (const o of orders) {
    const oldId = o.id as string;
    const moved = { ...o, companyId: NEW };
    delete (moved as { _rid?: unknown })._rid;
    delete (moved as { _self?: unknown })._self;
    delete (moved as { _etag?: unknown })._etag;
    delete (moved as { _attachments?: unknown })._attachments;
    delete (moved as { _ts?: unknown })._ts;
    if (!DRY) {
      await ordersC.items.upsert(moved);
      await ordersC.item(oldId, OLD).delete();
    }
  }
  console.log(`  orders ${DRY ? 'would be' : ''} moved`);

  // --- tenants: PK = /id (== old tenant id) -> recreate with new id ---
  const tenantsC = db.container('tenants');
  const { resource: tenant } = await tenantsC
    .item(OLD, OLD)
    .read<Record<string, unknown>>()
    .catch(() => ({ resource: undefined }));
  if (tenant) {
    const moved = { ...tenant, id: NEW };
    for (const k of ['_rid', '_self', '_etag', '_attachments', '_ts'])
      delete (moved as Record<string, unknown>)[k];
    console.log('tenant doc found, will re-key id ->', NEW);
    if (!DRY) {
      await tenantsC.items.upsert(moved);
      await tenantsC.item(OLD, OLD).delete();
    }
  } else {
    console.log('no tenant doc for OLD; skipping');
  }

  // --- accounts: PK = /id (keep id), just update companyId field ---
  const accountsC = db.container('accounts');
  const { resources: accounts } = await accountsC.items
    .query<Record<string, unknown>>({
      query: 'SELECT * FROM c WHERE c.companyId = @t',
      parameters: [{ name: '@t', value: OLD }],
    })
    .fetchAll();
  console.log(`accounts to update: ${accounts.length}`);
  for (const a of accounts) {
    const moved = { ...a, companyId: NEW };
    for (const k of ['_rid', '_self', '_etag', '_attachments', '_ts'])
      delete (moved as Record<string, unknown>)[k];
    if (!DRY) await accountsC.item(a.id as string, a.id as string).replace(moved);
  }
  console.log(`  accounts ${DRY ? 'would be' : ''} updated`);

  console.log(DRY ? 'DRY RUN complete (no writes).' : 'APPLY complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
