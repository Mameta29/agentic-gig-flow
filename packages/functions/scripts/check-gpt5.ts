/**
 * gpt-5.1 疎通＆temperature分岐の実コール確認。
 * Chat Completions が通るか（Responses API 既定 404 でないか）と、
 * reasoning モデルで temperature 未送信でも JSON / tool-call が動くかを実機検証する。
 *
 * 実行:
 *   AZURE_OPENAI_ENDPOINT=https://aoai-gigflow-28fa80-eus2.openai.azure.com/ \
 *   AZURE_OPENAI_DEPLOYMENT=gpt-5.1 AZURE_OPENAI_API_VERSION=2025-04-01-preview \
 *   pnpm --filter @gigflow/functions exec tsx scripts/check-gpt5.ts
 */
import { runWithTools, isReasoningModel } from '../src/lib/openai.js';
import { env } from '../src/lib/env.js';

async function main() {
  const dep = env.openaiDeployment();
  console.log('deployment   :', dep);
  console.log('apiVersion   :', env.openaiApiVersion());
  console.log('endpoint     :', env.openaiEndpoint());
  console.log('reasoning?   :', isReasoningModel(dep), '(true なら temperature を送らない)');
  console.log('---');

  // (1) ツールなし・JSON モード（Review/Bookkeeping と同じ形）
  console.log('[1] no-tools JSON call ...');
  const r1 = await runWithTools({
    systemPrompt:
      'あなたは検証用アシスタント。必ず {"ok": true, "model": "<自分のモデル名>"} の JSON だけを返す。',
    userMessage: 'ping',
    responseFormat: 'json_object',
  });
  console.log('  content    :', r1.content);
  console.log('  tokens     :', r1.totalTokens);

  // (2) ツールあり（Contract/Review と同じ form。temperature 未送信でも tool-call が回るか）
  console.log('[2] tool-calling call ...');
  const r2 = await runWithTools({
    systemPrompt:
      'あなたは計算エージェント。calculator ツールを使って答えを出し、最後に結果の数値だけを返す。',
    userMessage: '17 + 25 は？',
    tools: [
      {
        type: 'function',
        function: {
          name: 'calculator',
          description: 'add two numbers',
          parameters: {
            type: 'object',
            properties: { a: { type: 'number' }, b: { type: 'number' } },
            required: ['a', 'b'],
          },
        },
      },
    ],
    toolImpls: {
      calculator: async (args) => ({ result: Number(args.a) + Number(args.b) }),
    },
  });
  console.log('  content    :', r2.content);
  console.log('  toolCalls  :', r2.toolCallsMade);
  console.log('---');
  console.log('✅ gpt-5.1 Chat Completions OK（404 でも temperature エラーでもなく通った）');
}

main().catch((err) => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});
