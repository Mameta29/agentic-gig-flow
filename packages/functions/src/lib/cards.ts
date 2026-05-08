import type { Order, BookkeepingArtifacts } from '@gigflow/shared';
import { env } from './env.js';

export function buildBookkeepingCompletionCard(
  order: Order,
  artifacts: BookkeepingArtifacts,
): Record<string, unknown> {
  const dashboardUrl = env.dashboardUrl() ?? 'https://example.com';
  const powerBiUrl = env.powerBiReportUrl() ?? '';
  const explorerUrl = order.txHash
    ? `https://polygonscan.com/tx/${order.txHash}`
    : '';

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body: [
      {
        type: 'Container',
        style: 'good',
        items: [
          {
            type: 'TextBlock',
            text: `✅ ${order.workerGithubLogin} 様への ${order.amountJpyc.toLocaleString()} JPYC のお支払いが完了しました。`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true,
          },
        ],
      },
      {
        type: 'FactSet',
        facts: [
          {
            title: '💰 仕訳',
            value: `借方 ${artifacts.journalEntry.debit.account} ${artifacts.journalEntry.debit.amount} / 貸方 ${artifacts.journalEntry.credit.account} ${artifacts.journalEntry.credit.amount}`,
          },
          {
            title: '📝 源泉徴収',
            value: artifacts.withholding.applies
              ? `${artifacts.withholding.rate}%`
              : 'なし',
          },
          {
            title: '📊 TxHash',
            value: order.txHash ?? '(pending)',
          },
        ],
      },
      ...(artifacts.needsHumanReview
        ? [
            {
              type: 'TextBlock',
              text: '⚠️ 税務判定が曖昧なため税理士確認を推奨します。',
              color: 'Warning',
              wrap: true,
            },
          ]
        : []),
      {
        type: 'TextBlock',
        text: '経理処理は完了しています。',
        isSubtle: true,
        wrap: true,
      },
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: '📄 支払調書',
        url: `${dashboardUrl}/orders/${order.id}/payment-statement`,
      },
      ...(explorerUrl
        ? [{ type: 'Action.OpenUrl', title: '🔗 Polygonscan', url: explorerUrl }]
        : []),
      ...(powerBiUrl
        ? [{ type: 'Action.OpenUrl', title: '📈 Power BI 月次', url: powerBiUrl }]
        : []),
    ],
  };
}

export function buildOrderConfirmationCard(args: {
  workerName: string;
  workDescription: string;
  amountJpyc: number;
  deadline: string;
  repository: string;
}): Record<string, unknown> {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body: [
      { type: 'TextBlock', text: '発注内容の確認', weight: 'Bolder', size: 'Large' },
      {
        type: 'FactSet',
        facts: [
          { title: '受注者', value: args.workerName },
          { title: '業務内容', value: args.workDescription },
          { title: '報酬', value: `${args.amountJpyc.toLocaleString()} JPYC` },
          { title: '期日', value: args.deadline },
          { title: 'リポジトリ', value: args.repository },
        ],
      },
      {
        type: 'TextBlock',
        text: 'この内容で発注すると、Contract Agent が GitHub Issue を作成し、PR がマージされた瞬間に JPYC が自動送金されます。',
        wrap: true,
        size: 'Small',
        color: 'Accent',
      },
    ],
    actions: [
      { type: 'Action.Submit', title: '✅ 承認', data: { action: 'approve' }, style: 'positive' },
      { type: 'Action.Submit', title: '✏ 編集', data: { action: 'edit' } },
      { type: 'Action.Submit', title: '❌ キャンセル', data: { action: 'cancel' }, style: 'destructive' },
    ],
  };
}

export function buildOrderCreatedCard(args: {
  issueNumber: number;
  issueUrl: string;
  orderId: string;
}): Record<string, unknown> {
  const dashboardUrl = env.dashboardUrl() ?? '';
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body: [
      {
        type: 'Container',
        style: 'good',
        items: [
          { type: 'TextBlock', text: '✅ 発注完了', weight: 'Bolder', size: 'Large' },
          {
            type: 'TextBlock',
            text: `GitHub Issue #${args.issueNumber} を作成しました。`,
            wrap: true,
          },
        ],
      },
    ],
    actions: [
      { type: 'Action.OpenUrl', title: '📋 Issue を開く', url: args.issueUrl },
      ...(dashboardUrl
        ? [
            {
              type: 'Action.OpenUrl',
              title: '📊 Dashboard',
              url: `${dashboardUrl}/orders/${args.orderId}`,
            },
          ]
        : []),
    ],
  };
}
