# 提出物作成 確定プラン（2026-05-29・別セッション作成用）

> このファイルは「実装・インフラが全完了した後、提出物（アーキ図 / Zenn記事 / 動画台本）を
> **別のクリーンなセッションで作成する**」ための申し送り書。
> 2026-05-29 にユーザー（吉川さん）と戦略合意した内容を、作成者が単独で迷わず着手できる粒度で記す。
> 土台: `docs/16-submission-strategy.md`（提出戦略）/ `docs/06-demo-script.md`（動画台本）/
> `docs/07-zenn-outline.md`（Zenn構成）/ `docs/15-end-to-end-flow.md`（E2Eフロー実態）。
> ハッカソン要項: `Microsoft Agent Hackathon powered by Tokyo Electron Device.md`。

---

## 0. 現在地（2026-05-29 時点）

**実装・インフラは全完了。** 残るは提出物（図・記事・動画）の作成のみ。締切 **2026-06-01**、審査 6/2〜6/18。

- Step1〜7（4 Agent / Functions / Cosmos / Entra / GitHub / JPYC / Container Apps）: ✅ E2E本番完走済み
- Copilot Studio（発注UI・OrderCreateフロー）: ✅ 完成（Test pane / 録画で実証。**Publishはライセンス制約で不可**）
- Fabric Data Agent + Power BI（経営BI）: ✅ 完成（2026-05-29。自然言語で「2026年1月の外注費は？」→¥586,537 を確認。MCPサーバとしても公開済み）
- 審査員用デモアカウント: ✅ 作成済み（後述）

---

## 1. 審査3軸（要項より・重要度順）と本作の現在地

| 軸 | 内容 | 本作の評価 | 攻め方 |
|---|---|---|---|
| **①ビジネスインパクト** | 業務課題の的確さ + 解決価値（効率化/新規性） | ◎テーマ / ○数値（要強化） | **最重要かつ最弱。ここを強化するのが勝ち筋** |
| **②アプローチの有効性** | Agentic AI の振る舞い + アーキの論理性 | ◎ | 本作の最強カード |
| **③完成度・実現性** | 安定動作 + 導入コスト/運用性 | ◎（審査員が触れる） | デモ手順固定で守る |

審査員4人: 岡嵜禎（MS執行役員常務）/ 畠山大有（MS Evangelist）/ ギークフジワラ（MS Evangelist）/ 西脇章彦（TED VP）/ 茂出木裕也（TED アーキテクト）。**3人がMS、製造業/中小企業のDXを見る人たち。**

---

## 2. 確定した4つの戦略判断（2026-05-29 ユーザー合意）

### 判断1: ビジネスインパクト = 「Microsoft顧客に寄せる」
- **「M365を使う中小企業＝Microsoftの既存顧客の月末経理がそのまま消える」** というナラティブに振る。
- 抽象的TAM（副業3,000万人×全企業）より、**具体ペルソナの before/after** で審査員の自分ごと化を狙う。
  - 例: 合同会社マルシュ（従業員10名）CTO 田中健の「月末の1日」。請求書手入力 + 銀行振込 + 海外送金3-5日待ち → ゼロに。
- 動画 Scene1 と Zenn §2/§9 で前面に。

### 判断2: 既知レース = 「デモ手順を固定」
- 既知の未解決レース: **同時に複数PRをマージすると Settlement が `status!==review_passed` で空振りしうる**（`docs/HANDOFF-2026-05-24.md` §13-⑧）。
- 対処: **「一度に1PRずつ」** のデモ手順を Zenn / 提出フォーム / 動画に明記。実装変更せずリスク回避。審査員が触って失敗するのを防ぐ。

### 判断3: MCP は提出物から外す → Microsoft 完結
- 要項に MCP / Anthropic は加点対象として無い。**MS完結の方が審査員（MS）に刺さり、ストーリーも綺麗**（PM=Copilot Studio / 経理=Dashboard / 経営=Fabric Data Agent）。
- 審査員に Claude Desktop を設定させる離脱リスクも消える。
- **MCPサーバの実装コード自体は残す**（消さない）が、提出物（図・記事・動画）では前面に出さない。Zenn §5 の MCP 章、動画 Scene6 の Claude Desktop 部分は削除 or MS完結に差し替え。

