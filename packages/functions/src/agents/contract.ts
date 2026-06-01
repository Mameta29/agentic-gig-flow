import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { Order, Tenant, ConversationReference } from '@gigflow/shared';
import {
  createTenantScopedCosmos,
  type TenantScopedCosmos,
} from '../lib/cosmos.js';
import { createIssue as ghCreateIssue } from '../lib/github.js';
import { runWithTools, type RunWithToolsOpts } from '../lib/openai.js';
import { logger } from '../lib/logger.js';

const ParsedRequestSchema = z.object({
  workerGithubLogin: z.string().min(1),
  workerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountJpyc: z.number().int().positive(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).max(10),
  description: z.string().min(1),
});

const FinalOutputSchema = z.object({
  orderId: z.string(),
  issueNumber: z.number().int(),
  issueUrl: z.string().url(),
  parsed: ParsedRequestSchema,
});

export type ContractAgentInput = {
  tenantId: string;
  requesterId: string;
  rawDescription: string;
  workerGithubLogin?: string;
  workerWallet?: string;
  repository?: string;
  today: string;
  conversationReference?: ConversationReference;
};

export type ContractAgentOutput = z.infer<typeof FinalOutputSchema>;

export type ContractDeps = {
  cosmos?: TenantScopedCosmos;
  createIssue?: typeof ghCreateIssue;
  runWithTools?: typeof runWithTools;
};

const SYSTEM_PROMPT = `あなたは Agentic Gig-Flow の **Contract Agent** です。中小企業の PM から業務委託の発注依頼を自然言語で受け取り、構造化 → 検証 → GitHub Issue 起票 → Cosmos DB 保存を完遂します。

## 入力 (user message JSON のフィールド)
- orderRequest.rawDescription: 自然言語の依頼
- orderRequest.workerGithubLogin / workerWallet / repository: 明示があれば優先
- orderRequest.today: ISO 日付 (相対表現の解決基準)
- companyContext.workers: 利用可能な受注者の配列 [{githubLogin, wallet, displayName}]
- companyContext.repositories: 利用可能な repo の配列
- companyContext.spendingLimitPerOrder: 1 回の発注の上限 (JPYC)

## 抽出ルール
- 受注者: 最終的に **workerGithubLogin** と **workerWallet** を companyContext.workers の中の **実在する 1 人**から確定させる。手順:
  1. orderRequest.workerGithubLogin が明示されていれば、それを workers の githubLogin と照合して使う。
  2. 明示がなければ rawDescription 中の人名・呼称を、各 worker の **displayName** および **githubLogin** と緩やかに突き合わせる。一致は寛容に判定する:
     - 大文字小文字を無視する。
     - 姓のみ・名のみ・部分一致でもよい (例: 「sato」「佐藤」「サトウ」→ displayName "Sato Taro" に一致)。
     - displayName の任意の語、または githubLogin の一部が依頼文の呼称に含まれる/近ければ一致とみなす。
     - 候補が 1 人に絞れるなら、表記揺れがあっても積極的に採用する。
  3. 一致した worker の **githubLogin をそのまま workerGithubLogin**、**wallet をそのまま workerWallet** として validateOrderRequest に渡す (依頼文の呼称ではなく、必ず workers の実値を使う)。
  4. workers のどれにも一致しない呼称 (例: 「後藤さん」「田中さん」が workers に居ない) は **必ずエラー終了**する。tenant に 1 人しか居なくても、依頼文と無関係な worker を勝手に採用してはいけない。
  5. どの worker にも合理的に結び付かない場合はエラー終了 (Issue 作成しない)。
- amountJpyc: 報酬額を整数の JPYC として抽出する (1 JPYC = 1 円)。数字の前後にある「JPYC」「円」「¥」「報酬」等は単位/ラベルで、金額は数値部分。通貨語が数字の前にあっても後にあっても数値を採用する。例:
  - 「5万円」「50,000円」「5万 JPYC」「50000JPYC」→ 50000
  - 「JPYCで500」「500JPYC」「500円」「報酬500」→ 500
  - 「3万」「3万の報酬」→ 30000
  数値が明示されていれば必ずその整数を採用し、安易に 0 や 1 未満にしないこと。spendingLimitPerOrder 超過はエラー。抽出値が 1 未満のときのみ不可。
- deadline: 「2週間後」「来月末」等の相対表現を today を基準に YYYY-MM-DD に解決。過去日付は不可。
- acceptanceCriteria: rawDescription から論理的に導ける完了条件を 3〜7 項目。必ず以下を含める: 「テストが追加されている」「CI が通過している」。
- repository: 入力か companyContext.repositories の最初を使う。形式は "owner/repo"。

## ツール (順序通りに使う)
1. validateOrderRequest(...) — 抽出結果を検証する。妥当でなければここで終了。
2. createGithubIssue(repository, title, body, assignee, labels) — Issue 本文の末尾に必ず HTML コメント \`<!-- gigflow:orderId={orderId} -->\` を埋める。orderId は user message に含まれる generatedOrderId を使う。
3. saveOrder(...) — 完成した Order を Cosmos に書く。

## Issue 本文フォーマット (Markdown)
\`\`\`
## 業務内容
{description}

## 検収基準
- [ ] 基準1
- [ ] 基準2

## 報酬
{amountJpyc} JPYC

## 期日
{deadline}

## 受注者
@{workerGithubLogin}

---
<!-- gigflow:orderId={orderId} -->
*このIssueはAgentic Gig-Flowによって自動生成されました。マージ後、自動的にJPYCで報酬が送金されます。*
\`\`\`

## 最終応答
すべて成功したら、以下の JSON のみを content として返す:
{
  "orderId": "...",
  "issueNumber": 12,
  "issueUrl": "https://...",
  "parsed": {
    "workerGithubLogin": "...",
    "workerWallet": "0x...",
    "amountJpyc": 50000,
    "deadline": "YYYY-MM-DD",
    "repository": "owner/repo",
    "acceptanceCriteria": [...],
    "description": "..."
  }
}

エラーで終了する場合: {"error": "<reason>"} だけを返す。`;

