# 16. 提出戦略（決定版）

> 2026-05-23 に、ハッカソン要件・現状の実態・認証の作りを突き合わせて分析した提出戦略。
> 要件原文は `Microsoft Agent Hackathon powered by Tokyo Electron Device.md`。
> 提出締切 2026-06-01、審査 6/2〜6/18。

---

## 1. 要件適合チェック（結論：必須は完全クリア）

| 要件 | 必須/推奨 | 現状 | 判定 |
|---|---|---|---|
| Azure 実行基盤 | **必須** | Azure Functions + Container Apps 稼働 | ✅ |
| Microsoft AI 技術1つ以上 | **必須** | Azure OpenAI(Foundry) gpt-5.1 で4エージェント（モデル非依存設計） | ✅ |
| Cosmos DB | 推奨 | 稼働 | ✅ 申告で加点 |
| GitHub | 推奨 | Webhook + Octokit | ✅ 申告で加点 |
| Entra ID | 推奨 | 実装・稼働 | ✅ 申告で加点 |
| Copilot Studio / Power Platform | 推奨 | 未完（ライセンス問題） | △ 加点の上積み |
| Fabric Data Agent | AI技術の一種 | 未完（テナント制約） | △ 加点の上積み |

**必須要件は Azure Functions + Azure OpenAI で完全に満たす。Copilot Studio / Fabric が未完でも
応募資格・必須要件に影響しない（加点の上積み要素）。**

---

## 2. 🔴 提出前に必ず直す致命的問題

**Dashboard でデモデータが誰にも見えない。**

- Cosmos の全 orders/tenants は `companyId = "demo-tenant-0001"`（固定文字列）。
- しかし Entra サインイン時のトークンは `tid = "3894eada-7a32-44e1-9c8b-6098a6a92a2d"`（MAMETA の GUID）。
- `orders-list.ts` は `createTenantScopedCosmos(auth.tenantId)` で `companyId = tid` で絞る。
- → `demo-tenant-0001 ≠ 3894eada-...` なので、**本人がサインインしても注文一覧が空**。

**対応（決定）**: Cosmos の orders/tenants/accounts の `companyId`（と tenants.id）を
`3894eada-7a32-44e1-9c8b-6098a6a92a2d` に付け替える。コード改修不要。これで
サインインした本人/審査員デモアカウントの tid と一致してデータが見える。

---

## 3. 提出物A：成果物URL（Dashboard を主経路に）

**審査の入口 = Dashboard**（`https://ca-gigflow-dashboard.mangomeadow-46aa4d19.japaneast.azurecontainerapps.io`）。

- §2 の付け替え後、**審査員用デモアカウント**（MAMETA テナント内のメンバーユーザー）を1つ作り、
  ID/PW を提出フォームに記載（要件「認証をかける場合も審査員が試用する仕組み」を満たす）。
  - ⚠️ B2Bゲスト招待だとゲストのホーム tid になりデモデータが見えない罠がある →
    **MAMETA テナント内のメンバーアカウント**を作るのが確実。
- 審査員は サインイン → 注文一覧 → 注文詳細で「発注→PR→検収→送金(txリンク)→記帳」が時系列で見える。
- **Copilot Studio が無くても、Dashboard の発注フォーム（/orders/new）が同じ `/api/orders/create` を
  叩くので、E2E フルフローが1ページで完結実演できる**（強い保険）。

「全フローが1ページで確認できるもの」= 注文詳細ページ（events タイムライン）。

---

## 4. 提出物B：Zenn記事 + 3分動画 + アーキ図（必須）

- 動画は「**動くものを主役に、未完を語り＋静止画で補う**」。
  山場は実証済みの **PRマージ→数秒でJPYC着金**（実画面で撮れる）。
- Copilot Studio / Fabric が間に合わない場合は「設計」としてアーキ図 + Adaptive Card / BI の
  静止画で見せ、実走部分（検収→着金→記帳）を実画面で。**誇張せず動く核心を強く**。
  審査員はMSのプロなので「実装 vs 設計」は見抜く。完成度評価では正直さが有利。
- アーキ図は `docs/15-end-to-end-flow.md` のフローを Mermaid 化して埋め込む。

---

## 5. 提出物C：GitHub（任意・出す）

- public 化 + 提出前タグ `v0.9-submission`。テスト・型・Managed Identity の質が完成度アピール。

---

## 6. Copilot Studio / Fabric の場合分け

| | 使えるようになったら | 使えないまま（現状） |
|---|---|---|
| Copilot Studio | Teams発注を動画Scene2で実撮影。Power Platform申告で加点 | **Dashboardの発注フォームが実発注の代替**。「発注UIの設計」をアーキ図+Adaptive Card静止画で見せる |
| Fabric | Power BI経営ビューをScene7で実撮影 | **Power BI単体**（Capacity不要）でCSV経由グラフ。それも無理ならMCPの自然言語クエリを"AIにデータを聞く"実演で代替 |

両方とも「未完でも代替経路がある」状態。Dashboard が全フローを背負える設計が効いている。

---

## 7. 着手順（締切6/1から逆算）

1. 🔴 **companyId 付け替え**（最優先・データが見えないと何も始まらない）
2. 審査員用デモアカウント作成 + ログイン確認
3. Dashboard で全フロー（発注→…→記帳）が見えることを実機確認
4. アーキ図（Mermaid）作成 → Zenn 記事下書き
5. 動画撮影（実走部分中心）
6. GitHub public化 + タグ + 提出フォーム記入
7. （並行）Copilot Studio / Fabric が MS回答で復旧したら上積み
