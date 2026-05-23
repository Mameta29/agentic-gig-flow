import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { getPrDiff } from '../src/lib/github.js';
import { runWithTools } from '../src/lib/openai.js';

// Reproduce exactly what the Review Agent sends to gpt-4o, but print the raw
// model JSON (verdict + criteriaResults + reviewComment) so we can see WHY it
// rejected. We do NOT call submit/merge tools here; we only read the diff.

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
}`;

async function main() {
  const cosmos = new CosmosClient({
    endpoint: 'https://cosmos-gigflow-28fa80.documents.azure.com:443/',
    aadCredentials: new DefaultAzureCredential(),
  });
  const { resource: order } = await cosmos
    .database('gigflow')
    .container('orders')
    .item('adae02bc-f748-4c4b-8da4-d60f6ca7be82', 'demo-tenant-0001')
    .read<Record<string, unknown>>();

  const { diff, truncated } = await getPrDiff({
    repository: 'Mameta29/gigflow-demo-workspace',
    prNumber: 2,
    maxBytes: 50 * 1024,
  });
  console.log('--- DIFF SENT TO MODEL ---');
  console.log(diff);
  console.log('--- truncated:', truncated, '---\n');

  const userMessage = {
    pr: { number: 2, diff, diffTruncated: truncated },
    order: {
      id: order?.id,
      description: order?.description,
      acceptanceCriteria: order?.acceptanceCriteria,
      amountJpyc: order?.amountJpyc,
      workerGithubLogin: order?.workerGithubLogin,
    },
    ciStatus: 'success',
  };

  const result = await runWithTools({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: [],
    toolImpls: {},
    maxTurns: 2,
    responseFormat: 'json_object',
  });
  console.log('--- MODEL RAW JSON ---');
  console.log(result.content);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