export async function runContract(
  input: ContractAgentInput,
  deps: ContractDeps = {},
): Promise<ContractAgentOutput> {
  const cosmos = deps.cosmos ?? createTenantScopedCosmos(input.tenantId);
  const createIssue = deps.createIssue ?? ghCreateIssue;
  const runner = deps.runWithTools ?? runWithTools;

  const tenant = await cosmos.getTenant();
  const workers = await cosmos.listWorkers();

  const orderId = uuid();

  const userMessage = {
    orderRequest: {
      requesterId: input.requesterId,
      rawDescription: input.rawDescription,
      workerGithubLogin: input.workerGithubLogin,
      workerWallet: input.workerWallet,
      repository: input.repository,
      today: input.today,
    },
    companyContext: {
      companyId: input.tenantId,
      repositories: tenantRepos(tenant, input.repository),
      workers: workers.map((w) => ({
        githubLogin: w.worker?.githubLogin ?? '',
        wallet: w.worker?.wallet ?? '',
        displayName: w.displayName,
      })),
      spendingLimitPerOrder: tenant?.spendingLimitPerOrder ?? 100_000,
    },
    generatedOrderId: orderId,
  };

  // Tool definitions
  const tools: RunWithToolsOpts['tools'] = [
    {
      type: 'function',
      function: {
        name: 'validateOrderRequest',
        description:
          'Validate the parsed order. Pass workerGithubLogin/workerWallet/amountJpyc/deadline/repository/acceptanceCriteria/description.',
        parameters: {
          type: 'object',
          properties: {
            workerGithubLogin: { type: 'string' },
            workerWallet: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
            amountJpyc: { type: 'integer', minimum: 1 },
            deadline: { type: 'string' },
            repository: { type: 'string', pattern: '^[^/]+/[^/]+$' },
            acceptanceCriteria: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 10,
            },
            description: { type: 'string' },
          },
          required: [
            'workerGithubLogin',
            'workerWallet',
            'amountJpyc',
            'deadline',
            'repository',
            'acceptanceCriteria',
            'description',
          ],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createGithubIssue',
        description:
          'Create a GitHub issue. Body MUST end with <!-- gigflow:orderId={generatedOrderId} -->.',
        parameters: {
          type: 'object',
          properties: {
            repository: { type: 'string' },
            title: { type: 'string', maxLength: 80 },
            body: { type: 'string' },
            assignee: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
          },
          required: ['repository', 'title', 'body', 'assignee'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'saveOrder',
        description: 'Persist the order to Cosmos DB and return the saved doc.',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            issueNumber: { type: 'integer' },
            issueUrl: { type: 'string' },
            workerGithubLogin: { type: 'string' },
            workerWallet: { type: 'string' },
            description: { type: 'string' },
            acceptanceCriteria: { type: 'array', items: { type: 'string' } },
            amountJpyc: { type: 'integer' },
            deadline: { type: 'string' },
            repository: { type: 'string' },
          },
          required: [
            'orderId',
            'issueNumber',
            'issueUrl',
            'workerGithubLogin',
            'workerWallet',
            'description',
            'acceptanceCriteria',
            'amountJpyc',
            'deadline',
            'repository',
          ],
        },
      },
    },
  ];

  // Canonical worker resolved during validation; reused to overwrite any
  // hallucinated login/wallet/assignee the LLM emits in later tool calls.
  let resolvedWorker: { githubLogin: string; wallet: string } | null = null;

  const toolImpls = {
    validateOrderRequest: async (args: Record<string, unknown>) => {
      const parsed = ParsedRequestSchema.parse(args);
      const today = new Date(input.today);
      const dl = new Date(parsed.deadline);
      if (dl < today) return { ok: false, error: 'deadline_in_past' };
      const limit = tenant?.spendingLimitPerOrder ?? 100_000;
      if (parsed.amountJpyc > limit) {
        return { ok: false, error: 'over_spending_limit' };
      }
      // Worker resolution: exact githubLogin match first; otherwise try to
      // resolve the human name in rawDescription against each worker's
      // displayName / githubLogin. We only accept the match if it narrows to
      // exactly one worker so "後藤" / "田中" never silently maps to "Sato".
      let known = workers.find(
        (w) => w.worker?.githubLogin === parsed.workerGithubLogin,
      );
      if (!known) {
        const matches = workers.filter((w) =>
          workerMatchesRawDescription(w, input.rawDescription),
        );
        if (matches.length === 1 && matches[0]?.worker) {
          const m = matches[0];
          logger.info(
            {
              requested: parsed.workerGithubLogin,
              mappedTo: m.worker!.githubLogin,
            },
            'contract: displayName/githubLogin fuzzy match applied',
          );
          parsed.workerGithubLogin = m.worker!.githubLogin;
          parsed.workerWallet = m.worker!.wallet;
          args.workerGithubLogin = m.worker!.githubLogin;
          args.workerWallet = m.worker!.wallet;
          known = m;
        }
      }
      if (!known || !known.worker) return { ok: false, error: 'unknown_worker' };
      resolvedWorker = {
        githubLogin: known.worker.githubLogin,
        wallet: known.worker.wallet,
      };
      return { ok: true };
    },

    createGithubIssue: async (args: Record<string, unknown>) => {
      const body = String(args.body ?? '');
      if (!body.includes(`gigflow:orderId=${orderId}`)) {
        return {
          ok: false,
          error: 'issue_body_missing_orderId_marker',
        };
      }
      const assignee = resolvedWorker?.githubLogin
        ?? (args.assignee ? String(args.assignee) : undefined);
      const created = await createIssue({
        repository: String(args.repository),
        title: String(args.title),
        body,
        assignee,
        labels: (args.labels as string[] | undefined) ?? undefined,
      });
      return { ok: true, ...created };
    },

    saveOrder: async (args: Record<string, unknown>) => {
      const oid = String(args.orderId);
      if (oid !== orderId) {
        return { ok: false, error: 'orderId_mismatch' };
      }
      const order: Order = {
        id: orderId,
        companyId: input.tenantId,
        requesterId: input.requesterId,
        workerGithubLogin: resolvedWorker?.githubLogin ?? String(args.workerGithubLogin),
        workerWallet: resolvedWorker?.wallet ?? String(args.workerWallet),
        description: String(args.description),
        acceptanceCriteria: (args.acceptanceCriteria as string[]) ?? [],
        amountJpyc: Number(args.amountJpyc),
        deadline: String(args.deadline),
        repository: String(args.repository),
        issueNumber: Number(args.issueNumber),
        issueUrl: String(args.issueUrl),
        status: 'created',
        copilotConversationRef: input.conversationReference,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await cosmos.upsertOrder(order);
      await cosmos.appendEvent({
        orderId,
        agent: 'contract',
        type: 'order_created',
        actorId: input.requesterId,
        payload: { issueNumber: order.issueNumber, repository: order.repository },
      });
      return { ok: true, orderId };
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    throw new Error('contract_output_invalid_json');
  }

  if ((parsed as { error?: string }).error) {
    throw new Error(`contract_failed: ${(parsed as { error: string }).error}`);
  }

  const out = FinalOutputSchema.parse(parsed);
  logger.info(
    { orderId: out.orderId, issueNumber: out.issueNumber },
    'contract agent done',
  );
  return out;
}

// Returns true if the worker's displayName tokens or githubLogin appear in the
// raw natural-language order. We tokenize the displayName by whitespace so
// "Sato Taro" matches "Sato" / "sato". We never match on a single ASCII letter
// to avoid 'a'/'b' false positives.
function workerMatchesRawDescription(
  account: { displayName: string; worker?: { githubLogin: string } },
  rawDescription: string,
): boolean {
  const haystack = rawDescription.toLowerCase();
  const tokens = new Set<string>();
  for (const part of account.displayName.split(/\s+/)) {
    const t = part.trim().toLowerCase();
    if (t.length >= 2) tokens.add(t);
  }
  const login = account.worker?.githubLogin?.toLowerCase();
  if (login && login.length >= 2) tokens.add(login);
  for (const t of tokens) {
    if (haystack.includes(t)) return true;
  }
  return false;
}

function tenantRepos(
  tenant: Tenant | undefined,
  override?: string,
): string[] {
  const list = new Set<string>();
  if (override) list.add(override);
  if (tenant?.defaultRepository) list.add(tenant.defaultRepository);
  return [...list];
}
