# CLAUDE.md — Claude Code Operating Manual

このファイルは Claude Code (および任意のAIエージェント) がこのリポジトリで作業する際の**最上位の指示書**です。**コードを書く前に必ず本ファイルと `docs/` 配下を読むこと**。

---

## 1. プロジェクト・ミッション

**「副業3,000万人時代の月末経理を消す」** — 中小企業 × 業務委託フリーランサー間の発注〜検収〜報酬支払を、AIエージェントとJPYCで自律完結させる。**PRをマージした3秒後に、円建てで報酬が着金する**。

ハッカソン: **Microsoft Agent Hackathon powered by Tokyo Electron Device** / 個人部門 / 〆切 2026-06-01

評価軸 (この順で重要):
1. **ビジネスインパクト** — 数値で示せる業務改革
2. **アプローチの有効性** — Agentic AI として論理的に有効か
3. **完成度・実現性** — 安定動作 + 実装コスト/運用性の説得力

---

## 2. このプロジェクトの「絶対線」(変えてはいけないこと)

以下は要件レベルの制約。Claude Code はこれらを破る変更を**絶対に提案しない**こと。

### 実行基盤・AI技術 (ハッカソン必須要件)
1. **Azure 実行基盤を使う** — Azure Functions (本体) + Container Apps (Dashboard / MCP サーバ) を採用済み。
2. **Microsoft AI 技術を二重で使う** —
   - **Foundry (Azure OpenAI gpt-4o)**: Contract / Review / Bookkeeping Agent の関数呼び出し
   - **Copilot Studio**: PM の発注 UI の**主経路**。Teams Bot として実装し、Adaptive Card で発注確認・通知。**任意ではなく必須**。
3. **Microsoft Entra ID で認証統一** — Dashboard / MCP サーバ / Functions すべて Entra ID トークンで保護。マルチテナント (companyId = tenantId) 構成。
4. **Microsoft Fabric Data Agent を経営者向け BI として採用** — Cosmos DB を Fabric にミラーリングし、月次業務委託費レポートを Power BI で可視化。Data Agent に対して自然言語で問い合わせ可能。

### Agent 間プロトコル
5. **MCP (Model Context Protocol) サーバを経理担当者向けクエリ層として採用** — `gigflow-mcp` を独立実装し、Claude Desktop / VS Code / Copilot Studio から接続可能にする。tools: `queryOrders` / `getJournalEntries` / `getWithholdingReport` / `exportPaymentStatement` 等。**Multi-agent / Agent-to-agent の絵を成立させる中核**。
6. **GitHub Webhook で PR/CI イベントを受信する** — Review/Settlement の起動経路。PR/Issue 操作は Octokit を直接使用 (Review Agent からの GitHub MCP 経由は採用しない、複雑度回避)。

### Web3 / 通信
7. **JPYC をPolygonで送金する** — JPYC コントラクトの `transfer()` を `viem` で叩く。EIP-3009 は使わない (Settlement Agent が秘密鍵保有 + MATIC保有のため不要)。

### 言語・人間
8. **TypeScript / Node.js 22 / pnpm** — 言語・ランタイム・パッケージマネージャは固定。(当初 Node 20 LTS としていたが、Azure Functions が「Node 20 は 2026-04-30 EOL」として作成を拒否し、かつ Node 24 は japaneast の Linux Consumption でホストが起動しないため、Node 22 に確定。TypeScript なのでランタイム影響は小さい。)
9. **Worker (受注者) は人間** — Worker Agent ノードは作らない。デモのフリーランサー Sato は実在の人間ペルソナ。

これらに反する選択肢が魅力的に見えても、**ハッカソン提出までは固定**。提出後の発展構想として記事に書くのは可。

---

## 3. ディレクトリ構造

