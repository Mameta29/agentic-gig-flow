import { z } from 'zod';
import type { Order, BookkeepingArtifacts } from '@gigflow/shared';
import {
  createTenantScopedCosmos,
  type TenantScopedCosmos,
} from '../lib/cosmos.js';
import { runWithTools, type RunWithToolsOpts } from '../lib/openai.js';
import { sendAdaptiveCard } from '../lib/copilot.js';
import { buildBookkeepingCompletionCard } from '../lib/cards.js';
import { logger } from '../lib/logger.js';

const ArtifactsSchema = z.object({
  journalEntry: z.object({
    debit: z.object({ account: z.string(), amount: z.number() }),
    credit: z.object({ account: z.string(), amount: z.number() }),
    description: z.string(),
    dateLocal: z.string(),
  }),
  withholding: z.object({
    applies: z.boolean(),
    rate: z.number().optional(),
    amountJpyc: z.number().optional(),
    rationale: z.string(),
  }),
  paymentStatementMarkdown: z.string(),
  needsHumanReview: z.boolean(),
});

export type BookkeepingAgentInput = {
  tenantId: string;
  order: Order;
  settlement: {
    txHash: string;
    blockNumber: number;
    settledAt: string;
    amountJpyc: number;
    recipient: string;
  };
};

export type BookkeepingDeps = {
  cosmos?: TenantScopedCosmos;
  runWithTools?: typeof runWithTools;
  sendCard?: typeof sendAdaptiveCard;
};

const SYSTEM_PROMPT = `あなたは Agentic Gig-Flow の **Bookkeeping Agent** です。完了した業務委託の決済情報を受け取り、日本の中小企業の経理担当者が即座に使える形で、仕訳・源泉徴収判定・支払調書テンプレを生成します。

## 出力 (JSON のみ、説明文なし)
{
  "journalEntry": {
    "debit":  { "account": "外注費", "amount": 50000 },
    "credit": { "account": "暗号資産（JPYC）", "amount": 50000 },
    "description": "Sato Taro / ログイン機能 / order:abc123",
    "dateLocal": "YYYY-MM-DD"
  },
  "withholding": {
    "applies": false,
    "rate": 10.21 (applies=true 時のみ),
    "amountJpyc": 5105 (applies=true 時のみ、Math.floor(amount*rate/100)),
    "rationale": "プログラミング業務 + 海外居住者、租税条約に基づき源泉徴収なし"
  },
  "paymentStatementMarkdown": "# 支払調書 ...",
  "needsHumanReview": false
}

## 判定ルール
- 国内居住者 + 個人事業主 + 報酬種類が「原稿料・講演料・士業・コンサルティング」: 源泉徴収あり 10.21% (100万超は 20.42%)
- 国内居住者 + プログラミング業務: 原則 源泉徴収なし
- 海外居住者: 租税条約による (デフォ 20.42% または 0%)
- 曖昧なら applies=false かつ needsHumanReview=true、rationale に「税理士確認推奨」と明記
- 高額 (500,000 JPYC 超) でも needsHumanReview=true

## 制約
- 推測の税務判断はしない
- LLM の創作は paymentStatementMarkdown の文章部分のみ
- ツールは呼ばない (純粋に JSON を返す)
`;

export async function runBookkeeping(
  input: BookkeepingAgentInput,
  deps: BookkeepingDeps = {},
): Promise<BookkeepingArtifacts> {
  const cosmos = deps.cosmos ?? createTenantScopedCosmos(input.tenantId);
  const runner = deps.runWithTools ?? runWithTools;
  const sendCard = deps.sendCard ?? sendAdaptiveCard;

  await cosmos.appendEvent({
    orderId: input.order.id,
    agent: 'bookkeeping',
    type: 'bookkeeping_started',
    payload: { settledAt: input.settlement.settledAt },
  });

  const userMessage = {
    order: {
      id: input.order.id,
      workerGithubLogin: input.order.workerGithubLogin,
      description: input.order.description,
      amountJpyc: input.order.amountJpyc,
      deadline: input.order.deadline,
    },
    settlement: input.settlement,
  };

  const tools: RunWithToolsOpts['tools'] = [];

  const result = await runner({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools,
    toolImpls: {},
    maxTurns: 2,
    responseFormat: 'json_object',
  });

  let parsed: z.infer<typeof ArtifactsSchema>;
  try {
    parsed = ArtifactsSchema.parse(JSON.parse(result.content));
  } catch (err) {
    logger.error(
      { err: String(err), content: result.content },
      'bookkeeping output invalid',
    );
    throw new Error('bookkeeping_output_invalid');
  }

  const artifacts: BookkeepingArtifacts = {
    ...parsed,
    generatedAt: new Date().toISOString(),
  };

  await cosmos.transitionOrder(input.order.id, 'bookkept', {
    bookkeepingArtifacts: artifacts,
  });

  await cosmos.appendEvent({
    orderId: input.order.id,
    agent: 'bookkeeping',
    type: 'bookkeeping_completed',
    payload: {
      withholdingApplies: artifacts.withholding.applies,
      needsHumanReview: artifacts.needsHumanReview,
      tokens: result.totalTokens,
    },
  });

  // Proactive Adaptive Card to Copilot Studio (best-effort)
  if (input.order.copilotConversationRef) {
    try {
      await sendCard({
        conversationRef: input.order.copilotConversationRef,
        card: buildBookkeepingCompletionCard(
          { ...input.order, txHash: input.settlement.txHash },
          artifacts,
        ),
      });
      await cosmos.appendEvent({
        orderId: input.order.id,
        agent: 'bookkeeping',
        type: 'copilot_card_sent',
        payload: {},
      });
    } catch (err) {
      logger.warn(
        { err: String(err), orderId: input.order.id },
        'failed to send copilot card; continuing',
      );
    }
  }

  return artifacts;
}
