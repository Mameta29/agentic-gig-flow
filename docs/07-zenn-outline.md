# 07. Zenn 記事構成

ハッカソン提出に必須の Zenn 記事。**動画埋込必須**、**アーキテクチャ図埋込必須**。約 6,000〜8,000 字 (Multi-agent / MCP / Fabric の章を厚く取る)。

## 記事のタイトル候補

- **「PRをマージした3秒後に、円が届く ─ Copilot Studio × MCP × Fabric で副業3,000万人時代の経理を消した話」** ← 推奨
- 「Microsoft Foundry × Copilot Studio × MCP × JPYC で作る、自律業務委託システム」
- 「Multi-agent エコシステムで本当に "業務改革" するために考えたこと」

タイトルは **クリック率を意識して具体的な数字 + 結果**。Microsoft プロダクト名を最低 2 つは入れる (審査員の検索に引っかける)。

## メタ情報

- **type**: tech
- **emoji**: ⚡ (or 🪙)
- **topics**: `["Agent", "Azure", "CopilotStudio", "MCP", "Fabric", "JPYC", "Hackathon", "TypeScript"]`
- **published**: false (提出直前まで)

---

## 章構成

### 0. TL;DR (250字)

```
副業3,000万人時代の月末経理を、AIエージェントとJPYCで消すシステム「Agentic Gig-Flow」を作りました。
PRをマージした3.2秒後に、海外フリーランサーへ円建てで報酬が届く。
発注は Copilot Studio + Teams、検収は Foundry の Agent、送金は Polygon で即時、
経理担当者は Claude Desktop から MCP サーバ越しに自然言語問合せ、
経営者は Microsoft Fabric の Data Agent + Power BI で月次把握。
Microsoft Foundry × Copilot Studio × Fabric × MCP × Entra ID × Cosmos DB × JPYC で実装。
本記事ではアーキテクチャと、4つの自律エージェント + 周辺の Multi-agent 設計を共有します。
```

### 1. デモ動画 (動画埋込)

```markdown
## デモ
[YouTube 動画埋込]
```

冒頭で動画を見せる。

### 2. なぜ作ったか (600字)

- 副業3,000万人時代という社会背景
- 中小企業の月末経理の実態 (請求書手入力 + 銀行振込 + 海外送金 3-5日待ち)
- フリーランス側の入金待ちの心理コスト
- Microsoft Agent Hackathon のテーマ「業務改革につながる Agentic AI」との接点
- なぜ JPYC か: 円建てステーブルコイン、即時決済、規制下、税務扱いが明確

### 3. システム全体像 (アーキテクチャ図埋込)

Mermaid 図を埋め込む (`docs/01-architecture.md` §1 を流用)。
登場人物を 4 つ示す: PM / Worker / 経理 / 経営者。それぞれの入口が異なることをまず示す。

```markdown
## アーキテクチャ
- PM は Teams + Copilot Studio から発注
- Worker は GitHub で PR
- **経理担当者は Claude Desktop から MCP サーバ越しに問合せ**
- **経営者は Power BI + Fabric Data Agent で月次把握**
```

### 4. 4つの自律エージェント (1500字)

#### 4.1 Contract Agent
- 役割
- 入出力例
- System Prompt の設計意図
- 苦労ポイント: 自然言語からの曖昧な金額・期日の正規化

#### 4.2 Review Agent
- 役割
- diff + 検収基準の照合ロジック
- なぜ "根拠を引用させる" プロンプト設計にしたか
- 失敗例とそこからの学び

#### 4.3 Settlement Agent
- 役割
- **なぜ EIP-3009 を使わなかったか** ← 技術的判断として書くと深みが出る
- ガードレール (上限金額、上限頻度、idempotency)
- LLM を**使わない**理由 (確定的処理の境界線)

#### 4.4 Bookkeeping Agent
- 役割
- 仕訳・源泉徴収・支払調書の自動生成
- LLM に決定させる範囲と、固定ルールにする範囲の境界
- **Copilot Studio Adaptive Card への proactive 通知**

### 5. Multi-agent エコシステム (1500字) ★ ハイライト

ここが**本記事の差別化要素**。一般的なハッカソン提出物は単独 Agent で完結するが、本作は Microsoft 生態系 + Anthropic Claude を連結している。

