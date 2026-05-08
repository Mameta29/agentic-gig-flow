import { describe, expect, it, vi } from 'vitest';
import { runWithTools } from './openai.js';

function makeFakeClient(
  steps: { tool_calls?: { id: string; name: string; args: string }[]; content?: string }[],
) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const step = steps[i++];
          if (!step) throw new Error('no more steps');
          return {
            choices: [
              {
                message: {
                  content: step.content ?? null,
                  tool_calls: step.tool_calls?.map((t) => ({
                    id: t.id,
                    type: 'function' as const,
                    function: { name: t.name, arguments: t.args },
                  })),
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          };
        }),
      },
    },
  };
}

describe('runWithTools (calculator E2E)', () => {
  it('calls the calculator tool and returns the final answer', async () => {
    const calc = vi.fn(async (args: Record<string, unknown>) => {
      const a = Number(args.a);
      const b = Number(args.b);
      return { result: a + b };
    });
    const fake = makeFakeClient([
      {
        tool_calls: [
          {
            id: 'call-1',
            name: 'calculator',
            args: JSON.stringify({ a: 2, b: 3 }),
          },
        ],
      },
      { content: '5' },
    ]);

    const out = await runWithTools({
      systemPrompt: 'You are a math agent. Use the calculator tool.',
      userMessage: '2 + 3',
      tools: [
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'add two numbers',
            parameters: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['a', 'b'],
            },
          },
        },
      ],
      toolImpls: { calculator: calc },
      // injected fake
      client: fake as never,
    });

    expect(calc).toHaveBeenCalledTimes(1);
    expect(out.content).toBe('5');
    expect(out.toolCallsMade).toBe(1);
    expect(out.totalTokens).toBe(30); // two completions
  });
});