```
agentic-gig-flow/
├── README.md                # プロジェクト概観
├── CLAUDE.md                # 本ファイル
├── .env.example
├── docs/
│   ├── 01-architecture.md   # システム構成 + データモデル
│   ├── 02-agents.md         # 4 Agent の System Prompt と Tools
│   ├── 03-roadmap.md        # 依存グラフ + マイルストーンの受入基準
│   ├── 04-azure-setup.md    # Azure 環境構築手順 (Entra ID / Fabric 含む)
│   ├── 05-github-setup.md   # GitHub リポ + Webhook 設定
│   ├── 06-demo-script.md    # ピッチ動画台本
│   ├── 07-zenn-outline.md   # Zenn 記事構成
│   ├── 08-copilot-studio.md # Copilot Studio Bot + Adaptive Card
│   ├── 09-mcp-server.md     # gigflow-mcp サーバ仕様
│   ├── 10-entra-id.md       # Entra ID マルチテナント設計
│   └── 11-fabric.md         # Fabric Data Agent + Power BI
├── packages/
│   ├── functions/           # Azure Functions (TypeScript)
│   │   ├── src/
│   │   │   ├── agents/      # Contract / Review / Settlement / Bookkeeping
│   │   │   ├── lib/         # 共通ユーティリティ (cosmos, openai, viem, github, entra)
│   │   │   ├── functions/   # HTTP/Webhook トリガー
│   │   │   └── types/
│   │   ├── host.json
│   │   ├── local.settings.json   # gitignore
│   │   └── package.json
│   ├── dashboard/           # Next.js (App Router) + Entra ID SSO
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/auth/        # MSAL.js / NextAuth Entra ID
│   │   └── package.json
│   ├── mcp-server/          # gigflow-mcp (Container Apps にホスト)
│   │   ├── src/
│   │   │   ├── tools/
│   │   │   ├── resources/
│   │   │   └── server.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── shared/              # 共通型定義 (workspace)
└── pnpm-workspace.yaml
```

---

## 4. ワークフロー (Claude Code がタスクに着手する時の手順)

タスクを受けたら以下を順守:

1. **タスクの該当章を `docs/` で確認**
   - 例: 「Contract Agent の実装」→ `docs/02-agents.md` の §1 を読む
   - 例: 「Cosmos DB スキーマ追加」→ `docs/01-architecture.md` の §データモデル
   - 例: 「Copilot Studio Bot 改修」→ `docs/08-copilot-studio.md`
   - 例: 「MCP tool 追加」→ `docs/09-mcp-server.md`
2. **`docs/03-roadmap.md` で当該タスクの「受け入れ基準」を確認**
3. **既存コード `packages/` を `view` で読む** (重複・矛盾を避ける)
4. **書く** — 型を最初に定義 → 関数の入出力 → 実装 → ユニットテスト (Vitest)
5. **動作確認** — `pnpm test` または `pnpm dev` で疎通
6. **依存グラフのマイルストーンを更新**

---

## 5. コーディング規約

### 言語・ランタイム
- TypeScript 5+, strict mode 有効、`noImplicitAny: true`
- Node.js 22
- 全ファイル ESM (`"type": "module"`)

### スタイル
- インデント: 2スペース
- セミコロン: あり
- クォート: シングル
- 命名: 関数・変数 = camelCase、型・クラス = PascalCase、定数 = UPPER_SNAKE
- ファイル名: kebab-case (`review-agent.ts`)

### 構造
- **早期リターン** を多用、ネスト深さ最大3
- **副作用を分離** — agents/ はピュアロジック、lib/ がI/O窓口
- **エラーは throw して上位で集約ハンドリング**、関数内 try/catch は最小限

### 禁止事項
- `any` の使用 (どうしても必要なら `unknown` + 型ガード)
- `console.log` (代わりに `logger` を使う、後述)
- ハードコードされた秘密鍵・APIキー (必ず Key Vault または環境変数)
- 同期的なファイルI/O (`fs.readFileSync` 等)

### ロギング
```ts
import { logger } from '@/lib/logger';
logger.info({ orderId, action: 'review_started' }, 'Review starting');
```
構造化ログ (pino) を全箇所で使用。Application Insights に流す。

---

## 6. テスト戦略

- **ユニットテスト**: Vitest を `packages/*/src/**/*.test.ts` に配置
- **統合テスト**: 各 Agent の入出力をモック LLM で検証 (`packages/functions/test/integration/`)
- **MCP テスト**: `@modelcontextprotocol/inspector` でツール疎通を確認
- **E2E**: 提出前に本物の GitHub repo + Polygon Mainnet で動作確認

