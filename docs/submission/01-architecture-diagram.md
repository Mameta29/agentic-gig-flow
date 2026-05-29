# 提出用アーキテクチャ図（Microsoft 完結版）

> 提出物①。Zenn §3 と動画 Scene 8 に埋め込む。
> 戦略（`docs/SUBMISSION-PLAN-FINAL.md` 判断3）に従い **Microsoft 完結**で描く。
> MCP サーバは実装済みだが提出図では前面に出さない（経理の入口は Dashboard）。
> コンセプト: **「4ユーザー × 4入口 → 共通の自律エンジン（4 Agent）→ JPYC決済 / Cosmos記録」を1枚で。**
> Entra ID が全入口を覆う認証層。山場（PR merge → 3秒で着金）は赤線で強調。

---

## メイン図 — 全体構成

```mermaid
flowchart TB
    %% ===== 4ユーザー =====
    subgraph Users["👥 4人の登場人物（同じ会社・同じ Entra テナント）"]
        direction LR
        PM["👤 田中CTO（PM）<br/>発注する"]
        Worker["👤 Sato（Worker）<br/>開発して PR を出す"]
        Acc["👤 山田（経理）<br/>仕訳・源泉徴収を確認"]
        Exec["👤 大野（経営者）<br/>月次の外注費を把握"]
    end

    %% ===== Entra ID は全入口を覆う層 =====
    subgraph EntraLayer["🔐 Microsoft Entra ID — 全入口を統合する認証層（companyId = tenantId でテナント分離）"]
        direction LR
        E1["Teams / Copilot Studio SSO"]
        E2["Dashboard SSO（MSAL）"]
        E3["Power BI / Fabric 権限"]
    end

    %% ===== 4つの入口 =====
    subgraph Entries["🚪 4つの入口（役割ごとに最適な UI）"]
        direction LR
        CS["💬 Copilot Studio Bot<br/>（Teams）<br/>＝PM の発注 UI"]
        GH["🐙 GitHub<br/>＝Worker の開発・PR"]
        Dash["🖥️ Dashboard（Next.js）<br/>＝経理の照会 UI<br/>仕訳/源泉徴収/支払調書"]
        PBI["📊 Power BI + Fabric Data Agent<br/>＝経営者の自然言語 BI"]
    end

    %% ===== 中央: 共通の自律エンジン =====
    subgraph Functions["⚙️ Azure Functions（Node 22 / サーバーレス）"]
        direction LR
        FnCopilot["/api/copilot/webhook/"]
        FnOrders["/api/orders/create・list/"]
        FnWebhook["/api/webhook/github/"]
    end

    subgraph Engine["🤖 共通の自律エンジン — 4 Agent（Azure OpenAI / Foundry gpt-4o）"]
        direction LR
        Contract["Contract Agent<br/>発注の構造化→Issue起票<br/>(gpt-4o)"]
        Review["Review Agent<br/>diff×検収基準を根拠引用で判定<br/>(gpt-4o)"]
        Settle["Settlement Agent<br/>★LLM不使用＝決定的<br/>ガードレール+冪等送金"]
        Book["Bookkeeping Agent<br/>仕訳/源泉徴収/支払調書<br/>(gpt-4o)"]
    end

    %% ===== 基盤 =====
    subgraph Foundation["🧱 基盤（すべて Managed Identity ＝ コードに鍵なし）"]
        direction LR
        Cosmos[("🗄️ Cosmos DB<br/>orders / events<br/>companyId で分離")]
        KV["🔑 Key Vault<br/>ウォレット秘密鍵 / PAT"]
        AppI["📈 Application Insights<br/>orderId で全 Agent を分散トレース"]
    end

    Polygon["⛓️ Polygon × JPYC<br/>transfer() で円建て即時送金"]
    Fabric["🔷 Microsoft Fabric<br/>Cosmos ミラー → Data Agent"]

    %% ===== ユーザー → Entra → 入口 =====
    PM --> E1 --> CS
    PM -.バックアップ.-> E2 --> Dash
    Worker --> GH
    Acc --> E2
    Exec --> E3 --> PBI

    %% ===== 入口 → Functions =====
    CS --> FnCopilot
    Dash --> FnOrders

    %% ===== 発注フロー =====
    FnCopilot --> Contract
    FnOrders --> Contract
    Contract -->|Issue 起票| GH
    Contract --> Cosmos

    %% ===== 検収フロー =====
    GH -->|PR opened webhook| FnWebhook
    FnWebhook --> Review
    Review -->|approve / auto-merge| GH
    Review --> Cosmos

    %% ===== ★山場: merge → 3秒で着金（赤線） =====
    GH -->|PR merged webhook| FnWebhook
    FnWebhook ==> Settle
    Settle -->|秘密鍵取得| KV
    Settle ==>|transfer JPYC| Polygon
    Settle --> Cosmos
    Settle --> Book

    %% ===== 記帳フロー =====
    Book --> Cosmos
    Book -->|完了通知 Adaptive Card| CS

    %% ===== 経理・経営の参照 =====
    Dash -->|注文照会| Cosmos
    Cosmos -->|ミラーリング| Fabric
    Fabric --> PBI

    %% ===== 観測 =====
    Contract & Review & Settle & Book -.-> AppI

    %% ===== スタイル =====
    classDef moment fill:#ffe3e3,stroke:#e03131,stroke-width:3px,color:#000;
    classDef ms fill:#e7f1ff,stroke:#0067c0,color:#000;
    classDef web3 fill:#ffe8f3,stroke:#d6336c,color:#000;
    class Settle,Polygon moment;
    class CS,Dash,PBI,Fabric,Contract,Review,Book,Cosmos,KV,AppI ms;

    %% 赤線 = 山場の3エッジ: GH→FnWebhook(merged) / FnWebhook→Settle / Settle→Polygon
    linkStyle 18 stroke:#e03131,stroke-width:4px;
    linkStyle 19 stroke:#e03131,stroke-width:4px;
    linkStyle 21 stroke:#e03131,stroke-width:4px;
```

