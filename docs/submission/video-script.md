# 提出用 動画台本（Microsoft 完結版・3分）

> 提出物③。Zenn 記事（`docs/submission/zenn-article.md`）に埋め込む 3分程度のプレゼン代替動画。
> 土台は `docs/06-demo-script.md`。確定戦略（`docs/SUBMISSION-PLAN-FINAL.md`）に従い次を反映:
> - **Scene 2（Copilot Studio）/ Scene 7（Fabric）は実機が撮れる**に格上げ（Test pane / Data Agent が動く。Publish 不要）
> - **Scene 6 の MCP / Claude Desktop を削除 → 経理は Dashboard の注文詳細**（仕訳・源泉徴収・支払調書）
> - **山場 Scene 5（PR merge → 約3秒着金）に最大予算**は維持
> - **ビジネスインパクトは MS 顧客に寄せる**（Scene 1 で合同会社マルシュ田中CTO）
> - **「一度に1PRずつ」**のデモ手順を踏襲（既知レース回避）
> - 数値は App Insights 実測の固定値（「約3秒」「3.2秒」）。誇張しない。

---

## 0. 全体方針

- 要項の「3分程度」に合わせ、**目標 3:00（許容 2:50〜3:20）**。docs/06 の 4:00 から圧縮。
- 山場（Scene 5）は削らない。圧縮するのは Scene 3（開発スキップ）・Scene 8（アーキ）・Scene 10（Outro）。
- **審査員は MS 社員3名 + TED 2名。** 「Microsoft プロダクトで業務が1周する」絵を最優先で見せる。
- すべて録画素材。Copilot Studio / Fabric は Publish/共有不可なので **実機を録画**して見せる（隠さない）。

### 撮影・編集

- 録画: OBS Studio（1920x1080 / 60fps、mp4）
- 編集: DaVinci Resolve（無料）
- 字幕: **日本語 + 英語**（国際的審査員想定）
- カラー: Microsoft の青 + JPYC のピンク。ポジ通知=緑 / ネガ=赤 / 文字=黒
- 効果音: 通知音・カウンタ音は控えめに。Scene 5 だけ「決め」の通知音

### ペルソナ（字幕で4人を出す）

- **田中 健（44）** — 中小ITコンサル「合同会社マルシュ」CTO。発注者。本人（吉川さん）が演じる。
- **Sato Taro（32）** — バンコク在住フリーランスエンジニア。受注者。
- **山田 由紀（38）** — 経理担当者。**Dashboard で仕訳・源泉徴収・支払調書を確認**。
- **大野 社長（56）** — 経営者。**Fabric Data Agent / Power BI で月次把握**。

---

## 全体構成（3:00 / 180秒）

| Scene | Time | 長さ | テーマ | 実機/編集 |
|---|---|---|---|---|
| 1. Pain Point | 0:00 - 0:22 | 22s | 月末経理の地獄（MS顧客の中小企業） | 実機+演出 |
| 2. 発注（Copilot Studio） | 0:22 - 0:52 | 30s | Teams + Adaptive Card | **実機録画** |
| 3. Worker 開発 | 0:52 - 1:00 | 8s | タイムスキップ | 早回し |
| 4. AI 検収（Review Agent） | 1:00 - 1:35 | 35s | gpt-4o が根拠引用で判定 | 実機 |
| **5. The Moment** | **1:35 - 2:10** | **35s** | **PR merge → 約3秒で着金 ★山場** | 実機+編集 |
| 6. 記帳 + 経理（Dashboard） | 2:10 - 2:35 | 25s | Copilot 通知 + 経理が Dashboard 確認 | **実機録画** |
| 7. 経営（Fabric Data Agent） | 2:35 - 2:52 | 17s | 自然言語で月次外注費 | **実機録画** |
| 8. Architecture | 2:52 - 3:05 | 13s | 構成図ハイライト | 図 |
| 9. Impact + Outro | 3:05 - 3:20 | 15s | 数値 + キャッチコピー + URL | テロップ |

> ※ 厳密に 3:00 に収めたい場合は Scene 8 を 8s、Scene 9 を 10s に詰めて 3:05 着地も可。

---

## Scene 1: Pain Point（0:00 - 0:22）

### 映像
- 0:00-0:04: 黒画面に **「Microsoft Agent Hackathon 2026 / 個人部門」** タイトル
- 0:04-0:08: 字幕で田中CTO紹介 **「合同会社マルシュ（従業員10名）CTO 田中 健」「使っているのは Microsoft 365」**
- 0:08-0:16: 田中の月末画面（3分割）:
  - 左: 経理ソフトに請求書PDFを1件ずつ手入力
  - 中央: 銀行Webで振込フォーム入力
  - 右: チャットで「Sato さんへの送金まだ?」と催促