#### 5.1 Copilot Studio Bot — PM の入口
- なぜ Web フォームではなく Teams Bot か (中小企業の業務 IM は Teams)
- Topic / Variable 設計、Adaptive Card の使い分け
- HTTP action から Functions を on-behalf-of で呼ぶ実装
- ハマりポイント: 30 秒タイムアウト、acknowledge → 非同期通知パターン

#### 5.2 MCP Server (gigflow-mcp) — 経理担当者の入口
- なぜ MCP か: 「経理担当者の AI 環境 (Claude Desktop, VS Code, Cursor) を選ばせない」
- 提供する tools 一覧と設計意図
- Entra ID トークン検証 + role ベース認可
- **Copilot Studio からも MCP connector で呼ぶ経路** — Microsoft AI が Anthropic 互換プロトコルを使う絵
- Streamable HTTP transport + Container Apps の組合せ

#### 5.3 Fabric Data Agent — 経営者の入口
- Cosmos DB のミラーリング + Data Agent のスキーマ設計
- 自然言語 → SQL 自動生成の精度を上げるためのスキーマ命名規則
- Power BI レポートとの組合せ
- Copilot Studio からの Data Agent 呼び出し

#### 5.4 「全部 Microsoft + Anthropic も乗る」設計の思想
- Foundry × Copilot Studio × Fabric が Microsoft 側の三脚
- MCP が Anthropic 側からの相互運用面
- Entra ID が認証統合
- これが「Multi-agent エコシステム」と呼べる構造の最小単位

### 6. なぜ Foundry × Functions × Cosmos × Container Apps なのか (600字)

技術選定を**他選択肢との比較**で語る:

- なぜ Semantic Kernel ではなく直接 Azure OpenAI SDK か → TS主軸の開発者にとっての速度
- なぜ Container Apps + Functions の二段構成か → サーバーレス前提とリアルタイム UI / MCP サーバの両立
- なぜ Cosmos DB か → JSON ドキュメントの柔軟性 + Fabric ミラーリング
- なぜ Polygon か → ガス代と JPYC エコシステム

### 7. プロンプト・エンジニアリングの工夫 (1000字)

審査員はプロンプトの工夫を見たい。具体例 4 個:

#### 7.1 「根拠を引用させる」設計 (Review Agent)
```
acceptanceCriteria 各項目について、PR の diff から **証拠** を引用しながら met / not_met を判定。
「証拠」は diff の該当箇所 (ファイルパス + 行番号 + 抜粋) を含めること。
```
これで LLM の幻覚を抑え、レビュー結果の説得力が上がった。

#### 7.2 「曖昧入力の構造化」 (Contract Agent)
- 入力: 「Sato さんに ログイン機能 の実装 5万円 2週間で」
- 出力: 構造化された Order JSON
- 正規化ルールをプロンプトに明示することで安定。

#### 7.3 「LLM を使わない判断」 (Settlement Agent)
- LLM を使わない理由: 入力から出力への写像が決定的、創造性が不要、非決定性はリスク。
- 判断基準を明文化。

#### 7.4 MCP プロトコル設計 (gigflow-mcp)
- tool description は **「LLM が読む英語の説明書」** として書く
- パラメータの説明に「使うべき場面」と「使うべきでない場面」を明示
- 例: `queryOrders` の description に "Use this when the accountant asks about specific orders by month/worker/status. Do NOT use this for monthly totals — use getMonthlyTotals instead."
- これで Claude Desktop / Copilot Studio どちらからでも適切な tool を選んでくれる
- Resource URI 設計: `gigflow://orders/{id}` のように RESTful にして自然言語からも辿れる

### 8. ハマりどころ (700字)

- Polygon RPC の rate limit
- Cosmos DB の RU 消費が想定より高い (partition key 設計)
- GitHub Webhook の delivery 重複
- Azure OpenAI の TPM (Token Per Minute) 制約
- **Copilot Studio HTTP action の 30 秒タイムアウト** — acknowledge → 非同期通知パターンへ
- **MCP の Streamable HTTP / SSE の Container Apps 互換性**
- **Fabric Mirror のレイテンシ** — リアルタイム経理問合せには不向き、経営者向けに限定
- **Entra ID のマルチテナント設定の罠** — common エンドポイント使用時の audience 検証