### この図の読み方（審査員向け 3 行）
- **同じ会社の4人が、役割ごとに別々の入口（Teams / GitHub / Dashboard / Power BI）から、同一の自律エンジンに繋がる。** これが Multi-agent エコシステムの最小単位。
- **赤線が山場**: GitHub の PR merge → Settlement Agent → Polygon で **円建て報酬が約3秒で着金**。人手はゼロ。
- **Entra ID が全入口を統合し、すべてのサービス間通信が Managed Identity（鍵レス）。** コードにもログにも秘密鍵が出ない。

---

## 補助シーケンス図1 — 発注（Copilot Studio）

```mermaid
sequenceDiagram
    autonumber
    participant PM as 田中CTO
    participant CS as Copilot Studio<br/>(Teams)
    participant Fn as Functions
    participant CA as Contract Agent<br/>(gpt-4o)
    participant GH as GitHub
    participant DB as Cosmos DB

    PM->>CS: 「Sato さんにログイン機能、5万JPYC、2週間」
    CS->>PM: Adaptive Card で発注内容を確認
    PM->>CS: ✅ 承認
    CS->>Fn: POST /api/copilot/webhook（Entra トークン）
    Fn->>CA: 自然言語を Order に構造化
    CA->>GH: Issue 起票（orderId 埋込）
    CA->>DB: order を upsert（status=created）
    CA-->>CS: { orderId, issueUrl }
    CS->>PM: 「Issue #12 を作成しました」
```

---

## 補助シーケンス図2 — ★山場: PR merge → 3秒で着金 → 記帳

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub
    participant Fn as Functions
    participant SA as Settlement Agent<br/>（LLM不使用・決定的）
    participant KV as Key Vault
    participant PG as Polygon (JPYC)
    participant BA as Bookkeeping Agent<br/>(gpt-4o)
    participant CS as Copilot Studio
    participant DB as Cosmos DB

    Note over GH,DB: 安定動作のため「一度に1PRずつ」マージする運用
    GH->>Fn: webhook: pull_request.closed (merged=true)
    Fn->>SA: orchestrate(prMergedEvent)
    SA->>DB: order 取得 + 冪等チェック（txHash 未設定 && review_passed）
    SA->>SA: ガードレール（≤100,000 JPYC / ≤10 tx/日 / アドレス regex）
    SA->>KV: 秘密鍵取得（Managed Identity）
    rect rgb(255, 227, 227)
        SA->>PG: JPYC.transfer(workerWallet, amount) via viem
        PG-->>SA: txHash（receipt confirmations:1 待機）
    end
    SA->>DB: status=settled, txHash, mergeToSettledMs を記録
    SA->>BA: orchestrate(settlementResult)
    BA->>BA: 仕訳・源泉徴収（4パターン判定）・支払調書を生成
    BA->>DB: status=bookkept, artifacts
    BA->>CS: 完了通知（Adaptive Card）
```

---

## 補助シーケンス図3 — 経営者の自然言語 BI（Fabric Data Agent）

```mermaid
sequenceDiagram
    autonumber
    participant Exec as 大野社長
    participant DA as Fabric Data Agent
    participant MR as Cosmos ミラー<br/>(OneLake / SQL endpoint)
    participant PBI as Power BI

    Exec->>DA: 「2026年1月の業務委託費の合計は？」
    DA->>MR: 自然言語 → SQL 自動生成・実行
    MR-->>DA: 集計結果
    DA-->>Exec: 「¥586,537 です」（自然言語で回答）
    Exec->>PBI: 月次推移レポートを閲覧
    PBI->>MR: DirectLake クエリ
    MR-->>PBI: 月次集計（右肩下がりトレンド）
```

---

## 状態遷移図 — 1 注文のライフサイクル

```mermaid
stateDiagram-v2
    [*] --> created: Contract Agent（発注）
    created --> pr_opened: Worker が PR
    pr_opened --> review_passed: Review Agent 合格→auto-merge
    pr_opened --> review_failed: Review Agent 不合格
    review_failed --> pr_opened: 修正 PR
    review_passed --> settled: Settlement Agent（JPYC着金）
    settled --> bookkept: Bookkeeping Agent（仕訳生成）
    bookkept --> [*]
```

---

## レンダリング・書き出しメモ

- Zenn はコードフェンスの ` ```mermaid ` をそのまま描画する。**メイン図をそのまま貼れる。**
- 動画 Scene 8 用に PNG/SVG で書き出す場合は Mermaid Live Editor（mermaid.live）に貼って Export、または `@mermaid-js/mermaid-cli`（`mmdc`）を入れて
  `mmdc -i 01-architecture-diagram.md -o arch.png` で一括出力できる（現状ローカルに `mmdc` 未インストール）。
- 赤線（`linkStyle`）はメイン図の山場 3 本に当てている。エッジを足し引きしたら `linkStyle` の番号も合わせて直すこと。