- 0:16-0:20: Sato の画面（バンコク）: スマホで銀行アプリ → 「振込待ち…」
- 0:20-0:22: 黒画面にテロップ **「これ、Microsoft Agent と JPYC で消します」**

### ナレーション
> 「Microsoft 365 で仕事をする中小企業ほど、業務委託先が増えると月末経理が地獄になります。
> 海外フリーランスへの送金は3〜5日待ち、振込手数料は1件で数千円。
> ── これ、Microsoft の Agent と JPYC で、まるごと消します。」

### 撮影メモ
- **「Microsoft 365 を使う中小企業＝MSの既存顧客」を字幕で明示**。審査員（MS）の自分ごと化が狙い。

---

## Scene 2: 発注 via Copilot Studio（0:22 - 0:52）★実機録画

### 映像
- 0:22-0:27: 田中、**Microsoft Teams** を開く。左ペインに Copilot Studio Agent（gigflow）
- 0:27-0:34: 田中がチャット入力:
  ```
  Sato さんに「ログイン機能の実装」を依頼。
  報酬5万JPYC、期日2週間。リポジトリは gigflow-demo-workspace。
  ```
- 0:34-0:42: **Adaptive Card** が現れる（受注者 / 業務 / 報酬 / 期日 / Repo + 承認・編集・キャンセル）
- 0:42-0:48: 田中が「✅ 承認」→ Card 更新:
  ```
  ✅ 発注完了
  GitHub Issue #12 を作成しました。
  Contract Agent が処理を完了
  [📋 Issue を開く]  [📊 Dashboard]
  ```
- 0:48-0:52: 画面右下に小さくフロー: Copilot Studio → Functions → Contract Agent → GitHub + Cosmos（緑チェック）

### ナレーション
> 「発注は、PM が Teams にチャットを1行打つだけ。
> Microsoft Copilot Studio の Agent が Adaptive Card で確認を取り、
> Contract Agent が自然言語を構造化して GitHub Issue を起こし、契約条件を Cosmos DB に保存します。
> 人間の手作業は、ゼロ。」

### 撮影メモ
- **これは Test pane で実機が撮れる**（Publish 不要）。背景に Teams のサイドバーを映す。
- Adaptive Card のレンダリングは事前に作り込む。録画前にカード表示を確認。
- フロー可視化は Excalidraw 等で重ねる。

---

## Scene 3: Worker 開発（0:52 - 1:00）

### 映像
- 0:52-0:55: Sato の画面。GitHub Issue 確認 → ブランチ作成
- 0:55-0:58: コーディング（VS Code、早回し）
- 0:58-1:00: PR 作成 → Submit。テロップ **「2週間後…」**

### ナレーション
> 「受注者の Sato さんは、いつも通り GitHub で開発して、PR を出すだけです。」

---

## Scene 4: AI 検収 via Review Agent（1:00 - 1:35）

### 映像
- 1:00-1:05: PR 作成の瞬間、画面が PR ページへ
- 1:05-1:12: 右上に「**Review Agent (gpt-4o / Foundry)**: thinking…」
- 1:12-1:26: Review Agent のコメントを大きく表示:
  ```
  ## ✅ Review passed by Agentic Gig-Flow

  Quality score: 87/100
  Reviewed by Azure OpenAI gpt-4o (Foundry)

  ### 検収基準（証拠を引用して判定）
  | 基準 | 結果 | 証拠 |
  |---|---|---|
  | /login がレンダリングされる | ✅ | app/login/page.tsx |
  | ログイン成功で / にリダイレクト | ✅ | actions.ts |
  | エラーメッセージ表示 | ✅ | components/error.tsx |
  | テストが追加されている | ✅ | __tests__/login.test.ts |
  | CI 通過 | ✅ | check-run: success |

  このPRをマージすると、50,000 JPYC が @sato-taro に自動送金されます。
  ```
- 1:26-1:35: 「Auto-merge enabled」→ 田中がマージボタンをクリック → **一瞬の溜め**

### ナレーション
> 「Review Agent が PR の差分を読み、発注時に決めた検収基準を1項目ずつ照合します。
> ポイントは、Azure OpenAI gpt-4o に **証拠（ファイルパスと抜粋）を引用させて**判定させていること。
> CI 通過・全基準クリア・品質スコア70以上を満たすと、自動で approve してマージします。」

### 撮影メモ
- 「**証拠を引用させる**」を字幕で強調。プロンプト工夫の見せ場（Zenn §7.1 と対応）。
- 表の「証拠」列は実コードのプロンプト（ファイルパス + 抜粋）に合わせる。**行番号は出さない**（記事と整合）。

---

## Scene 5: The Moment（1:35 - 2:10）★★★ 山場

**ここに動画予算の半分を投じる。**