優先順位: ユニット > 統合 > E2E。

---

## 7. セキュリティ・チェックリスト

実装中に Claude Code が**常に**気にするべきこと:

- [ ] 秘密鍵を絶対にログ出力・コメント・git にコミットしない
- [ ] Webhook 署名検証 (GitHub: HMAC-SHA256 with X-Hub-Signature-256)
- [ ] Cosmos DB アクセスは Managed Identity 経由
- [ ] Azure OpenAI / Fabric も Managed Identity 経由
- [ ] Dashboard / MCP サーバへのアクセスは Entra ID トークン検証必須
- [ ] テナント分離: Cosmos クエリは必ず `companyId = ctx.tenantId` で絞る
- [ ] `transfer()` 実行前に「上限チェック」 (max 100,000 JPYC / tx, max 10 tx / day per agent)
- [ ] Recipient address は EVM チェックサム + 履歴照合 (typo 防止)
- [ ] Idempotency key で同一PRから多重送金を防ぐ (Cosmos の orderId をユニーク制約)
- [ ] MCP サーバの tool 呼び出しはすべて Entra ID トークンの roles claim でガード

---

## 8. ビジネスとの繋がりを忘れない

実装の最中、Claude Code は時々こう自問すること:

- 「この変更は Scene 5 (PRマージ → 3秒で着金) のデモを強化するか？」
- 「審査員に『業務改革』として伝わるか？」
- 「中小企業のCTOがこれを使うとして、月末経理が本当に消えるか？」
- 「Multi-agent (Copilot Studio ↔ MCP ↔ Functions Agents ↔ Fabric) の絵が成立しているか？」

**派手な技術より、デモが3秒で伝わる構成を優先**する。ただし**スポンサープロダクト総ナメ (Foundry / Copilot Studio / Cosmos / Entra / Fabric / GitHub) は妥協しない**。

---

## 9. 詰まった時の挙動

Claude Code が判断に迷ったら:

1. `docs/` の関連章を再読する
2. 本 CLAUDE.md の §2「絶対線」を再確認する
3. それでも分からない場合は、**実装を進めず**、ユーザー (吉川さん) に質問を返す

「とりあえずこれで」と憶測で実装するのは禁止。

---

## 10. ハッカソン特有の注意

- 提出物は: ① 動作するURL ② Zenn記事 (デモ動画埋込必須) ③ GitHub repo (任意)
- 審査期間 (6/2-6/18) はデプロイ環境を維持すること
- 提出時タグを切る (`git tag v0.9-submission && git push --tags`)
- **審査員にはゲスト Entra アカウントを発行**して Teams から Copilot Studio を触れる状態にする (or デモ tenant の招待リンク)

---

## 11. スコープに対する姿勢

このプロジェクトは「全部入り」を狙う:

- ✅ Foundry × 4 Agent (Contract / Review / Settlement / Bookkeeping)
- ✅ Copilot Studio (Teams Bot、PM の発注UI、Bookkeeping 完了通知)
- ✅ Azure Functions + Container Apps
- ✅ Cosmos DB (orders / events / accounts、partition by companyId)
- ✅ Microsoft Entra ID (SSO + マルチテナント)
- ✅ MCP サーバ (`gigflow-mcp`、経理担当者の Claude Desktop / VS Code から接続)
- ✅ Microsoft Fabric Data Agent + Power BI (経営者向け月次レポート)
- ✅ GitHub (Webhook + Octokit)
- ✅ Polygon × JPYC (`viem` で `transfer()`)
- ✅ Application Insights (構造化ログ、Agent別トレース)
- ✅ Key Vault (秘密鍵 / GitHub PAT / Webhook secret)

**「やらない」と決めるのは Worker Agent (人間でやる) だけ**。それ以外は全部本気で実装する。

---

最後に: **シンプルさは武器**。機能を足したくなったら、それが Scene 5 を強くするか、または「業務改革」のストーリーを強くするか自問すること。NOなら捨てる。だが**スポンサープロダクトの主役化は妥協しない** — 加点を最大化する。
