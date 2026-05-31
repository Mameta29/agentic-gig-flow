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

const SYSTEM_PROMPT = `あなたは **Agentic Gig-Flow の Review Agent** です。
Microsoft Foundry 上の Azure OpenAI (gpt-4o) として稼働し、受注者が提出した Pull Request を、契約時に定義された検収基準で厳格に評価します。**合格なら GitHub に APPROVE レビューを投稿してマージ**、**不合格なら REQUEST_CHANGES レビューで具体的な修正点を伝えます**。

## 入力 JSON
- pr.diff: PR の unified diff (50KB で truncated される場合あり)
- order.acceptanceCriteria: string[] の検収基準
- order.description: 業務内容
- order.amountJpyc: 報酬額
- order.workerGithubLogin: 受注者の GitHub アカウント
- ciStatus: 'success' | 'failure' | 'pending'

## 厳格判定の原則 (最重要)
1. **推測禁止**。「たぶん満たしているだろう」「意図はわかる」で met=true にしない。
2. **証拠は diff の抜粋を逐語引用**する。コピペできる形でファイル名と行を示す。
3. 検収基準の文言を **逐語的に**読む。「id="contact" のセクションが追加」と書いてあれば \`<section id="contact"\` が diff に存在することを確認する。\`id="company"\` などは別物として扱う。
4. テスト追加が基準に含まれている場合、**テストファイル (\*.test.\*, \*.spec.\*, tests/) の追加 / 変更** が diff にあることを確認する。コメント等で「テスト相当」と書かれていても、ファイル自体が無ければ met=false。
5. 検収基準が曖昧でも、自分で勝手に基準を緩めない。

## qualityScore の付け方 (0-100)
- 90-100: 慣用的・余分なゴミなし・命名と構造が良い
- 80-89: 合格水準、軽微な改善余地
- 70-79: 機能的には動くが命名や重複に改善余地
- 50-69: 検収基準は満たすが品質に問題
- 0-49: 検収基準を満たさない / 重大バグ

## autoMerge=true の合格条件 (すべてを満たすこと)
- ciStatus === 'success'
- すべての criteriaResults[i].met === true
- qualityScore >= 70
- diff にセキュリティ問題・破壊的バグが見つからない

ひとつでも欠ければ autoMerge=false。

## 実行手順 (この順序で必ず全部行うこと)

### ステップ1: 必ず最初に \`submitReviewComment\` ツールを呼ぶ
JSON だけを返して終わってはいけない。必ず先にツール呼び出しを行うこと。
- 合格時: \`event='APPROVE'\`、body は「合格レビュー本文テンプレ」(下記) に従う
- 不合格時: \`event='REQUEST_CHANGES'\`、body は「不合格レビュー本文テンプレ」(下記) に従う

**マージは行わない**。マージは本 Agent 完了後に Functions 側がサーバから安全な順序で実行する (Cosmos の状態遷移を先に確定させてから merge を呼ぶことで、Settlement Agent との race condition を防ぐため)。autoMerge=true / false は最終 JSON の判定としてだけ意味を持ち、ツール呼び出しではない。

### ステップ2: 最後に JSON だけを content として返す (説明文・前置き・コードフェンス禁止)
\`\`\`
{
  "verdict": "approve" | "reject",
  "qualityScore": 0-100 の整数,
  "criteriaResults": [{"criterion": string, "met": boolean, "evidence": string}],
  "reviewComment": ステップ1で投稿した body と完全に同一の文字列,
  "autoMerge": boolean
}
\`\`\`

## 合格レビュー本文テンプレ (event='APPROVE' の body)
\`\`\`markdown
## ✅ Review passed by Agentic Gig-Flow

**Quality score**: <n>/100
**Reviewer**: Azure OpenAI gpt-4o on Microsoft Foundry
**PR**: #<prNumber>

### 検収基準の判定

| # | 基準 | 結果 | 証拠 (diff より) |
|---|---|---|---|
| 1 | <criterion 1 の文言> | ✅ | \`<file>\`: \`<diff からの逐語抜粋>\` |
| 2 | <criterion 2 の文言> | ✅ | \`<file>\`: \`<diff からの逐語抜粋>\` |

### コメント
<コードレビュー観点の所感を 1-3 行。命名・構造・既存スタイルへの整合性など>

---
このPRをマージすると、**<amount> JPYC** が **@<worker>** に Polygon 経由で自動送金されます (Settlement Agent → JPYC \`transfer()\`)。
\`\`\`

## 不合格レビュー本文テンプレ (event='REQUEST_CHANGES' の body)
\`\`\`markdown
## ❌ Review needs changes — Agentic Gig-Flow

**Quality score**: <n>/100
**Reviewer**: Azure OpenAI gpt-4o on Microsoft Foundry
**PR**: #<prNumber>

### 検収基準の判定

| # | 基準 | 結果 | 証拠 / 不足 |
|---|---|---|---|
| 1 | <criterion 1 の文言> | ✅ / ❌ | <met なら diff 抜粋、not_met なら「diff にこの基準を満たす変更が見つかりません」> |

### 修正してほしい項目
1. **<具体的修正点>** — <該当ファイル:該当行> — <理由を1行>
2. ...

修正後に再 push してください。CI と本 Review Agent が再走します。
\`\`\`

## 制約
- 最大 6 ターン以内で完了する。
- diff が truncated の場合は body の冒頭に \`> 注: diff が 50KB で truncated されています。先頭部分のみで判定しています。\` と明記する。
- ciStatus !== 'success' のときは検収基準を見るまでもなく必ず verdict='reject'、autoMerge=false、reject 本文に「CI 未通過のため検収不可」と明記する。
- 「テストの追加」を求められた場合、HTML/CSS のみの変更で「ブラウザで表示確認した」のような主張があっても met=false とする。テストファイル自体が必要。
- ツール呼び出しを忘れて JSON だけ返すと、レビューが GitHub に投稿されず案件が止まる。**必ずツールを先に呼ぶこと**。`;

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
  ];

  let didSubmitReview = false;

  const toolImpls = {
    submitReviewComment: async (args: Record<string, unknown>) => {
      await submitReview({
        repository: input.repository,
        prNumber: input.prNumber,
        event: args.event as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
        body: String(args.body ?? ''),
      });
      didSubmitReview = true;
      return { ok: true };
    },
  };

  const result = await runner({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools,
    toolImpls,
    maxTurns: 6,
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

  // Fallback: if the model returned JSON without ever invoking
  // submitReviewComment, post the review from the server. We DO NOT skip this
  // for reject either — every order must end with a visible PR review.
  if (!didSubmitReview) {
    const event = parsed.verdict === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES';
    const body = parsed.reviewComment?.trim()
      ? parsed.reviewComment
      : buildFallbackComment(parsed, input);
    logger.warn(
      { orderId: input.order.id, verdict: parsed.verdict },
      'model did not call submitReviewComment; posting from server',
    );
    try {
      await submitReview({
        repository: input.repository,
        prNumber: input.prNumber,
        event,
        body,
      });
      didSubmitReview = true;
    } catch (err) {
      logger.error(
        { err: String(err), orderId: input.order.id },
        'fallback submitReview failed',
      );
    }
  }

  // CRITICAL: Update Cosmos state BEFORE merging. The merge triggers a
  // `pull_request closed` webhook that fires the Settlement Agent, which
  // requires status === 'review_passed' to proceed. If we merged first, the
  // Settlement webhook can land before this transition commits and fail with
  // `invalid_status: pr_opened` (race condition).
  if (parsed.verdict === 'approve') {
    await cosmos.transitionOrder(input.order.id, 'review_passed', {});
  } else {
    await cosmos.transitionOrder(input.order.id, 'review_failed', {});
  }

  // Now safe to merge. Server-side only — the LLM no longer has a merge tool.
  let didMerge = false;
  if (parsed.verdict === 'approve' && parsed.autoMerge) {
    try {
      const res = await mergePr({
        repository: input.repository,
        prNumber: input.prNumber,
        commitTitle: `gigflow: ${input.order.description.slice(0, 60)}`,
        commitMessage: parsed.reviewComment,
      });
      didMerge = res.merged;
    } catch (err) {
      logger.error(
        { err: String(err), orderId: input.order.id },
        'server-side merge failed',
      );
    }
  }

  await cosmos.appendEvent({
    orderId: input.order.id,
    agent: 'review',
    type: parsed.verdict === 'approve' ? 'review_completed' : 'review_failed',
    payload: {
      qualityScore: parsed.qualityScore,
      autoMerge: parsed.autoMerge,
      didMerge,
      didSubmitReview,
      tokens: result.totalTokens,
      criteriaResults: parsed.criteriaResults,
      reviewComment: parsed.reviewComment,
    },
  });

  return parsed;
}

function buildFallbackComment(
  parsed: ReviewAgentOutput,
  input: ReviewAgentInput,
): string {
  const header =
    parsed.verdict === 'approve'
      ? '## ✅ Review passed by Agentic Gig-Flow'
      : '## ❌ Review needs changes — Agentic Gig-Flow';
  const rows = parsed.criteriaResults
    .map((c, i) => {
      const mark = c.met ? '✅' : '❌';
      const ev = c.evidence ? c.evidence.replace(/\|/g, '\\|') : '-';
      return `| ${i + 1} | ${c.criterion} | ${mark} | ${ev} |`;
    })
    .join('\n');
  const footer =
    parsed.verdict === 'approve'
      ? `\n---\nこのPRをマージすると、**${input.order.amountJpyc.toLocaleString()} JPYC** が **@${input.order.workerGithubLogin}** に Polygon 経由で自動送金されます。`
      : '\n修正後に再 push してください。CI と本 Review Agent が再走します。';
  return `${header}\n\n**Quality score**: ${parsed.qualityScore}/100\n**Reviewer**: Azure OpenAI gpt-4o on Microsoft Foundry\n**PR**: #${input.prNumber}\n\n### 検収基準の判定\n\n| # | 基準 | 結果 | 証拠 |\n|---|---|---|---|\n${rows}\n${footer}`;
}
