import { CosmosClient, type Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type { Order, Account, Tenant } from '@gigflow/shared';

let client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (client) return client;
  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) throw new Error('missing COSMOS_ENDPOINT');
  client = new CosmosClient({
    endpoint,
    aadCredentials: new DefaultAzureCredential(),
  });
  return client;
}

function db() {
  return getClient().database(process.env.COSMOS_DATABASE || 'gigflow');
}

export type ReadOnlyTenantCosmos = {
  tenantId: string;
  listOrders(filter: {
    yearMonth?: string;
    workerGithubLogin?: string;
    status?: string;
    minAmountJpyc?: number;
    maxAmountJpyc?: number;
    limit: number;
  }): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  listAllAccounts(): Promise<Account[]>;
  getTenant(): Promise<Tenant | undefined>;
};

function ordersC(): Container {
  return db().container('orders');
}
function accountsC(): Container {
  return db().container('accounts');
}
function tenantsC(): Container {
  return db().container('tenants');
}

export function createReadOnlyTenantCosmos(
  tenantId: string,
): ReadOnlyTenantCosmos {
  if (!tenantId) throw new Error('tenantId required');
  return {
    tenantId,
    async listOrders(filter) {
      const params: { name: string; value: string | number }[] = [
        { name: '@cid', value: tenantId },
      ];
      let query = 'SELECT * FROM c WHERE c.companyId = @cid';
      if (filter.yearMonth) {
        query += ' AND STARTSWITH(c.createdAt, @ym)';
        params.push({ name: '@ym', value: filter.yearMonth });
      }
      if (filter.workerGithubLogin) {
        query += ' AND c.workerGithubLogin = @w';
        params.push({ name: '@w', value: filter.workerGithubLogin });
      }
      if (filter.status) {
        query += ' AND c.status = @s';
        params.push({ name: '@s', value: filter.status });
      }
      if (filter.minAmountJpyc !== undefined) {
        query += ' AND c.amountJpyc >= @minA';
        params.push({ name: '@minA', value: filter.minAmountJpyc });
      }
      if (filter.maxAmountJpyc !== undefined) {
        query += ' AND c.amountJpyc <= @maxA';
        params.push({ name: '@maxA', value: filter.maxAmountJpyc });
      }
      query += ' ORDER BY c.createdAt DESC';
      const { resources } = await ordersC()
        .items.query<Order>(
          { query, parameters: params },
          { partitionKey: tenantId, maxItemCount: filter.limit },
        )
        .fetchAll();
      return resources;
    },
    async getOrder(id) {
      const { resource } = await ordersC().item(id, tenantId).read<Order>();
      if (!resource) return undefined;
      return resource.companyId === tenantId ? resource : undefined;
    },
    async listAllAccounts() {
      const { resources } = await accountsC()
        .items.query<Account>({
          query: 'SELECT * FROM c WHERE c.companyId = @cid',
          parameters: [{ name: '@cid', value: tenantId }],
        })
        .fetchAll();
      return resources;
    },
    async getTenant() {
      const { resource } = await tenantsC()
        .item(tenantId, tenantId)
        .read<Tenant>();
      return resource ?? undefined;
    },
  };
}