### 9. 業務改革インパクトの試算 (300字)

Before/After の表。
副業3,000万人 × 全企業 という TAM の話。
**Microsoft 365 を使う中小企業の比率を引いて TAM を試算する** (これで「Microsoft の顧客にそのまま売れる」絵を出す)。

### 10. 今後の発展 (500字)

ハッカソン提出後に可能な拡張:
- Treasury スマートコントラクト (Safe multisig + 役割ベース送金許可)
- Agent 間決済を本物の x402 化 (内部会計を JPYC で)
- Copilot for Excel との連携 (経理担当者向け Excel 操作)
- Power Automate との連携 (既存業務システムへの伝票連携)
- Microsoft Purview による監査証跡強化
- 多通貨対応 (JPYC + USDC のスワップ層追加)

### 11. 提出物リンク

```markdown
- 🌐 デモサイト (Dashboard): https://...
- 🤖 Copilot Studio Bot 招待リンク: https://...
- 🔌 MCP Server エンドポイント: https://...
- 📊 Power BI 公開レポート: https://...
- 💻 GitHub: https://github.com/.../agentic-gig-flow
- 🎥 デモ動画: https://...
```

### 12. 謝辞 (100字)

- Anthropic / OpenAI / Microsoft / JPYC コミュニティへの謝辞
- ハッカソン主催 (Tokyo Electron Device / Microsoft) への謝辞

---

## 執筆 Tips

### キーワード散りばめ (SEO 兼 審査員フック)

- **業務改革**
- **Agentic AI / Autonomous Agent / Multi-agent**
- **Microsoft Foundry / Azure OpenAI / gpt-4o**
- **Copilot Studio / Adaptive Card**
- **Microsoft Fabric / Data Agent / Power BI**
- **Cosmos DB / Functions / Container Apps**
- **Microsoft Entra ID / SSO / マルチテナント**
- **MCP / Model Context Protocol / Anthropic**
- **JPYC / ステーブルコイン / 即時決済**
- **副業 / 業務委託 / フリーランス**
- **GitHub / Pull Request / CI**
- **Audit-Ready / 監査証跡**

### 図の使い方

- アーキテクチャ図: Mermaid (4 種類のユーザーがそれぞれ別の入口から入る図)
- シーケンス図: Mermaid sequenceDiagram (発注 / Review / Settlement / MCP問合せ / Fabric問合せ)
- 状態遷移図: Mermaid stateDiagram-v2
- スクリーンショット:
  - Teams + Copilot Studio Adaptive Card
  - Review Agent の PR コメント
  - Polygonscan
  - Claude Desktop で gigflow-mcp 接続
  - Power BI ダッシュボード
- データフロー: Excalidraw も組み合わせると手書き感で読みやすい

### 文字数バランス

- TL;DR + 動画 + 全体像で前半 1,500字
- Agent 実装詳細で 2,000字
- **Multi-agent エコシステム (Copilot Studio / MCP / Fabric)**で 1,500字 ← ここが厚い
- プロンプト工夫 + ハマりどころで 1,500字
- 学び・発展で 800字
- 合計 7,500 字前後を目安

### 文体

- 技術ブログとしての堅さは保ちつつ、ストーリー性を出す
- Multi-agent の章は**「審査員に Microsoft + Anthropic 全部使ったよ」**を読み手に伝える
- 学びの章 (§8 ハマりどころ) では一人称OK

---

## 提出前チェックリスト

- [ ] 動画が埋め込まれて再生可能
- [ ] アーキテクチャ図が表示される (Mermaid のレンダリング確認)
- [ ] **Copilot Studio Bot の招待リンクが審査員から押せる**
- [ ] **MCP Server のエンドポイントが審査員から接続できる** (Claude Desktop の設定例も記載)
- [ ] **Power BI レポートに匿名/ゲストアクセスが効く**
- [ ] すべての外部リンクが切れていない
- [ ] 公開URL に審査員がアクセスして動作する
- [ ] GitHub repo が public
- [ ] コードのコメントとプロンプトが英語/日本語で読める
- [ ] スクリーンショットの個人情報がマスクされている
- [ ] スペル・誤字 (textlint をかける)
- [ ] 引用元・参考文献が明記されている (JPYC, MCP spec, Fabric Data Agent docs, etc)