### 映像
- 1:35-1:38: マージの瞬間、画面が**3分割**:
  - **左**: GitHub PR、"Merged" の紫バッジ
  - **中央**: Polygonscan の transaction 詳細
  - **右**: Sato のスマホ（ウォレット通知）
- 1:38-1:42: 画面下に**大きなカウンター**:
  ```
  PR merged → JPYC arrived
  ⏱ 0.0 → 1.2 → 2.4 → 3.2 sec
  ```
- 1:42-1:52: 3画面それぞれが変化:
  - 左: PR が closed/merged
  - 中央: txHash が現れ confirmations が増える
  - 右: 通知音 +「+50,000 JPYC received」ポップアップ
- 1:52-2:02: カウンターが **「3.2 sec」** で停止。BGM 一瞬無音 +「ピン」という通知音
- 2:02-2:10: テロップ:
  ```
  PR マージから 3.2 秒。
  バンコクにいる Sato さんに、5万円が届いた。
  ```
  英字幕: "3.2 seconds from merge to settled. Sato in Bangkok just got paid."

### ナレーション
> 「**PR を マージ した、3.2 秒 後。**
> 海外にいる Sato さんに、円が、届きました。」
>
> （一拍置く）
>
> 「銀行の営業時間も、振込手数料も、月末締めも、ありません。」

### 撮影メモ
- **編集が命**。粗素材でも 3分割 + カウンタ + 通知音で成立する。
- カウンタの「3.2 sec」は **App Insights 実測値**（`mergeToSettledMs`）。誇張しない。実測が変動したら字幕値を実測に合わせる。
- 送金は決定的処理（LLM 不使用）。**安定撮影のため「一度に1PRずつ」**。複数PRを同時にマージしない（既知レース回避）。
- フォールバック: Polygon RPC が遅い場合は事前計測の固定値を字幕に使う。

---

## Scene 6: 記帳 + 経理 via Dashboard（2:10 - 2:35）★実機録画

**前半（2:10-2:20）: Bookkeeping → Copilot Studio 通知**

- 2:10-2:14: 画面が田中の Teams へ
- 2:14-2:20: Copilot Studio Bot から Adaptive Card:
  ```
  ✅ Sato Taro 様への 50,000 JPYC のお支払いが完了しました。

  💰 仕訳: 借方 外注費 50,000 / 貸方 電子決済手段（JPYC）50,000
  📝 源泉徴収: なし（プログラミング業務）
  📊 [Polygonscan]   📈 [Power BI 月次レポート]
  ```

**後半（2:20-2:35）: 山田経理が Dashboard で確認**

- 2:20-2:24: 山田の画面へ。**Dashboard にサインイン**（Entra ID SSO）→ 注文一覧 → 該当注文をクリック
- 2:24-2:33: 注文詳細ページ `/orders/[id]` の「経理処理」セクションを大きく表示:
  ```
  経理処理
  仕訳:   借方 外注費 50,000 / 貸方 電子決済手段（JPYC）50,000
  源泉徴収: なし（プログラミング業務、海外居住者）
  ▸ 支払調書（クリックで展開）
  着金: 0x4cc4… （Polygonscan リンク）
  ```
- 2:33-2:35: 支払調書を展開して Markdown が出る様子をチラ見せ

### ナレーション
> 「Bookkeeping Agent が、仕訳・源泉徴収の判定・支払調書を自動生成。
> PM には Copilot Studio から完了通知が届き、経理担当者は Dashboard を開くだけで、
> 仕訳も源泉徴収の根拠も支払調書も、着金のオンチェーン記録まで、その場で確認できます。」

### 撮影メモ
- **MCP / Claude Desktop は出さない**（判断3。MS完結）。経理は Dashboard で見せる。
- 源泉徴収の判定根拠（rationale）が表示される画を映す。「AI が税区分を判定」が伝わる。
- 支払調書は `<details>` 展開で見せる（実装済み: page.tsx の経理処理セクション）。

---

## Scene 7: 経営 via Fabric Data Agent（2:35 - 2:52）★実機録画

### 映像
- 2:35-2:39: 大野社長の画面。**Fabric Data Agent** に自然言語で問合せ:
  ```
  2026年1月の業務委託費の合計はいくら？
  ```
- 2:39-2:46: Data Agent が自然言語 → SQL 自動生成（右に小窓でトレース）→ 応答:
  ```
  ¥586,537 です。
  ```
- 2:46-2:52: 画面が **Power BI** へ。月次業務委託費の棒グラフ（**右肩下がりトレンド** 77万→26万 JPYC）

### ナレーション
> 「経営者は、Microsoft Fabric の Data Agent に自然言語で聞くだけ。
> Cosmos のデータが Fabric にミラーリングされ、SQL を自動生成して即答します。
> Power BI で月次の推移も、経営判断に使える数字としてそのまま見られます。」

