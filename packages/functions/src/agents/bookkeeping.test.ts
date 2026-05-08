import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@gigflow/shared';
import { runBookkeeping } from './bookkeeping.js';
import { createFakeCosmos } from '../lib/cosmos-fake.js';

const TENANT = 'tenant-test';

function buildSettledOrder(): Order {
  return {
    id: 'order-1',
    companyId: TENANT,
    requesterId: 'pm-1',
    workerGithubLogin: 'sato',
    workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    description: 'feature',
    acceptanceCriteria: ['CI'],
    amountJpyc: 50_000,
    deadline: '2026-06-01',
    repository: 'demo/workspace',
    status: 'settled',
    txHash: '0xtx',
    blockNumber: 12345,
    settledAt: '2026-05-15T10:00:00Z',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  };
}

describe('runBookkeeping', () => {
  it('parses LLM output and stores artifacts', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildSettledOrder());

    const llm = vi.fn(async () => ({
      content: JSON.stringify({
        journalEntry: {
          debit: { account: '外注費', amount: 50000 },
          credit: { account: '暗号資産（JPYC）', amount: 50000 },
          description: 'sato / feature / order:order-1',
          dateLocal: '2026-05-15',
        },
        withholding: {
          applies: false,
          rationale: 'プログラミング業務 + 海外居住者',
        },
        paymentStatementMarkdown: '# 支払調書',
        needsHumanReview: false,
      }),
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      toolCallsMade: 0,
    }));
    const sendCard = vi.fn(async () => undefined);

    const out = await runBookkeeping(
      {
        tenantId: TENANT,
        order: buildSettledOrder(),
        settlement: {
          txHash: '0xtx',
          blockNumber: 12345,
          settledAt: '2026-05-15T10:00:00Z',
          amountJpyc: 50_000,
          recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      },
      { cosmos, runWithTools: llm as never, sendCard },
    );

    expect(out.withholding.applies).toBe(false);
    expect(out.needsHumanReview).toBe(false);
    expect(out.generatedAt).toMatch(/T/);
    const stored = await cosmos.getOrder('order-1');
    expect(stored?.status).toBe('bookkept');
    expect(stored?.bookkeepingArtifacts?.journalEntry.debit.amount).toBe(50000);
  });

  it('throws on invalid JSON output', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildSettledOrder());
    const llm = vi.fn(async () => ({
      content: 'not json',
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      toolCallsMade: 0,
    }));
    await expect(
      runBookkeeping(
        {
          tenantId: TENANT,
          order: buildSettledOrder(),
          settlement: {
            txHash: '0xtx',
            blockNumber: 12345,
            settledAt: '2026-05-15T10:00:00Z',
            amountJpyc: 50_000,
            recipient: '0xab',
          },
        },
        { cosmos, runWithTools: llm as never, sendCard: vi.fn() },
      ),
    ).rejects.toThrow(/bookkeeping_output_invalid/);
  });
});
