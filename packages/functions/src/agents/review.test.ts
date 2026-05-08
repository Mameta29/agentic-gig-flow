import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@gigflow/shared';
import { runReview } from './review.js';
import { createFakeCosmos } from '../lib/cosmos-fake.js';

const TENANT = 'tenant-test';

function buildOrder(): Order {
  return {
    id: 'order-1',
    companyId: TENANT,
    requesterId: 'pm-1',
    workerGithubLogin: 'sato',
    workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    description: 'feature',
    acceptanceCriteria: ['CI passes', 'tests added'],
    amountJpyc: 50_000,
    deadline: '2026-06-01',
    repository: 'demo/workspace',
    status: 'pr_opened',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  };
}

describe('runReview', () => {
  it('approves and merges when LLM returns autoMerge=true', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: true, sha: 'shaaaa' }));
    const fetchDiff = vi.fn(async () => ({
      diff: '+++ a.ts\n+ x',
      truncated: false,
    }));
    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'approve',
        qualityScore: 88,
        criteriaResults: [
          { criterion: 'CI passes', met: true, evidence: 'check_run success' },
          { criterion: 'tests added', met: true, evidence: 'a.test.ts' },
        ],
        reviewComment: '## ✅ Review passed',
        autoMerge: true,
      }),
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      toolCallsMade: 0,
    }));

    const out = await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 5,
        ciStatus: 'success',
      },
      {
        cosmos,
        fetchDiff,
        submitReview,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );

    expect(out.verdict).toBe('approve');
    expect(out.autoMerge).toBe(true);
    expect(fetchDiff).toHaveBeenCalledOnce();
    expect(runWithToolsFake).toHaveBeenCalledOnce();
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_passed');
  });

  it('rejects on CI failure', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'reject',
        qualityScore: 50,
        criteriaResults: [
          { criterion: 'CI passes', met: false, evidence: 'check_run failure' },
        ],
        reviewComment: '## ⚠️ Review needs changes',
        autoMerge: false,
      }),
      totalTokens: 50,
      promptTokens: 40,
      completionTokens: 10,
      toolCallsMade: 0,
    }));

    const out = await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 5,
        ciStatus: 'failure',
      },
      {
        cosmos,
        fetchDiff: vi.fn(async () => ({ diff: '', truncated: false })),
        submitReview: vi.fn(),
        mergePr: vi.fn(),
        runWithTools: runWithToolsFake as never,
      },
    );
    expect(out.verdict).toBe('reject');
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_failed');
  });

  it('throws on malformed JSON output', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const runWithToolsFake = vi.fn(async () => ({
      content: 'not json',
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      toolCallsMade: 0,
    }));

    await expect(
      runReview(
        {
          tenantId: TENANT,
          order: buildOrder(),
          repository: 'demo/workspace',
          prNumber: 5,
          ciStatus: 'success',
        },
        {
          cosmos,
          fetchDiff: vi.fn(async () => ({ diff: '', truncated: false })),
          submitReview: vi.fn(),
          mergePr: vi.fn(),
          runWithTools: runWithToolsFake as never,
        },
      ),
    ).rejects.toThrow(/review_output_invalid/);
  });
});