### 撮影メモ
- **これも実機が撮れる**（Data Agent は F2 容量で動作、Publish 不要）。確認済みの質問「2026年1月の業務委託費の合計は？」→「¥586,537」を使う。
- 録画用に「月別推移」「最高月」など複数質問を試して良い画を選ぶ。
- Power BI は右肩下がり（コスト削減）に見えるダミー実データで。

---

## Scene 8: Architecture（2:52 - 3:05）

### 映像
- アーキテクチャ図を表示（`docs/submission/01-architecture-diagram.md` のメイン図を高解像度で書き出し）
- ハイライトを順に当てる:
  1. Copilot Studio（Teams）= PM の発注
  2. Functions + 4 Agents（Foundry gpt-4o）= 自律エンジン
  3. Polygon × JPYC = 山場の決済（赤線）
  4. Dashboard = 経理の入口
  5. Fabric Data Agent + Power BI = 経営の入口
  6. Entra ID（全体を覆う）= 認証統合・テナント分離

### ナレーション
> 「アーキテクチャは、Foundry の gpt-4o で4つのエージェントを動かし、
> Copilot Studio が発注を、Dashboard が経理を、Fabric Data Agent が経営を受け持つ。
> Entra ID がすべての入口を統合し、Polygon の JPYC で決済が完結します。
> 役割の違う4人が、別々の入口から同じ自律基盤に繋がる ── Microsoft の生態系で1周する設計です。」

### 撮影メモ
- **MCP は図でも出さない**（提出版はMS完結）。
- 赤線（merge → Settlement → 着金）を強調表示。

---

## Scene 9: Impact + Outro（3:05 - 3:20）

### 映像
- 3:05-3:13: 数値を順に表示:
  ```
  経理工数:        約20 時間/月 → 約1 時間/月  (-95%)
  振込手数料:      約5万円/月 → ほぼ 0 円
  受注者の入金待機:  3-5 日 → 約3 秒
  経営者の月次集計:  経理依頼 → 自然言語で即答
  ```
- 3:13-3:16: テロップ **「Microsoft 365 を使う中小企業の月末が、そのまま消える」**
- 3:16-3:20: 黒画面に大きく:
  ```
  Agentic Gig-Flow
  「働いた瞬間に、円が動く」
  ```
  URL を控えめに:
  ```
  Demo:    https://ca-gigflow-dashboard.mangomeadow-46aa4d19.japaneast.azurecontainerapps.io
  GitHub:  github.com/.../agentic-gig-flow
  Article: zenn.dev/.../agentic-gig-flow
  ```

### ナレーション
> 「中小企業1社あたり、月20時間の経理工数と数万円の振込手数料を消去。
> 経営者の数字把握も、その場で完結します。
> Microsoft 365 を使う、すべての中小企業の月末に届くシステムです。」

---

## チェックリスト（撮影前）

- [ ] OBS 1920x1080 / 60fps
- [ ] マイクのテスト録音 / 部屋を整える
- [ ] Functions / Dashboard / Cosmos / Fabric / Polygon すべて稼働確認
- [ ] テストデータ（order × シナリオ）の事前投入
- [ ] **Copilot Studio Adaptive Card のレンダリング確認**（Test pane）
- [ ] **Dashboard の注文詳細に支払調書が表示される**こと（実装済み・要確認）
- [ ] **Fabric Data Agent が「¥586,537」を返す**ことを確認
- [ ] **Power BI レポートの右肩下がりデータ**準備
- [ ] BGM・効果音のライセンス確認

## チェックリスト（撮影後）

- [ ] Scene 5 の3分割映像が成立
- [ ] カウンタ "3.2 sec" の根拠（App Insights スクショ）
- [ ] **Scene 2 の Copilot Studio + Adaptive Card が綺麗**
- [ ] **Scene 6 が Dashboard で完結**している（MCP / Claude Desktop が映り込んでいない）
- [ ] **Scene 7 の Fabric Data Agent + Power BI が動いている**
- [ ] 字幕（日英）全シーン
- [ ] 全体 **2:50〜3:20** に収まっている
- [ ] YouTube に unlisted で先行アップロード → Zenn に埋込

## 失敗時のフォールバック

| 想定外 | 対処 |
|---|---|
| Polygon RPC が遅い | Settlement の計測を事前に取って固定値で字幕 |
| Sato アカウントが用意できない | 別ブラウザ + 別 wallet で代替 |
| Copilot Studio Adaptive Card が出ない | Bot Framework Emulator で同等画面を作って差替 |
| Fabric Data Agent が応答しない | Power BI レポート + SQL endpoint の集計画面で代替。Data Agent は shorter cut |
| デモ Repo の CI が落ちる | 簡易テスト1個だけにして必ず通す |
| 3分を超える | Scene 3 / 8 / 9 を詰める。Scene 5 は削らない |