### 判断4: 経理担当者の入口 = Dashboard
- 注文詳細ページ `/orders/[id]` に **仕訳（借方外注費/貸方暗号資産）と源泉徴収（有無・税率・根拠）が既に表示済み**（実装確認済み: `packages/dashboard/app/orders/[id]/page.tsx`）。
- **支払調書（paymentStatementMarkdown）だけデータはあるが画面未表示**。提出前に数行追加で表示する軽微改善が候補（同ファイル 行104の経理処理セクション内に追記）。任意だが、やると経理ビューが完全になる。

---

## 3. 実装の実態（誇張なしで提出物に書ける事実）

> サブエージェントで全コードを検証済み（2026-05-29）。提出物はこの範囲で書けば誇張にならない。

### 4つのエージェント（`packages/functions/src/agents/`）
- **Contract / Review / Bookkeeping は gpt-4o（Azure OpenAI / Foundry）を `runWithTools()` で呼ぶ。**
- **Settlement だけ意図的にLLMを使わない＝決定的処理**（`settlement.ts`）。← 審査員に刺さる「分かってる」設計。Zenn §4.3 / §7.3 で厚く。
- ガードレール実在（`settlement.ts:13-15`）: `MAX_AMOUNT_PER_TX=100,000 JPYC` / `MAX_TX_PER_DAY_PER_AGENT=10` / アドレス regex `^0x[a-fA-F0-9]{40}$` / idempotency（`order.txHash` 存在チェック, `settlement.ts:99-105`）。
- Review Agent: 「推測でなく diff から確認できる事実のみ / evidence（ファイルパス+抜粋）必須」の根拠引用プロンプト（`review.ts:54-73`）。autoMerge は ci=success && 全criteria満たし && qualityScore>=70 のみ（`review.ts:58-62`）。
- Bookkeeping: 源泉徴収4パターン判定（国内個人事業主/国内プログラミング/海外居住者/曖昧）+ `needsHumanReview` フラグ（`bookkeeping.ts:67-73`）。仕訳・支払調書テンプレを JSON 生成（`tools:[]` でツールなし、決定範囲を制限）。

### JPYC送金（`packages/functions/src/lib/blockchain.ts`）
- viem `writeContract` で `transfer()` 直叩き（`blockchain.ts:119-126`）。Polygon mainnet（デフォルト137）/ Amoy（80002）切替。receipt を `confirmations:1` で待機。
- 秘密鍵は Key Vault から `getSecret()`（`blockchain.ts:78`）。
- **EIP-3009不採用の技術判断はコード/docsに説明が無い** → Zenn §4.3 に明記すべき（理由: Settlement Agent が秘密鍵保有 + MATIC保有のため `transfer()` 直叩きで十分、EIP-3009のmeta-tx複雑性は不要。CLAUDE.md §2-7 が根拠）。

### Entra ID マルチテナント
- `companyId = tenantId` で Cosmos クエリを絞る + 二重検証（`cosmos.ts:83,103-104,120`）。
- 全サービス間（OpenAI/Cosmos/KeyVault）が **Managed Identity（`DefaultAzureCredential`）＝パスワードレス**。コードに鍵が一切ない。

### テスト
- Vitest 約902行（contract/review/settlement/bookkeeping/github/openai/tools の `*.test.ts`）。

### 実証済みE2E（数値の出典）
- PR merge → JPYC着金 約5秒（Amoy testnet、tx `0x4cc464b7...`）。「3.2秒」は App Insights 実測の固定値を字幕で使う（`settlement.ts` が `mergeToSettledMs` を記録）。

---

## 4. 提出物3点の作成方向性

### A. アーキ図（Mermaid または draw.io）
- **コンセプト: 「4ユーザー × 4入口 → 共通自律エンジン → 決済/記録」を1枚で。**
- 4ユーザー: 田中CTO(PM) / Sato(Worker) / 山田(経理) / 大野(経営者)。
- 4入口: Teams + Copilot Studio / GitHub / **Dashboard（経理）** / Power BI + Fabric Data Agent（経営）。
  - ※ 元設計の「経理=Claude Desktop+MCP」は **判断3でDashboardに変更**。
