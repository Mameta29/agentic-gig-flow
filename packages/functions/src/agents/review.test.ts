import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@gigflow/shared';
import { runReview } from './review.js';
import { createFakeCosmos } from '../lib/cosmos-fake.js';

const TENANT = 'tenant-test';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    companyId: TENANT,
    requesterId: 'pm-1',
    workerGithubLogin: 'sato',
    workerWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    description: 'コーポレートサイトにお問い合わせセクションを追加',
    acceptanceCriteria: ['CI passes', 'tests added'],
    amountJpyc: 50_000,
    deadline: '2026-06-01',
    repository: 'demo/workspace',
    status: 'pr_opened',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

describe('runReview', () => {
  it('approves: LLM posts APPROVE via tool, Functions merges server-side AFTER transition', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    // Spy on the order status at the moment mergePr is called. Prior to the
    // race fix this would be 'pr_opened' (or 'created'); after the fix it
    // must already be 'review_passed' so the Settlement Agent triggered by the
    // resulting `pull_request closed` webhook can proceed.
    let statusAtMerge: string | undefined;
    const mergePr = vi.fn(async () => {
      const o = await cosmos.getOrder('order-1');
      statusAtMerge = o?.status;
      return { merged: true, sha: 'shaaaa' };
    });
    const fetchDiff = vi.fn(async () => ({
      // Includes a test file so the deterministic "tests added" guard passes.
      diff: '+++ b/a.ts\n+ x\n+++ b/a.test.ts\n+ test',
      truncated: false,
    }));
    const runWithToolsFake = vi.fn(async (opts: never) => {
      const o = opts as unknown as {
        toolImpls: Record<string, (a: Record<string, unknown>) => Promise<unknown>>;
      };
      await o.toolImpls.submitReviewComment!({
        event: 'APPROVE',
        body: '## ✅ Review passed',
      });
      return {
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
        toolCallsMade: 1,
      };
    });

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
    expect(submitReview).toHaveBeenCalledOnce();
    expect(mergePr).toHaveBeenCalledOnce();
    // The critical invariant: order must already be review_passed before
    // merge runs.
    expect(statusAtMerge).toBe('review_passed');
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_passed');
  });

  it('does not merge when autoMerge=false even if approve', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: true, sha: 'shaaaa' }));

    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'approve',
        qualityScore: 75,
        criteriaResults: [
          { criterion: 'CI passes', met: true, evidence: 'check_run success' },
        ],
        reviewComment: '## ✅ Review passed (no auto-merge)',
        autoMerge: false,
      }),
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      toolCallsMade: 0,
    }));

    await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 5,
        ciStatus: 'success',
      },
      {
        cosmos,
        fetchDiff: vi.fn(async () => ({ diff: '+++ b/src/x.ts\n+ x\n+++ b/src/x.test.ts\n+ test', truncated: false })),
        submitReview,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );

    expect(mergePr).not.toHaveBeenCalled();
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_passed');
  });

  it('rejects on CI failure and posts REQUEST_CHANGES even when LLM omitted the tool', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: false, sha: '' }));

    // LLM did not invoke any tool — pure JSON only.
    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'reject',
        qualityScore: 50,
        criteriaResults: [
          { criterion: 'CI passes', met: false, evidence: 'check_run failure' },
        ],
        reviewComment: '## ❌ CI 未通過のため検収不可',
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
        fetchDiff: vi.fn(async () => ({ diff: '+++ b/src/x.ts\n+ x\n+++ b/src/x.test.ts\n+ test', truncated: false })),
        submitReview,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );
    expect(out.verdict).toBe('reject');
    // Fallback: the server posted REQUEST_CHANGES on behalf of the LLM.
    expect(submitReview).toHaveBeenCalledOnce();
    expect((submitReview.mock.calls[0] as unknown[])[0]).toMatchObject({
      event: 'REQUEST_CHANGES',
      prNumber: 5,
    });
    // Merge must not happen on reject.
    expect(mergePr).not.toHaveBeenCalled();
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_failed');
  });

  it('falls back to server-side APPROVE + server merges when LLM skipped the review tool', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: true, sha: 'fallbackmerge' }));

    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'approve',
        qualityScore: 85,
        criteriaResults: [
          { criterion: 'CI passes', met: true, evidence: 'check_run success' },
          { criterion: 'tests added', met: true, evidence: 'tests/contact.test.html' },
        ],
        reviewComment: '## ✅ Review passed',
        autoMerge: true,
      }),
      totalTokens: 200,
      promptTokens: 150,
      completionTokens: 50,
      toolCallsMade: 0,
    }));

    const out = await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 18,
        ciStatus: 'success',
      },
      {
        cosmos,
        fetchDiff: vi.fn(async () => ({ diff: '+++ b/src/x.ts\n+ x\n+++ b/src/x.test.ts\n+ test', truncated: false })),
        submitReview,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );

    expect(out.verdict).toBe('approve');
    expect(submitReview).toHaveBeenCalledOnce();
    expect((submitReview.mock.calls[0] as unknown[])[0]).toMatchObject({
      event: 'APPROVE',
      prNumber: 18,
    });
    expect(mergePr).toHaveBeenCalledOnce();
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_passed');
  });

  it('does not double-post when LLM already called submitReviewComment', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: false, sha: '' }));

    const runWithToolsFake = vi.fn(async (opts: never) => {
      const o = opts as unknown as {
        toolImpls: Record<string, (a: Record<string, unknown>) => Promise<unknown>>;
      };
      await o.toolImpls.submitReviewComment!({
        event: 'REQUEST_CHANGES',
        body: '## ❌ needs changes',
      });
      return {
        content: JSON.stringify({
          verdict: 'reject',
          qualityScore: 40,
          criteriaResults: [
            { criterion: 'tests added', met: false, evidence: 'no test files' },
          ],
          reviewComment: '## ❌ needs changes',
          autoMerge: false,
        }),
        totalTokens: 120,
        promptTokens: 90,
        completionTokens: 30,
        toolCallsMade: 1,
      };
    });

    await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 7,
        ciStatus: 'success',
      },
      {
        cosmos,
        fetchDiff: vi.fn(async () => ({ diff: '+++ b/src/x.ts\n+ x\n+++ b/src/x.test.ts\n+ test', truncated: false })),
        submitReview,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );

    // Only the tool-invoked call; fallback must not double-post.
    expect(submitReview).toHaveBeenCalledOnce();
    expect(mergePr).not.toHaveBeenCalled();
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
          fetchDiff: vi.fn(async () => ({ diff: '+++ b/src/x.ts\n+ x\n+++ b/src/x.test.ts\n+ test', truncated: false })),
          submitReview: vi.fn(),
          mergePr: vi.fn(),
          runWithTools: runWithToolsFake as never,
        },
      ),
    ).rejects.toThrow(/review_output_invalid/);
  });

  it('falls back to a plain PR comment when submitReview fails (own-PR 422)', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    // submitReview rejects like GitHub does for a review on your own PR.
    const submitReview = vi.fn(async () => {
      throw new Error('Can not request changes on your own pull request');
    });
    const createPrComment = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: false, sha: '' }));

    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'reject',
        qualityScore: 50,
        criteriaResults: [
          { criterion: 'CI passes', met: false, evidence: 'pending' },
        ],
        reviewComment: '## ❌ needs changes',
        autoMerge: false,
      }),
      totalTokens: 80,
      promptTokens: 60,
      completionTokens: 20,
      toolCallsMade: 0,
    }));

    const out = await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 9,
        ciStatus: 'success',
      },
      {
        cosmos,
        fetchDiff: vi.fn(async () => ({
          diff: '+++ b/src/x.ts\n+ x\n+++ b/src/x.test.ts\n+ test',
          truncated: false,
        })),
        submitReview,
        createPrComment,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );

    expect(out.verdict).toBe('reject');
    expect(submitReview).toHaveBeenCalledOnce(); // attempted formal review
    expect(createPrComment).toHaveBeenCalledOnce(); // fell back to a comment
    const arg = (createPrComment.mock.calls[0] as unknown[])[0] as {
      prNumber: number;
      body: string;
    };
    expect(arg.prNumber).toBe(9);
    expect(arg.body).toContain('needs changes');
  });

  it('deterministic guard overrides LLM false-approve when no test file is in the diff', async () => {
    const cosmos = createFakeCosmos(TENANT);
    await cosmos.upsertOrder(buildOrder());

    const submitReview = vi.fn(async () => undefined);
    const mergePr = vi.fn(async () => ({ merged: true, sha: 'x' }));

    // LLM approves (incl. marking "tests added" met) — but the diff has NO test
    // file. The code-side guard must force this to reject and block the merge.
    const runWithToolsFake = vi.fn(async () => ({
      content: JSON.stringify({
        verdict: 'approve',
        qualityScore: 92,
        criteriaResults: [
          { criterion: 'CI passes', met: true, evidence: 'success' },
          { criterion: 'tests added', met: true, evidence: '今回は許容範囲と判断' },
        ],
        reviewComment: '## ✅ Review passed',
        autoMerge: true,
      }),
      totalTokens: 90,
      promptTokens: 70,
      completionTokens: 20,
      toolCallsMade: 0,
    }));

    const out = await runReview(
      {
        tenantId: TENANT,
        order: buildOrder(),
        repository: 'demo/workspace',
        prNumber: 11,
        ciStatus: 'success',
      },
      {
        cosmos,
        // Code change only — NO test file added.
        fetchDiff: vi.fn(async () => ({
          diff: '+++ b/src/x.ts\n+ x',
          truncated: false,
        })),
        submitReview,
        mergePr,
        runWithTools: runWithToolsFake as never,
      },
    );

    // The guard turns the false-approve into a reject; money must not move.
    expect(out.verdict).toBe('reject');
    expect(out.autoMerge).toBe(false);
    expect(mergePr).not.toHaveBeenCalled();
    const updated = await cosmos.getOrder('order-1');
    expect(updated?.status).toBe('review_failed');
  });
});
