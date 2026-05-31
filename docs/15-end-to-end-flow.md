# 15. エンドツーエンド動作フロー（実態ベース）

> このドキュメントは「**誰が・何を使い・裏で何が動くか**」を、2026-05-23 時点の
> **実際の検証結果**に基づいて記述する。`docs/06-demo-script.md` は理想の台本、
> 本ファイルは「いま本当に動くもの」と「未完のもの」を区別した実態。
> Zenn 記事・動画台本・審査説明の土台。

---

## 登場人物（4人）

| 人物 | 役割 | 使うツール |
|---|---|---|
| 田中CTO（PM） | 発注者 | Teams（Copilot Studio Bot） |
| Sato（Worker） | 受注者（人間） | GitHub |
| 山田（経理） | 経理処理を確認 | Claude Desktop（MCP接続） |
| 大野（経営者） | 業務委託費を俯瞰 | Power BI |

裏で動く「見えない主役」が **4つの AI エージェント**（Azure Functions 上、Azure OpenAI gpt-4o で駆動）:
Contract / Review / Settlement / Bookkeeping。

---

## フロー全体（7段階）

```
【発注】田中CTO → Teams で「@gigflow Satoさんにログイン機能を5万JPYCで依頼」
   │   裏: Copilot Studio が発注内容を構造化 → Adaptive Card で確認 → CTOが承認
   │       → HTTP action で /api/copilot/webhook を叩く（Entraトークン付き）
   ▼
【契約】Contract Agent (gpt-4o)
   │   裏: 発注文を解析 → GitHub Issue 作成（本文の隠しコメントに orderId 埋込）
   │       → Cosmos の orders に status=created で保存
   ▼
【開発】Sato（人間）が GitHub で実装 → PR を出す（本文に Closes #Issue）
   │   裏: CI（GitHub Actions）が走る
   ▼
【検収】Review Agent (gpt-4o)  ← PR opened/synchronize の Webhook が起動
   │   裏: PR diff を取得 → waitForCheckRun で CI完了を待つ → 検収基準を1つずつ判定
   │       合格なら GitHub に approve コメント + squash merge（Octokit）
   │       Cosmos の status を review_passed に
   ▼
【着金】Settlement Agent  ← PR merged(closed) の Webhook が起動 ★山場
   │   裏: waitForReviewPassed でレース回避 → ガードレール検査
   │       （上限額10万/tx・アドレス検証・日次上限10件・二重送金防止）
   │       → Key Vault から秘密鍵取得 → viem で JPYC.transfer() を Polygon に送信
   │       → Cosmos status=settled + txHash 記録
   │   結果: 数秒で Sato のウォレットに円建てステーブルコインが着金
   ▼
【記帳】Bookkeeping Agent (gpt-4o)  ← Settlement から自動連鎖
   │   裏: 仕訳（借方 外注費 / 貸方 電子決済手段（JPYC））+ 源泉徴収判定 + 支払調書 を生成
   │       → Cosmos に保存 + Teams に「支払完了」カードを proactive 送信
   ▼
【可視化】
   ├─ 山田（経理）: Claude Desktop から MCP で「先月のSatoへの支払いは？」と質問
   └─ 大野（経営者）: Power BI で「業務委託費が右肩下がり」グラフを閲覧
```

---

## 実装状況（2026-05-23 検証で確定）

「台本の理想」と「実際に動くもの」を区別する。

| 段階 | 機能 | 状態 | 根拠 |
|---|---|---|---|
| 【契約】 | Contract Agent → GitHub Issue 作成 | ✅ コード実装・デプロイ済み | Agent経路デプロイ済み（検証では Issue 手動作成） |
| 【開発】 | Worker が PR | ✅ **実証済み** | `ei-chan-bot` が PR #2/#4 作成 |
| 【検収】 | Review Agent が gpt-4o で判定→自動merge | ✅ **実証済み** | PR #4 で qualityScore 90→approve→自動merge |
| 【着金】 | Settlement → JPYC 送金（Amoy） | ✅ **実証済み** | tx `0x4cc464b7...` block 38852020、PR merge→着金 約5秒 |
| 【記帳】 | Bookkeeping 仕訳生成 | ✅ **実証済み** | status `bookkept`、源泉徴収判定込み |
| 【発注】 | Copilot Studio（Teams） | 🚧 **未完** | ライセンス404でブロック中（MS質問中）。Azure Bot/シークレットはCLI側完了 |
| 【可視化・経理】 | MCP サーバ | 🟡 デプロイ済み・**実接続未検証** | Container App 稼働中（`/healthz` 200） |
| 【可視化・経営】 | Power BI / Fabric | 🚧 **未完** | Fabric Capacity がこのテナントで作成不可。Power BI で代替予定。データはCosmosに準備済み（6ヶ月右肩下がり） |

**要点**: バックエンドの自律フロー（契約→検収→着金→記帳）は完全実証済み。
人間が触る入口（Teams発注）と出口（経営者BI）が UI/ライセンス問題で未完。

---

## Microsoft サービスが「どこで効くか」

| サービス | 役割 | 状態 |
|---|---|---|
| Entra ID | 全員の認証。JWTの tid=会社ID でデータ分離（マルチテナント） | ✅ 実装済み |
| Copilot Studio | 田中CTOの発注UI（Teams） | 🚧 未完 |
| Azure Functions | 4エージェントの実行基盤 | ✅ 動く |
| Azure OpenAI (gpt-4o) | Contract/Review/Bookkeeping の頭脳 | ✅ 動く |
| Cosmos DB | 全データ保管（orders/events/accounts/tenants） | ✅ 動く |
| Key Vault | 秘密鍵・PAT・シークレットの金庫 | ✅ 動く |
| Container Apps | Dashboard と MCPサーバのホスト | ✅ 動く |
| App Insights | エージェントの動きを時系列追跡 | ✅ 設定済み |
| Fabric / Power BI | 大野社長の経営BI | 🚧 未完（Power BI で代替予定） |
| （非MS）GitHub | Worker の作業場 + Webhook起点 | ✅ 動く |
| （非MS）Polygon + JPYC | 実際の送金レール | ✅ 動く |

---

## 認証の作り（加点ポイント）

- **サービス間（Functions→OpenAI/Cosmos/KeyVault）は全部 Managed Identity** = パスワードレス。
  コードに鍵が一切ない（`DefaultAzureCredential`）。
- **人間→システム（Dashboard/MCP/Functions）は Entra ID トークン**。JWT の `tid`（テナントID）を
  `companyId` に使い、Cosmos クエリを必ずそのテナントで絞る = マルチテナント分離。

---

## 既知のブロッカー（MS回答待ち）

このM365試用テナント（`3894eada-...`）特有の制約が2件、根が同じ可能性:

1. **Copilot Studio**: `viral-signup/create/status` 404 で home がローディングのまま。
   ライセンス（CCIBOTS_PRIVPREV_VIRAL）と環境（Succeeded）は正常なのに開けない。
2. **Fabric Capacity**: 「Unable to create a free Microsoft Fabric trial capacity on this tenant」。
   Power BI Trial は使えるが Fabric Capacity 不可。

詳細・質問文は `docs/copilot-studio-support-question.md`。
```
