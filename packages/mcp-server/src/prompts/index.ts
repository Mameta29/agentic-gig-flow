export type PromptDef = {
  name: string;
  description: string;
  arguments: { name: string; required: boolean; description?: string }[];
  build: (args: Record<string, string>) => {
    role: 'user';
    content: { type: 'text'; text: string };
  }[];
};

export const prompts: PromptDef[] = [
  {
    name: 'monthly-closing',
    description: '月次締め用のチェックリスト問合せ',
    arguments: [{ name: 'yearMonth', required: true }],
    build: ({ yearMonth }) => [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${yearMonth} の業務委託費を経理締めしたい。以下を確認:
1. すべての order が settled / bookkept で完了しているか
2. 月次合計
3. 仕訳を会計ソフトに転記する形で
4. 源泉徴収の対象がある場合は警告

gigflow-mcp の queryOrders, getMonthlyTotals, getJournalEntries を使って答えて。`,
        },
      },
    ],
  },
  {
    name: 'worker-annual-report',
    description: '年間支払調書の準備',
    arguments: [
      { name: 'workerGithubLogin', required: true },
      { name: 'year', required: true },
    ],
    build: ({ workerGithubLogin, year }) => [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${workerGithubLogin} さんへの ${year} 年の支払調書を準備したい。
gigflow-mcp の getWithholdingReport と exportPaymentStatement を使って、
月次内訳と各 order の支払調書テンプレを並べて。`,
        },
      },
    ],
  },
];
