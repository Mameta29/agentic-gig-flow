import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { env } from './env.js';
import { logger } from './logger.js';

const COGNITIVE_SCOPE = 'https://cognitiveservices.azure.com/.default';

let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (client) return client;
  const tokenProvider = getBearerTokenProvider(
    new DefaultAzureCredential(),
    COGNITIVE_SCOPE,
  );
  client = new AzureOpenAI({
    endpoint: env.openaiEndpoint(),
    apiVersion: env.openaiApiVersion(),
    azureADTokenProvider: tokenProvider,
  });
  return client;
}

/**
 * GPT-5 系 (reasoning) は temperature を受け付けず (既定値1のみ)、トークン上限は
 * `max_completion_tokens` でのみ指定する。デプロイ名から判定し、エージェント層を
 * モデル非依存に保つ。gpt-4o / gpt-4 系は従来どおり temperature を送る。
 * 名前ベースの判定なので、想定外のデプロイ名 (例: 社内エイリアス) のときは
 * AZURE_OPENAI_REASONING=true / false で明示上書きできる。
 */
export function isReasoningModel(deployment: string): boolean {
  const override = process.env.AZURE_OPENAI_REASONING;
  if (override === 'true') return true;
  if (override === 'false') return false;
  const d = deployment.toLowerCase();
  return d.startsWith('gpt-5') || d.startsWith('o1') || d.startsWith('o3');
}

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolImpl = (args: Record<string, unknown>) => Promise<unknown>;

export type RunWithToolsOpts = {
  systemPrompt: string;
  userMessage: string | Record<string, unknown>;
  tools?: ToolDefinition[];
  toolImpls?: Record<string, ToolImpl>;
  maxTurns?: number;
  responseFormat?: 'json_object' | 'text';
  deployment?: string;
  temperature?: number;
  client?: AzureOpenAI; // injectable for tests
};

export type RunWithToolsResult = {
  content: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  toolCallsMade: number;
};

/**
 * Runs an OpenAI chat completion loop with function calling. Stops when the
 * model produces a plain `content` response or `maxTurns` is reached.
 */
export async function runWithTools(
  opts: RunWithToolsOpts,
): Promise<RunWithToolsResult> {
  const c = opts.client ?? getClient();
  const deployment = opts.deployment ?? env.openaiDeployment();
  const maxTurns = opts.maxTurns ?? 6;
  const reasoning = isReasoningModel(deployment);
  // reasoning モデルは temperature 非対応。送ると 400 になるので付けない。
  // 検収のブレ抑制は (gpt-4o では temperature 0.2 で担保していたが) reasoning 側は
  // 根拠引用の強制と JSON 強制で代替する。
  const temperature = opts.temperature ?? 0.2;

  const userText =
    typeof opts.userMessage === 'string'
      ? opts.userMessage
      : JSON.stringify(opts.userMessage);

  const messages: {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    name?: string;
    tool_call_id?: string;
    tool_calls?: {
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }[];
  }[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: userText },
  ];

  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let toolCallsMade = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await c.chat.completions.create({
      model: deployment,
      messages: messages as never,
      tools: opts.tools as never,
      tool_choice: opts.tools && opts.tools.length > 0 ? 'auto' : undefined,
      // reasoning モデルでは temperature を一切送らない (既定値1で動く)。
      ...(reasoning ? {} : { temperature }),
      response_format:
        opts.responseFormat === 'json_object'
          ? { type: 'json_object' }
          : undefined,
    });

    const usage = resp.usage;
    if (usage) {
      promptTokens += usage.prompt_tokens ?? 0;
      completionTokens += usage.completion_tokens ?? 0;
      totalTokens += usage.total_tokens ?? 0;
    }

    const choice = resp.choices[0];
    if (!choice) throw new Error('no choice from openai');
    const msg = choice.message;
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      logger.info({ turn, totalTokens }, 'openai run finished');
      return {
        content: msg.content ?? '',
        totalTokens,
        promptTokens,
        completionTokens,
        toolCallsMade,
      };
    }

    // Record assistant turn that contains the tool calls.
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: toolCalls.map((t) => ({
        id: t.id,
        type: 'function' as const,
        function: { name: t.function.name, arguments: t.function.arguments },
      })),
    });

    for (const call of toolCalls) {
      toolCallsMade++;
      const impl = opts.toolImpls?.[call.function.name];
      if (!impl) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({
            error: `tool_not_found: ${call.function.name}`,
          }),
        });
        continue;
      }
      let parsed: Record<string, unknown> = {};
      try {
        parsed = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: 'bad_json_arguments' }),
        });
        continue;
      }
      try {
        const result = await impl(parsed);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result ?? null),
        });
      } catch (err) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: String(err) }),
        });
      }
    }
  }

  throw new Error(`max_turns_reached: ${maxTurns}`);
}
