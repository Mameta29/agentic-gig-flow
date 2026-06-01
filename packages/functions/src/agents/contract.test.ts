import { describe, expect, it, vi } from 'vitest';
import { runContract } from './contract.js';
import { createFakeCosmos } from '../lib/cosmos-fake.js';
import type { Account, Tenant } from '@gigflow/shared';

const TENANT = 'tenant-test';

function seed() {
  const cosmos = createFakeCosmos(TENANT);
  const tenant: Tenant = {
    id: TENANT,
    displayName: 'Marche',
    defaultRepository: 'demo/workspace',
    defaultCurrency: 'JPYC',
    spendingLimitPerOrder: 100_000,
    createdAt: '2026-01-01T00:00:00Z',
  };
  cosmos._store.tenants.set(TENANT, tenant);
  const worker: Account = {
    id: `${TENANT}:sato`,
    companyId: TENANT,
    type: 'worker',
    displayName: 'Sato Taro',
    roles: ['Worker'],
    worker: {
      githubLogin: 'sato',
      wallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      countryCode: 'TH',
      timezone: 'Asia/Bangkok',
    },
    createdAt: '2026-01-01T00:00:00Z',
  };
  cosmos._store.accounts.set(worker.id, worker);
  return cosmos;
}

function buildLLMRunner(opts: {
  validate?: 'ok' | 'over' | 'past' | 'unknown_worker';
  finalContent: string;
}) {
  return vi.fn(async (req: {
    toolImpls: Record<string, (a: Record<string, unknown>) => Promise<unknown>>;
  }) => {
    // Simulate the LLM's tool dance.
    if (opts.validate) {
      const args = {
        workerGithubLogin: opts.validate === 'unknown_worker' ? 'unknown' : 'sato',
        workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        amountJpyc: opts.validate === 'over' ? 9_999_999 : 50_000,
        deadline: opts.validate === 'past' ? '2020-01-01' : '2026-12-31',
        repository: 'demo/workspace',
        acceptanceCriteria: ['CI が通過している', 'テストが追加されている'],
        description: 'feature x',
      };
      const v = await req.toolImpls.validateOrderRequest!(args);
      if ((v as { ok: boolean }).ok === false) {
        return {
          content: JSON.stringify({ error: (v as { error: string }).error }),
          totalTokens: 1,
          promptTokens: 1,
          completionTokens: 0,
          toolCallsMade: 1,
        };
      }
      // happy path: also call createGithubIssue + saveOrder
      const generatedOrderId = (req as unknown as { userMessage: { generatedOrderId: string } })
        .userMessage.generatedOrderId;
      const issue = (await req.toolImpls.createGithubIssue!({
        repository: args.repository,
        title: 'feature x',
        body: `<!-- gigflow:orderId=${generatedOrderId} -->`,
        assignee: 'sato',
      })) as { number: number; url: string; ok: boolean };
      await req.toolImpls.saveOrder!({
        orderId: generatedOrderId,
        issueNumber: issue.number,
        issueUrl: issue.url,
        workerGithubLogin: args.workerGithubLogin,
        workerWallet: args.workerWallet,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        amountJpyc: args.amountJpyc,
        deadline: args.deadline,
        repository: args.repository,
      });
    }
    return {
      content: opts.finalContent,
      totalTokens: 1,
      promptTokens: 1,
      completionTokens: 1,
      toolCallsMade: 3,
    };
  });
}

