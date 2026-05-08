import { describe, expect, it } from 'vitest';
import type { Order, Account } from '@gigflow/shared';
import { tools } from './index.js';
import type { ReadOnlyTenantCosmos } from '../lib/cosmos.js';

function fakeCosmos(orders: Order[], accounts: Account[] = []): ReadOnlyTenantCosmos {
  return {
    tenantId: 'tenant-test',
    async listOrders(filter) {
      return orders
        .filter(
          (o) =>
            (!filter.yearMonth || o.createdAt.startsWith(filter.yearMonth)) &&
            (!filter.workerGithubLogin ||
              o.workerGithubLogin === filter.workerGithubLogin) &&
            (!filter.status || o.status === filter.status),
        )
        .slice(0, filter.limit);
    },
    async getOrder(id) {
      return orders.find((o) => o.id === id);
    },
    async listAllAccounts() {
      return accounts;
    },
    async getTenant() {
      return undefined;
    },
  };
}

const baseOrder = (over: Partial<Order> = {}): Order => ({
  id: 'o-1',
  companyId: 'tenant-test',
  requesterId: 'pm',
  workerGithubLogin: 'sato',
  workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  description: 'feature',
  acceptanceCriteria: ['ci'],
  amountJpyc: 50000,
  deadline: '2026-06-01',
  repository: 'demo/workspace',
  status: 'bookkept',
  createdAt: '2026-04-15T10:00:00Z',
  updatedAt: '2026-04-15T10:00:00Z',
  bookkeepingArtifacts: {
    journalEntry: {
      debit: { account: '外注費', amount: 50000 },
      credit: { account: 'JPYC', amount: 50000 },
      description: 'sato/feature/order:o-1',
      dateLocal: '2026-04-15',
    },
    withholding: { applies: false, rationale: '海外居住者' },
    paymentStatementMarkdown: '# stmt',
    needsHumanReview: false,
    generatedAt: '2026-04-15T10:01:00Z',
  },
  ...over,
});

const ctx = (cosmos: ReadOnlyTenantCosmos) => ({
  tenantId: 'tenant-test',
  userId: 'u',
  roles: ['Accountant'],
  scopes: ['mcp.read'],
  cosmos,
});

describe('mcp tools', () => {
  it('queryOrders filters by yearMonth + worker', async () => {
    const c = fakeCosmos([
      baseOrder({ id: 'a', createdAt: '2026-04-01T00:00:00Z' }),
      baseOrder({ id: 'b', createdAt: '2026-05-01T00:00:00Z' }),
      baseOrder({ id: 'c', createdAt: '2026-04-10T00:00:00Z', workerGithubLogin: 'taro' }),
    ]);
    const out = (await tools.queryOrders!.execute(
      { yearMonth: '2026-04', workerGithubLogin: 'sato', limit: 10 },
      ctx(c),
    )) as Order[];
    expect(out.map((o) => o.id)).toEqual(['a']);
  });

  it('getMonthlyTotals aggregates by worker and status', async () => {
    const c = fakeCosmos([
      baseOrder({ id: 'a', amountJpyc: 30000 }),
      baseOrder({ id: 'b', amountJpyc: 70000, workerGithubLogin: 'taro' }),
      baseOrder({ id: 'c', amountJpyc: 20000, status: 'created' }),
    ]);
    const out = (await tools.getMonthlyTotals!.execute(
      { yearMonth: '2026-04' },
      ctx(c),
    )) as {
      totalAmountJpyc: number;
      byWorker: { worker: string; amountJpyc: number }[];
    };
    expect(out.totalAmountJpyc).toBe(120000);
    expect(out.byWorker[0]!.amountJpyc).toBe(70000);
  });

  it('getWithholdingReport tallies applied vs not', async () => {
    const c = fakeCosmos(
      [
        baseOrder({
          id: 'a',
          createdAt: '2026-03-01T00:00:00Z',
          bookkeepingArtifacts: {
            ...baseOrder().bookkeepingArtifacts!,
            withholding: { applies: true, rate: 10.21, amountJpyc: 5105, rationale: 'r' },
          },
        }),
        baseOrder({ id: 'b', createdAt: '2026-04-01T00:00:00Z' }),
      ],
      [
        {
          id: 't:sato',
          companyId: 'tenant-test',
          type: 'worker',
          displayName: 'Sato',
          roles: ['Worker'],
          worker: { githubLogin: 'sato', wallet: '0xfff' },
          createdAt: '',
        },
      ],
    );
    const out = (await tools.getWithholdingReport!.execute(
      { workerGithubLogin: 'sato', year: 2026 },
      ctx(c),
    )) as {
      withholdingApplied: { count: number };
      withholdingNotApplied: { count: number };
      worker: { displayName: string };
    };
    expect(out.withholdingApplied.count).toBe(1);
    expect(out.withholdingNotApplied.count).toBe(1);
    expect(out.worker.displayName).toBe('Sato');
  });
});
