import { CosmosClient, type Container, type ItemDefinition } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type {
  Order,
  GigflowEvent,
  Account,
  Tenant,
  OrderStatus,
} from '@gigflow/shared';
import { canTransition } from '@gigflow/shared';
import { env } from './env.js';
import { logger } from './logger.js';

let client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (client) return client;
  client = new CosmosClient({
    endpoint: env.cosmosEndpoint(),
    aadCredentials: new DefaultAzureCredential(),
  });
  return client;
}

function db() {
  return getClient().database(env.cosmosDatabase());
}

function ordersContainer(): Container {
  return db().container('orders');
}
function eventsContainer(): Container {
  return db().container('events');
}
function accountsContainer(): Container {
  return db().container('accounts');
}
function tenantsContainer(): Container {
  return db().container('tenants');
}

export type TenantScopedCosmos = {
  tenantId: string;

  // orders
  getOrder(id: string): Promise<Order | undefined>;
  upsertOrder(order: Order): Promise<Order>;
  listOrders(filter?: {
    status?: OrderStatus;
    workerGithubLogin?: string;
    yearMonth?: string;
    limit?: number;
  }): Promise<Order[]>;
  transitionOrder(
    id: string,
    nextStatus: OrderStatus,
    patch?: Partial<Order>,
  ): Promise<Order>;

  // events
  appendEvent(event: Omit<GigflowEvent, 'id' | 'createdAt'>): Promise<void>;
  listEvents(orderId: string): Promise<GigflowEvent[]>;

  // accounts (tenant scoped)
  listWorkers(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | undefined>;

  // tenants
  getTenant(): Promise<Tenant | undefined>;
};

export function createTenantScopedCosmos(tenantId: string): TenantScopedCosmos {
  if (!tenantId) throw new Error('tenantId required');

  return {
    tenantId,

    async getOrder(id) {
      const { resource } = await ordersContainer()
        .item(id, tenantId)
        .read<Order>();
      if (!resource) return undefined;
      if (resource.companyId !== tenantId) return undefined;
      return resource;
    },

    async upsertOrder(order) {
      if (order.companyId !== tenantId) {
        throw new Error('tenant mismatch on upsertOrder');
      }
      const now = new Date().toISOString();
      const doc: Order & ItemDefinition = {
        ...order,
        updatedAt: now,
      };
      const { resource } = await ordersContainer().items.upsert<Order>(doc);
      if (!resource) throw new Error('upsert failed');
      return resource;
    },

    async listOrders(filter = {}) {
      const params: { name: string; value: string }[] = [
        { name: '@companyId', value: tenantId },
      ];
      let query = 'SELECT * FROM c WHERE c.companyId = @companyId';
      if (filter.status) {
        query += ' AND c.status = @status';
        params.push({ name: '@status', value: filter.status });
      }
      if (filter.workerGithubLogin) {
        query += ' AND c.workerGithubLogin = @worker';
        params.push({ name: '@worker', value: filter.workerGithubLogin });
      }
      if (filter.yearMonth) {
        query += ' AND STARTSWITH(c.createdAt, @ym)';
        params.push({ name: '@ym', value: filter.yearMonth });
      }
      query += ' ORDER BY c.createdAt DESC';
      const { resources } = await ordersContainer()
        .items.query<Order>({ query, parameters: params }, { partitionKey: tenantId, maxItemCount: filter.limit ?? 50 })
        .fetchAll();
      return resources;
    },

    async transitionOrder(id, nextStatus, patch) {
      const current = await this.getOrder(id);
      if (!current) throw new Error(`order not found: ${id}`);
      if (!canTransition(current.status, nextStatus)) {
        throw new Error(
          `invalid transition: ${current.status} -> ${nextStatus}`,
        );
      }
      const updated: Order = {
        ...current,
        ...patch,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      const accessCondition = current._etag
        ? { type: 'IfMatch' as const, condition: current._etag }
        : undefined;
      const { resource } = await ordersContainer()
        .item(id, tenantId)
        .replace<Order>(updated, accessCondition ? { accessCondition } : undefined);
      if (!resource) throw new Error('replace failed');
      logger.info({ orderId: id, from: current.status, to: nextStatus }, 'order transitioned');
      return resource;
    },

    async appendEvent(event) {
      const doc: GigflowEvent = {
        id: cryptoRandomId(),
        createdAt: new Date().toISOString(),
        ...event,
      };
      await eventsContainer().items.create<GigflowEvent>(doc);
    },

    async listEvents(orderId) {
      const { resources } = await eventsContainer()
        .items.query<GigflowEvent>(
          {
            query:
              'SELECT * FROM c WHERE c.orderId = @oid ORDER BY c.createdAt ASC',
            parameters: [{ name: '@oid', value: orderId }],
          },
          { partitionKey: orderId },
        )
        .fetchAll();
      return resources;
    },

    async listWorkers() {
      const { resources } = await accountsContainer()
        .items.query<Account>({
          query:
            'SELECT * FROM c WHERE c.companyId = @cid AND c.type = "worker"',
          parameters: [{ name: '@cid', value: tenantId }],
        })
        .fetchAll();
      return resources;
    },

    async getAccount(id) {
      const { resource } = await accountsContainer()
        .item(id, id)
        .read<Account>();
      if (!resource) return undefined;
      if (resource.companyId !== tenantId) return undefined;
      return resource;
    },

    async getTenant() {
      const { resource } = await tenantsContainer()
        .item(tenantId, tenantId)
        .read<Tenant>();
      return resource ?? undefined;
    },
  };
}

function cryptoRandomId(): string {
  // RFC 4122 v4 fallback (Node 20+ has globalThis.crypto.randomUUID)
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export const cosmos = {
  createTenantScopedCosmos,
};