describe('runContract', () => {
  it('creates issue + cosmos order on the happy path', async () => {
    const cosmos = seed();
    const createIssue = vi.fn(async () => ({ number: 7, url: 'https://x' }));
    const llm = buildLLMRunner({
      validate: 'ok',
      finalContent: '__placeholder__',
    });

    // The fake LLM uses generatedOrderId from the userMessage; we capture it and
    // make the LLM emit a final JSON pointing at it.
    let captured: { generatedOrderId?: string } = {};
    const llmCapturing = vi.fn(async (opts) => {
      captured = (opts as { userMessage: typeof captured }).userMessage;
      const wrapped = await llm({
        toolImpls: opts.toolImpls,
        userMessage: opts.userMessage,
      } as never);
      return {
        ...wrapped,
        content: JSON.stringify({
          orderId: captured.generatedOrderId,
          issueNumber: 7,
          issueUrl: 'https://x',
          parsed: {
            workerGithubLogin: 'sato',
            workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            amountJpyc: 50000,
            deadline: '2026-12-31',
            repository: 'demo/workspace',
            acceptanceCriteria: ['CI が通過している', 'テストが追加されている'],
            description: 'feature x',
          },
        }),
      };
    });

    const out = await runContract(
      {
        tenantId: TENANT,
        requesterId: 'pm-1',
        rawDescription: 'sato さんに feature x を 5万円で 2週間後',
        today: '2026-05-15',
      },
      {
        cosmos,
        createIssue,
        runWithTools: llmCapturing as never,
      },
    );

    expect(out.issueNumber).toBe(7);
    expect(createIssue).toHaveBeenCalledOnce();
    const stored = await cosmos.getOrder(out.orderId);
    expect(stored?.status).toBe('created');
    expect(stored?.amountJpyc).toBe(50000);
  });

  it('rejects when rawDescription names a worker not in workers list', async () => {
    const cosmos = seed();
    const createIssue = vi.fn();
    // The LLM tries to validate with a bogus login that doesn't match any
    // worker (e.g. "後藤さん" → "goto" — there is no goto in seed()). The
    // fuzzy matcher should also fail because rawDescription has no "sato"
    // substring. unknown_worker must come back.
    const llm = vi.fn(async (opts) => {
      const tools = (opts as {
        toolImpls: Record<string, (a: Record<string, unknown>) => Promise<unknown>>;
      }).toolImpls;
      const v = await tools.validateOrderRequest!({
        workerGithubLogin: 'goto',
        workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        amountJpyc: 30_000,
        deadline: '2026-12-31',
        repository: 'demo/workspace',
        acceptanceCriteria: ['CI 通過', 'テスト追加'],
        description: 'feature x',
      });
      return {
        content: JSON.stringify({ error: (v as { error: string }).error }),
        totalTokens: 1,
        promptTokens: 1,
        completionTokens: 0,
        toolCallsMade: 1,
      };
    });

    await expect(
      runContract(
        {
          tenantId: TENANT,
          requesterId: 'pm-1',
          rawDescription: '後藤 さんに feature x を 3万円で 2週間後',
          today: '2026-05-15',
        },
        { cosmos, createIssue, runWithTools: llm as never },
      ),
    ).rejects.toThrow(/unknown_worker/);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('errors on over-budget request', async () => {
    const cosmos = seed();
    const createIssue = vi.fn();
    const llm = vi.fn(async (opts) => {
      const tools = (opts as {
        toolImpls: Record<string, (a: Record<string, unknown>) => Promise<unknown>>;
      }).toolImpls;
      const v = await tools.validateOrderRequest!({
        workerGithubLogin: 'sato',
        workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        amountJpyc: 9_999_999,
        deadline: '2026-12-31',
        repository: 'demo/workspace',
        acceptanceCriteria: ['CI 通過'],
        description: 'big',
      });
      return {
        content: JSON.stringify({ error: (v as { error: string }).error }),
        totalTokens: 1,
        promptTokens: 1,
        completionTokens: 0,
        toolCallsMade: 1,
      };
    });

    await expect(
      runContract(
        {
          tenantId: TENANT,
          requesterId: 'pm-1',
          rawDescription: 'over budget',
          today: '2026-05-15',
        },
        { cosmos, createIssue, runWithTools: llm as never },
      ),
    ).rejects.toThrow(/over_spending_limit/);
    expect(createIssue).not.toHaveBeenCalled();
  });
});
