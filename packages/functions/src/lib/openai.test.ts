import { describe, expect, it, vi, afterEach } from 'vitest';
import { runWithTools, isReasoningModel } from './openai.js';

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

describe('isReasoningModel', () => {
  afterEach(() => {
    delete process.env.AZURE_OPENAI_REASONING;
  });

  it('detects gpt-5 family and o-series as reasoning', () => {
    expect(isReasoningModel('gpt-5.1')).toBe(true);
    expect(isReasoningModel('gpt-5')).toBe(true);
    expect(isReasoningModel('GPT-5.4')).toBe(true);
    expect(isReasoningModel('o1')).toBe(true);
    expect(isReasoningModel('o3-mini')).toBe(true);
  });

  it('treats gpt-4o / gpt-4 as non-reasoning', () => {
    expect(isReasoningModel('gpt-4o')).toBe(false);
    expect(isReasoningModel('gpt-4')).toBe(false);
  });

  it('honours the AZURE_OPENAI_REASONING override both ways', () => {
    process.env.AZURE_OPENAI_REASONING = 'true';
    expect(isReasoningModel('gpt-4o')).toBe(true);
    process.env.AZURE_OPENAI_REASONING = 'false';
    expect(isReasoningModel('gpt-5.1')).toBe(false);
  });
});

describe('runWithTools temperature branching', () => {
  it('omits temperature for reasoning models (gpt-5.1)', async () => {
    const fake = makeFakeClient([{ content: 'ok' }]);
    await runWithTools({
      systemPrompt: 's',
      userMessage: 'u',
      deployment: 'gpt-5.1',
      client: fake as never,
    });
    const createMock = fake.chat.completions.create as ReturnType<typeof vi.fn>;
    const callArgs = createMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('temperature' in callArgs).toBe(false);
    expect(callArgs.model).toBe('gpt-5.1');
  });

  it('sends temperature for non-reasoning models (gpt-4o)', async () => {
    const fake = makeFakeClient([{ content: 'ok' }]);
    await runWithTools({
      systemPrompt: 's',
      userMessage: 'u',
      deployment: 'gpt-4o',
      client: fake as never,
    });
    const createMock = fake.chat.completions.create as ReturnType<typeof vi.fn>;
    const callArgs = createMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs.temperature).toBe(0.2);
  });
});
