import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@gigflow/shared';
import {
  runSettlement,
  MAX_AMOUNT_PER_TX,
  MAX_TX_PER_DAY_PER_AGENT,
} from './settlement.js';
import { createFakeCosmos, createFakeStore } from '../lib/cosmos-fake.js';

const TENANT = 'tenant-test';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    companyId: TENANT,
    requesterId: 'pm-1',
    workerGithubLogin: 'sato',
    workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    description: 'feature',
    acceptanceCriteria: ['CI passes'],
    amountJpyc: 50_000,
    deadline: '2026-06-01',
    repository: 'demo/workspace',
    status: 'review_passed',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

describe('runSettlement', () => {
  it('transfers JPYC and updates order on the happy path', async () => {
    const store = createFakeStore();
    const cosmos = createFakeCosmos(TENANT, store);
    await cosmos.upsertOrder(buildOrder());

    const transfer = vi.fn().mockResolvedValue({
      txHash: '0xtx',
      blockNumber: 12345n,
      from: '0xfrom',
      to: '0xto',
      amountJpyc: 50_000,
    });

    const result = await runSettlement(
      {
        tenantId: TENANT,
        orderId: 'order-1',
        prMergeEvent: { prNumber: 1, mergeCommitSha: 'abc', mergedAt: '' },
      },
      { cosmos, transferJpyc: transfer, now: () => new Date('2026-05-15') },
    );

    expect(transfer).toHaveBeenCalledTimes(1);
    expect(result.txHash).toBe('0xtx');
    expect(result.blockNumber).toBe(12345);
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('settled');
    expect(updated?.txHash).toBe('0xtx');
    const events = await cosmos.listEvents('order-1');
    expect(events.map((e) => e.type)).toEqual([
      'settlement_started',
      'settlement_completed',
    ]);
  });

  it('posts a PR comment with the tx hash after successful settlement', async () => {
    const store = createFakeStore();
    const cosmos = createFakeCosmos(TENANT, store);
    await cosmos.upsertOrder(buildOrder({ prNumber: 42 }));

    const transfer = vi.fn().mockResolvedValue({
      txHash: '0xabc123',
      blockNumber: 999n,
      from: '0xfrom',
      to: '0xto',
      amountJpyc: 50_000,
    });
    const createPrComment = vi.fn().mockResolvedValue(undefined);

    await runSettlement(
      {
        tenantId: TENANT,
        orderId: 'order-1',
        prMergeEvent: {
          prNumber: 42,
          mergeCommitSha: 'abc',
          mergedAt: '2026-05-15T00:00:00Z',
        },
      },
      {
        cosmos,
        transferJpyc: transfer,
        createPrComment,
        now: () => new Date('2026-05-15T00:00:03Z'),
      },
    );

    expect(createPrComment).toHaveBeenCalledTimes(1);
    const arg = createPrComment.mock.calls[0]?.[0] as {
      repository: string;
      prNumber: number;
      body: string;
    };
    expect(arg.repository).toBe('demo/workspace');
    expect(arg.prNumber).toBe(42);
    expect(arg.body).toContain('0xabc123');
    expect(arg.body).toContain('50,000 JPYC');
    expect(arg.body).toContain('polygonscan.com/tx/0xabc123');
    const events = await cosmos.listEvents('order-1');
    expect(events.map((e) => e.type)).toContain('settlement_pr_comment_posted');
  });

  it('does not fail settlement when PR comment posting fails', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder({ prNumber: 7 }));

    const transfer = vi.fn().mockResolvedValue({
      txHash: '0xtx',
      blockNumber: 1n,
      from: '0xfrom',
      to: '0xto',
      amountJpyc: 50_000,
    });
    const createPrComment = vi.fn().mockRejectedValue(new Error('github 500'));

    const result = await runSettlement(
      {
        tenantId: TENANT,
        orderId: 'order-1',
        prMergeEvent: { prNumber: 7, mergeCommitSha: '', mergedAt: '' },
      },
      { cosmos, transferJpyc: transfer, createPrComment },
    );

    expect(result.txHash).toBe('0xtx');
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('settled');
  });

  it('rejects double settlement (idempotency)', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(
      buildOrder({ status: 'settled', txHash: '0xprev' }),
    );
    const transfer = vi.fn();
    await expect(
      runSettlement(
        {
          tenantId: TENANT,
          orderId: 'order-1',
          prMergeEvent: { prNumber: 1, mergeCommitSha: '', mergedAt: '' },
        },
        { cosmos, transferJpyc: transfer },
      ),
    ).rejects.toThrow(/already_settled/);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('rejects when status is not review_passed', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder({ status: 'pr_opened' }));
    const transfer = vi.fn();
    await expect(
      runSettlement(
        {
          tenantId: TENANT,
          orderId: 'order-1',
          prMergeEvent: { prNumber: 1, mergeCommitSha: '', mergedAt: '' },
        },
        { cosmos, transferJpyc: transfer },
      ),
    ).rejects.toThrow(/invalid_status/);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('rejects amount exceeding per-tx limit', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(
      buildOrder({ amountJpyc: MAX_AMOUNT_PER_TX + 1 }),
    );
    const transfer = vi.fn();
    await expect(
      runSettlement(
        {
          tenantId: TENANT,
          orderId: 'order-1',
          prMergeEvent: { prNumber: 1, mergeCommitSha: '', mergedAt: '' },
        },
        { cosmos, transferJpyc: transfer },
      ),
    ).rejects.toThrow(/amount exceeds/);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('rejects bad recipient address', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder({ workerWallet: '0xnotvalid' }));
    const transfer = vi.fn();
    await expect(
      runSettlement(
        {
          tenantId: TENANT,
          orderId: 'order-1',
          prMergeEvent: { prNumber: 1, mergeCommitSha: '', mergedAt: '' },
        },
        { cosmos, transferJpyc: transfer },
      ),
    ).rejects.toThrow(/bad recipient address/);
    expect(transfer).not.toHaveBeenCalled();
  });

  it('rejects when daily limit is reached', async () => {
    const store = createFakeStore();
    const cosmos = createFakeCosmos(TENANT, store);
    // pre-fill `MAX_TX_PER_DAY_PER_AGENT` settled orders today
    const today = '2026-05-15T10:00:00Z';
    for (let i = 0; i < MAX_TX_PER_DAY_PER_AGENT; i++) {
      await cosmos.upsertOrder(
        buildOrder({
          id: `prev-${i}`,
          status: 'settled',
          settledAt: today,
          txHash: `0x${i}`,
        }),
      );
    }
    await cosmos.upsertOrder(buildOrder({ id: 'order-new' }));

    const transfer = vi.fn();
    await expect(
      runSettlement(
        {
          tenantId: TENANT,
          orderId: 'order-new',
          prMergeEvent: { prNumber: 1, mergeCommitSha: '', mergedAt: '' },
        },
        {
          cosmos,
          transferJpyc: transfer,
          now: () => new Date('2026-05-15T12:00:00Z'),
        },
      ),
    ).rejects.toThrow(/daily settlement limit/);
    expect(transfer).not.toHaveBeenCalled();
  });
});