- 中央: Azure Functions 上の 4 Agent（Contract/Review/Settlement/Bookkeeping、Foundry gpt-4o）。
- 下部: Polygon × JPYC（決済）/ Cosmos DB（記録）/ Key Vault（鍵）。
- **Entra ID は全入口を覆う層**として描く（認証統合）。Managed Identity の鍵レスをアイコンで。
- 山場（PR merge → 3秒で着金）を赤線/強調で。
- 補助: シーケンス図（発注 / 検収→着金 / Fabric問合せ）数枚あると Zenn が締まる。
- ツール: `creating-mermaid-diagrams` スキル（Zenn埋込はMermaidが楽）or `drawio-skill`（リッチに見せるなら）。

### B. Zenn記事（`docs/07-zenn-outline.md` の構成ベース）
- 構成はほぼ正しい。**更新3点**:
  1. Copilot Studio / Fabric を「未完」→「完成」に。Copilot Studio は **「Publish不可（Viral Trialのライセンス制約）→ Test pane / 録画で実証」と正直に**書く（MSのプロは隠すと見抜く、正直さが完成度評価で有利）。
  2. **EIP-3009不採用理由を §4.3 に追記**（§3参照）。
  3. **§9 インパクトの試算根拠**を足す（工数20h/月の内訳、手数料5,000円/件×件数の積み上げ）。判断1のMS顧客ナラティブを §2/§9 に。
  4. **§5の MCP 章は削除 or 縮小**（判断3）。Multi-agentの差別化は「MS生態系内で4ユーザーが別入口から同じ自律基盤に繋がる」で語る。
- 最重要章: **§5 Multi-agentエコシステム（MS完結版）** と **§7 プロンプト工夫**。
- 仕上げ: 下書き後に `zenn-style-mameta` スキルで著者文体に整える。
- 動画埋込 + アーキ図埋込は必須（要項）。

### C. 動画台本（`docs/06-demo-script.md` の10シーンベース）
- 10シーン構成は優秀。**修正2点**:
  1. **Scene2（Copilot Studio）/ Scene7（Fabric）は実機が撮れる**に格上げ（Test pane / Data Agent が動く。Publish不要）。
  2. **Scene6 の MCP / Claude Desktop 部分を削除 or MS完結に差替**（判断3）。経理は Dashboard の注文詳細で仕訳・源泉徴収を見せる絵に。
- **山場 Scene5（PR merge → 3秒着金）に最大予算**は維持。3分割（GitHub merged / Polygonscan / 着金通知）+ カウンタ + 通知音。
- 「3.2秒」は App Insights 実測の固定値を字幕で（誇張しない）。
- 「一度に1PRずつ」のデモ手順を踏襲（判断2）。

---

## 5. 審査員に渡す成果物（確定値）

```
成果物URL: https://ca-gigflow-dashboard.mangomeadow-46aa4d19.japaneast.azurecontainerapps.io
審査員ログイン:
  ID:  demo@MAMETAZK.onmicrosoft.com
  PW:  Gigflow-Judge-vpebfyem!
（MFA不要。サインイン後すぐ 注文一覧 → 詳細で 発注→PR→検収→着金(txリンク)→記帳(仕訳/源泉徴収) が見える）
```
- デモアカウントは MAMETAZK テナント内メンバー（B2Bゲストだとデータが見えない罠を回避）。PM/Accountant/Executive ロール割当済み。
- テナントの Security defaults は無効化済み（MFA強制を外した。デモテナントなので許容）。
- Copilot Studio Bot と Fabric Data Agent は **録画で見せる**（Publish/共有が審査員に開放できないため）。

---

## 6. 提出前の任意改善（やると完成度↑、やらなくても可）

1. **支払調書をDashboardに表示**（`packages/dashboard/app/orders/[id]/page.tsx` の経理処理セクションに `paymentStatementMarkdown` を `<pre>` で追加。数行）。
2. **GitHub public化 + タグ `v0.9-submission`**（要項: 任意・出すと完成度アピール。提出前のタグを切る）。
3. 既知レースのリトライ実装（判断2でデモ手順固定にしたので必須ではない）。

---

## 7. コスト注意（審査期間の維持）

- Fabric F2 容量 `fabgigflow28fa80` は **課金中（≒$0.36/時）**。審査期間 6/2〜6/18 は Data Agent / Power BI を見せるため **稼働維持**。
- 審査終了後に Pause: `az fabric capacity suspend --capacity-name fabgigflow28fa80 -g rg-gigflow-prod`。
- 全デプロイ環境（Functions / Container Apps / Cosmos）も 6/18 まで維持（要項）。
