/**
 * In-memory implementation of TenantScopedCosmos for unit tests.
 * Mirrors the public API of `cosmos.ts` without touching Azure.
 */
import type {
  Order,
  GigflowEvent,
  Account,
  Tenant,
  OrderStatus,
} from '@gigflow/shared';
import { canTransition } from '@gigflow/shared';
import type { TenantScopedCosmos } from './cosmos.js';

export type FakeStore = {
  orders: Map<string, Order>;
  events: GigflowEvent[];
  accounts: Map<string, Account>;
  tenants: Map<string, Tenant>;
};

export function createFakeStore(): FakeStore {
  return {
    orders: new Map(),
    events: [],
    accounts: new Map(),
    tenants: new Map(),
  };
}

export function createFakeCosmos(
  tenantId: string,
  store: FakeStore = createFakeStore(),
): TenantScopedCosmos & { _store: FakeStore } {
  return {
    tenantId,
    _store: store,

    async getOrder(id) {
      const o = store.orders.get(id);
      if (!o) return undefined;
      return o.companyId === tenantId ? { ...o } : undefined;
    },

    async upsertOrder(order) {
      if (order.companyId !== tenantId) {
        throw new Error('tenant mismatch on upsertOrder');
      }
      const next: Order = { ...order, updatedAt: new Date().toISOString() };
      store.orders.set(order.id, next);
      return { ...next };
    },

    async listOrders(filter = {}) {
      let list = [...store.orders.values()].filter(
        (o) => o.companyId === tenantId,
      );
      if (filter.status) list = list.filter((o) => o.status === filter.status);
      if (filter.workerGithubLogin)
        list = list.filter(
          (o) => o.workerGithubLogin === filter.workerGithubLogin,
        );
      if (filter.yearMonth)
        list = list.filter((o) => o.createdAt.startsWith(filter.yearMonth!));
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      if (filter.limit) list = list.slice(0, filter.limit);
      return list.map((o) => ({ ...o }));
    },

    async transitionOrder(id, nextStatus, patch) {
      const current = store.orders.get(id);
      if (!current || current.companyId !== tenantId) {
        throw new Error(`order not found: ${id}`);
      }
      if (!canTransition(current.status, nextStatus)) {
        throw new Error(
          `invalid transition: ${current.status} -> ${nextStatus}`,
        );
      }
      const next: Order = {
        ...current,
        ...patch,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      store.orders.set(id, next);
      return { ...next };
    },

    async appendEvent(event) {
      store.events.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        ...event,
      });
    },

    async listEvents(orderId) {
      return store.events
        .filter((e) => e.orderId === orderId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map((e) => ({ ...e }));
    },

    async listWorkers() {
      return [...store.accounts.values()].filter(
        (a) => a.companyId === tenantId && a.type === 'worker',
      );
    },

    async getAccount(id) {
      const a = store.accounts.get(id);
      if (!a) return undefined;
      return a.companyId === tenantId ? { ...a } : undefined;
    },

    async getTenant() {
      return store.tenants.get(tenantId);
    },
  };
}
