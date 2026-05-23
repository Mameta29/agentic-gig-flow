import { z } from 'zod';
import type { Order } from '@gigflow/shared';
import {
  createTenantScopedCosmos,
  type TenantScopedCosmos,
} from '../lib/cosmos.js';
import {
  getPrDiff,
  submitReview as ghSubmitReview,
  mergePr as ghMergePr,
} from '../lib/github.js';
import { runWithTools, type RunWithToolsOpts } from '../lib/openai.js';
import { logger } from '../lib/logger.js';

const ReviewOutputSchema = z.object({
  verdict: z.enum(['approve', 'reject']),
  qualityScore: z.number().int().min(0).max(100),
  criteriaResults: z.array(
    z.object({
      criterion: z.string(),
      met: z.boolean(),
      evidence: z.string(),
    }),
  ),
  reviewComment: z.string(),
  autoMerge: z.boolean(),
});

export type ReviewAgentInput = {
  tenantId: string;
  order: Order;
  repository: string;
  prNumber: number;
  ciStatus: 'success' | 'failure' | 'pending';
};

export type ReviewAgentOutput = z.infer<typeof ReviewOutputSchema>;

export type ReviewDeps = {
  cosmos?: TenantScopedCosmos;
  fetchDiff?: typeof getPrDiff;
  submitReview?: typeof ghSubmitReview;
  mergePr?: typeof ghMergePr;
  runWithTools?: typeof runWithTools;
};

const SYSTEM_PROMPT = `あなたは Agentic Gig-Flow の **Review Agent** です。受注者が提出した Pull Request を、契約時に定義された検収基準で評価し、合格なら approve + マージ、不合格ならコメントで具体的な修正点を伝えます。

## 入力 JSON のフィールド
- pr.diff: PR の unified diff (50KB で truncated される場合あり)
- order.acceptanceCriteria: 検収基準の配列
- ciStatus: 'success' | 'failure' | 'pending'

## 判定ルール
- ciStatus !== 'success' なら必ず verdict='reject'、autoMerge=false。
- acceptanceCriteria 各項目について、diff から **証拠** (ファイルパス + 抜粋) を引用しながら met / not_met を判定する。推測でなく diff から確認できる事実のみ。
- qualityScore は 0..100 の整数。80以上=慣用的、60-79=動作するが改善余地、0-59=重大問題。
- 合格条件 (autoMerge=true) を全部満たすこと:
  - ciStatus === 'success'
  - すべての criteriaResults[i].met === true
  - qualityScore >= 70
  - 重大なバグ・脆弱性を発見していない

## 必須の手順
1. (オプション) ツール 'submitReviewComment' を呼んでレビュー本文を GitHub に投稿。
2. autoMerge === true のときのみツール 'mergePullRequest' を呼ぶ。
3. 最後に **JSON だけを** content として返す (説明文不要)。スキーマ:
{
  "verdict": "approve" | "reject",
  "qualityScore": 0-100 の整数,
  "criteriaResults": [{"criterion": string, "met": boolean, "evidence": string}, ...],
  "reviewComment": string,
  "autoMerge": boolean
}

## reviewComment の形式 (合格時)
\`\`\`
## ✅ Review passed by Agentic Gig-Flow
**Quality score**: <n>/100
### 検収基準
| 基準 | 結果 | 根拠 |
|---|---|---|
| ... | ✅/❌ | ... |
このPRをマージすると、<amount> JPYC が @<worker> に自動送金されます。
\`\`\`

## reviewComment の形式 (不合格時)
\`\`\`
## ⚠️ Review needs changes
**Quality score**: <n>/100
### 修正してほしい項目
1. <具体的修正点>: <ファイル:行> — <理由>
\`\`\`

## 制約
- 最大 4 ターンで完了する。
- diff が truncated の場合はその旨を reviewComment に明記。`;

export async function runReview(
  input: ReviewAgentInput,
  deps: ReviewDeps = {},
): Promise<ReviewAgentOutput> {
  const cosmos = deps.cosmos ?? createTenantScopedCosmos(input.tenantId);
  const fetchDiff = deps.fetchDiff ?? getPrDiff;
  const submitReview = deps.submitReview ?? ghSubmitReview;
  const mergePr = deps.mergePr ?? ghMergePr;
  const runner = deps.runWithTools ?? runWithTools;

  await cosmos.appendEvent({
    orderId: input.order.id,
    agent: 'review',
    type: 'review_started',
    payload: { prNumber: input.prNumber },
  });

  const { diff, truncated } = await fetchDiff({
    repository: input.repository,
    prNumber: input.prNumber,
    maxBytes: 50 * 1024,
  });

  const userMessage = {
    pr: {
      number: input.prNumber,
      diff,
      diffTruncated: truncated,
    },
    order: {
      id: input.order.id,
      description: input.order.description,
      acceptanceCriteria: input.order.acceptanceCriteria,
      amountJpyc: input.order.amountJpyc,
      workerGithubLogin: input.order.workerGithubLogin,
    },
    ciStatus: input.ciStatus,
  };

  const tools: RunWithToolsOpts['tools'] = [
    {
      type: 'function',
      function: {
        name: 'submitReviewComment',
        description:
          'Post a review comment on the PR. event must be APPROVE / REQUEST_CHANGES / COMMENT.',
        parameters: {
          type: 'object',
          properties: {
            event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] },
            body: { type: 'string' },
          },
          required: ['event', 'body'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mergePullRequest',
        description: 'Squash-merge the PR. Only call when autoMerge is true.',
        parameters: {
          type: 'object',
          properties: {
            commitTitle: { type: 'string' },
            commitMessage: { type: 'string' },
          },
          required: ['commitTitle'],
        },
      },
    },
  ];

  let didMerge = false;

  const toolImpls = {
    submitReviewComment: async (args: Record<string, unknown>) => {
      await submitReview({
        repository: input.repository,
        prNumber: input.prNumber,
        event: args.event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
        body: String(args.body ?? ''),
      });
      return { ok: true };
    },
    mergePullRequest: async (args: Record<string, unknown>) => {
      const res = await mergePr({
        repository: input.repository,
        prNumber: input.prNumber,
        commitTitle: String(args.commitTitle ?? `gigflow: PR #${input.prNumber}`),
        commitMessage: args.commitMessage as string | undefined,
      });
      didMerge = res.merged;
      return res;
    },
  };

  const result = await runner({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools,
    toolImpls,
    maxTurns: 5,
    responseFormat: 'json_object',
  });

  let parsed: ReviewAgentOutput;
  try {
    parsed = ReviewOutputSchema.parse(JSON.parse(result.content));
  } catch (err) {
    logger.error(
      { err: String(err), content: result.content },
      'review output parse failed',
    );
    throw new Error('review_output_invalid');
  }

  // Update Cosmos status BEFORE the merge tool side-effect is reflected.
  if (parsed.verdict === 'approve') {
    await cosmos.transitionOrder(input.order.id, 'review_passed', {});
  } else {
    await cosmos.transitionOrder(input.order.id, 'review_failed', {});
  }

  await cosmos.appendEvent({
    orderId: input.order.id,
    agent: 'review',
    type: parsed.verdict === 'approve' ? 'review_completed' : 'review_failed',
    payload: {
      qualityScore: parsed.qualityScore,
      autoMerge: parsed.autoMerge,
      didMerge,
      tokens: result.totalTokens,
      criteriaResults: parsed.criteriaResults,
      reviewComment: parsed.reviewComment,
    },
  });

  return parsed;
}
