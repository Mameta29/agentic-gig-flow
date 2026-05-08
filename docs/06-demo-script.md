# 06. ピッチ動画 シーン台本

提出動画。Zenn 記事に埋め込み。**山場は Scene 5 (PRマージ → 3秒で着金)**、ここの絵作りに最大エネルギー。**Scene 2 / 6 / 7 で Microsoft スポンサープロダクト総ナメ感を出す**。

## 撮影機材・ソフト

- 録画: OBS Studio (1080p 60fps、`mp4` で保存)
- 編集: DaVinci Resolve (無料) or Adobe Premiere
- マイク: 静かな部屋 + USBマイクあれば。ノイズはAuditionで除去
- 字幕: 日本語 + 英語 (国際的審査員想定で)
- BGM: royalty-free
- 効果音: 通知音、カウンタ音、控えめに

## カラー設計

- メインアクセント: Microsoft の青 + JPYC のピンク
- 背景: 白〜薄グレー
- ポジティブ通知: 緑、ネガティブ: 赤、文字: 黒

## ペルソナ設定 (字幕で4人を出す)

- **田中 健 (44)** — 中小ITコンサル「合同会社マルシュ」CTO。発注者。本人 (吉川さん) が演じる。
- **Sato Taro (32)** — バンコク在住フリーランスエンジニア。受注者。AI生成画像 or サブアカウント。
- **山田 由紀 (38)** — 経理担当者。**Claude Desktop で MCP 経由問合せ**。
- **大野 社長 (56)** — 経営者。**Power BI で月次レポート閲覧**。

---

## 全体構成 (4:00 / 240秒)

| Scene | Time | 長さ | テーマ |
|---|---|---|---|
| 1. Pain Point | 0:00 - 0:25 | 25s | 業務改革前の地獄 |
| 2. Order via Copilot Studio | 0:25 - 0:55 | 30s | 発注: Teams + Adaptive Card |
| 3. Worker Develops | 0:55 - 1:05 | 10s | タイムスキップで開発 |
| 4. AI Reviews PR | 1:05 - 1:55 | 50s | Review Agent が判定 |
| **5. The Moment** | **1:55 - 2:30** | **35s** | **PR merge → 3秒で着金 ★ 山場** |
| 6. Bookkeeping + Accountant via MCP | 2:30 - 3:00 | 30s | Copilot Studio 通知 + Claude Desktop で MCP 問合せ |
| 7. Executive via Fabric / Power BI | 3:00 - 3:20 | 20s | 経営者が自然言語で月次問合せ |
| 8. Architecture | 3:20 - 3:40 | 20s | 構成図 + 技術スタック |
| 9. Impact | 3:40 - 3:55 | 15s | 数値インパクト |
| 10. Outro | 3:55 - 4:00 | 5s | キャッチコピー + URL |

---

## Scene 1: Pain Point (0:00 - 0:25)

### 映像
- 0:00-0:05: 黒画面に **「Microsoft Agent Hackathon 2026 / 個人部門」** タイトル
- 0:05-0:15: 田中CTOの月末画面 (3画面分割):
  - 左: 経理ソフトに請求書PDFを 1件ずつ手入力
  - 中央: 銀行Webサイトで振込フォーム入力
  - 右: チャットで「Sato さんへの送金まだ?」と催促
- 0:15-0:20: Sato の画面 (バンコク): スマホで銀行アプリを覗く → 「振込待ち...」
- 0:20-0:25: 黒画面にテロップ **「これ、Microsoft Agent と JPYC で消します」**

### ナレーション

> 「副業3,000万人時代。中小企業は、業務委託先が増えるほど、月末経理が地獄になる。
> 海外フリーランスへの送金は3-5日待ち、振込手数料は1件5,000円。
> ── これ、Microsoft Agent と JPYC で消します。」

---

## Scene 2: Order via Copilot Studio (0:25 - 0:55)

### 映像
- 0:25-0:30: 田中、**Microsoft Teams** を開く。Copilot Studio Agent (gigflow) が左ペインに常駐
- 0:30-0:38: 田中がチャット:
  ```
  @gigflow Sato さんに「ログイン機能の実装」を依頼。
  報酬5万JPYC、期日2週間。リポジトリは gigflow-demo-workspace。
  ```
- 0:38-0:45: **Adaptive Card** が現れる:
  ```
  ╭─ 発注内容の確認 ────────────────────╮
  │ 受注者: Sato Taro (@sato-taro)       │
  │ 業務:   ログイン機能の実装           │
  │ 報酬:   50,000 JPYC                  │
  │ 期日:   2026-05-22                   │
  │ Repo:   gigflow-demo-workspace       │
  │                                       │
  │  [✅ 承認]  [✏ 編集]  [❌ キャンセル]│
  ╰──────────────────────────────────────╯
  ```
- 0:45-0:50: 田中が「✅ 承認」をクリック → Card が更新:
  ```
  ✅ 発注完了
  GitHub Issue #12 を作成しました。
  Contract Agent が処理を完了 (2.1 秒)
  [📋 Issue を開く]  [📊 Dashboard]
  ```
- 0:50-0:55: 画面右下に小さくフロー可視化:
  - Copilot Studio → Functions → Contract Agent → GitHub + Cosmos
  - 各ステップに緑チェック

### ナレーション

> 「PMはチャットに一行入力するだけ。Microsoft Copilot Studio の Agent が
> Adaptive Card で確認を取り、Contract Agent が GitHub Issue を起こし、
> 契約条件を Cosmos DB に永続化する。人間の手作業は、ゼロ。」

### 撮影メモ
- **Copilot Studio + Teams の絵は審査員に最も刺さる**。背景に Teams のサイドバーを必ず映す
- Adaptive Card は事前に作り込み、レンダリングを完璧に
- フロー可視化は Excalidraw で動的に作る

---

## Scene 3: Worker Develops (0:55 - 1:05)

### 映像
- 0:55-0:58: Sato の画面に切替。GitHub Issue 確認 → ブランチ作成
- 0:58-1:02: コーディング画面 (VS Code、早回し)
- 1:02-1:05: PR 作成画面 → Submit。テロップ **「2週間後...」** で時間圧縮

### ナレーション

> 「受注者の Sato さんは、いつも通り GitHub で開発し、PRを出すだけ。」

---

## Scene 4: AI Reviews PR (1:05 - 1:55)

### 映像
- 1:05-1:10: PR が GitHub に作成された瞬間、画面が PR ページに切替
- 1:10-1:20: 画面右上に「**Review Agent (gpt-4o)**: thinking...」のローディング
- 1:20-1:35: Review Agent のコメントを大きく表示:
  ```
  ## ✅ Review passed by Agentic Gig-Flow

  Quality score: 87/100
  Reviewed by Azure OpenAI gpt-4o (Foundry)

  ### 検収基準
  | 基準 | 結果 | 根拠 |
  |---|---|---|
  | /login がレンダリングされる | ✅ | app/login/page.tsx:10 |
  | ログイン成功で / にリダイレクト | ✅ | actions.ts:24 |
  | エラーメッセージ表示 | ✅ | components/error.tsx:8 |
  | テストが追加されている | ✅ | __tests__/login.test.ts:1 |
  | CI 通過 | ✅ | check-run: success |

  このPRをマージすると、50,000 JPYC が @sato-taro に自動送金されます。
  ```
- 1:35-1:45: 「Auto-merge enabled」状態 → 田中がマージボタンをクリック
- 1:45-1:55: マージ成功の緑メッセージ。**ここで一瞬間を置く** (溜めの演出)

### ナレーション

> 「Review Agent が PR の差分を読み、契約時に定義した検収基準を逐一照合。
> Azure OpenAI gpt-4o が、根拠を引用しながら判定します。
> 合格なら、自動で approve → マージ。」

---

## Scene 5: The Moment (1:55 - 2:30) ★★★ 山場

### 映像

**ここに動画予算の半分を投じる。**

- 1:55-1:58: マージボタンが押された瞬間、画面全体が**3分割**:
  - **左**: GitHub PR画面、"Merged" の紫バッジ
  - **中央**: Polygonscan の transaction 詳細ページ
  - **右**: Sato のスマホ (ウォレットアプリの通知)

- 1:58-2:02: 画面下に**大きなカウンター**:
  ```
  PR merged → JPYC arrived
  ⏱ 0.0 → 1.2 → 2.4 → 3.2 sec
  ```

- 2:02-2:10: 3画面それぞれで状態が変わる:
  - 左: PR が closed/merged
  - 中央: txhash が現れる → confirmations が増える
  - 右: 通知音 + 「+50,000 JPYC received」がポップアップ

- 2:10-2:20: カウンターが **「3.2 sec」** で止まる。BGMが一瞬無音 + **「ピン」という通知音**

- 2:20-2:30: テロップ:
  ```
  PR マージから 3.2 秒。
  バンコクにいる Sato さんに、5万円が届いた。
  ```
  英字幕: "3.2 seconds from merge to settled. Sato in Bangkok just got paid."

### ナレーション

> 「**PR を マージ した 3.2 秒 後。**
> 海外にいる Sato さんに、円が、届きました。」
>
> (一拍置く)
>
> 「銀行の営業時間も、振込手数料も、月末締めもありません。」

### 撮影メモ
- **編集が命**。粗い素材でも編集で 3分割 + カウンタ + 通知音を重ねれば成立
- カウンタは Application Insights の実測値を使う
- BGM の一瞬の無音 → 通知音 → BGM 復帰、で「決め所」を作る

---

## Scene 6: Bookkeeping + Accountant via MCP (2:30 - 3:00)

### 映像

**前半 (2:30-2:42): Bookkeeping → Copilot Studio 通知**

- 2:30-2:35: 画面が田中の Teams に戻る
- 2:35-2:42: Copilot Studio Bot から田中宛に Adaptive Card:
  ```
  ✅ Sato Taro 様への 50,000 JPYC のお支払いが完了しました。

  💰 仕訳: 借方 外注費 50,000 / 貸方 暗号資産 50,000
  📝 源泉徴収: なし (国内/海外 区分により判定)
  📄 [支払調書テンプレダウンロード]
  📊 [Polygonscan]   📈 [Power BI 月次レポート]
  ```

**後半 (2:42-3:00): 山田経理が Claude Desktop で問合せ**

- 2:42-2:45: 山田の画面に切替。**Claude Desktop** が起動済み (背景に「MCP Server: gigflow-mcp connected」バッジ)
- 2:45-2:55: 山田が Claude にチャット:
  ```
  山田: 4月の Sato さんへの支払い、源泉徴収どうなってる?

  Claude: gigflow-mcp サーバの queryOrders と getWithholdingReport を呼び出します...

  4月、Sato Taro さんへの支払いは 3 件・合計 150,000 JPYC でした。
  源泉徴収はいずれも「なし」(プログラミング業務 + 海外居住者、租税条約に基づく判定)。
  支払調書は Bookkeeping Agent が orderId 単位で生成済みです。
  必要であれば exportPaymentStatement で取得できます。
  ```
- 2:55-3:00: 画面右下に MCP の tool 呼び出しトレース:
  - `queryOrders(month=2026-04, worker=sato-taro)` → 3 件
  - `getWithholdingReport(workerId=..., year=2026)` → 詳細

### ナレーション

> 「Bookkeeping Agent が、仕訳・源泉徴収判定・支払調書テンプレートを自動生成。
> 経理担当者は、Claude Desktop から MCP サーバ越しに、いつでも自然言語で問い合わせできます。
> Multi-agent の世界では、別 AI が gigflow を**ツールのように**使えるんです。」

### 撮影メモ
- Claude Desktop の MCP 接続バッジを必ず映す (Anthropic との互換性アピール)
- Copilot Studio の Adaptive Card と Claude Desktop の応答を**両方撮る** — Microsoft AI と Anthropic AI が握手している絵

---

## Scene 7: Executive via Fabric / Power BI (3:00 - 3:20)

### 映像
- 3:00-3:05: 大野社長の画面。**Microsoft Teams** で Copilot に問合せ:
  ```
  大野: 今四半期の業務委託費の累計と、月次の推移を見せて。
  ```
- 3:05-3:12: Copilot が **Microsoft Fabric Data Agent** に転送 (画面右にトレース)。応答:
  ```
  Q1 累計: 1,250,000 JPYC (前年同期比 -47%)
  月次推移: [Power BI レポート埋込画像]
  ```
- 3:12-3:18: 画面が **Power BI** に切替、月次の業務委託費棒グラフ + 受注者ランキング
- 3:18-3:20: 大野「うん、これいいね」風

### ナレーション

> 「経営者は、Microsoft Fabric Data Agent に自然言語で問い合わせるだけ。
> Cosmos のデータが Fabric にミラーリングされ、Power BI が経営判断に使える数字を返します。」

### 撮影メモ
- Power BI のレポートは事前に作り込み、月次推移が「右肩下がり」(コスト削減) になるダミーデータで撮影
- Fabric Data Agent への問合せが SQL 自動生成で動く絵を、画面右の小窓で見せる

---

## Scene 8: Architecture (3:20 - 3:40)

### 映像
- 3:20-3:40: アーキテクチャ図を表示 (`docs/01-architecture.md` §1 を高解像度で書き出し)
- ハイライトを順番に当てる:
  1. Copilot Studio (Teams)
  2. Functions + 4 Agents (Foundry)
  3. Cosmos DB
  4. Polygon × JPYC
  5. **MCP Server (gigflow-mcp)** ← 強調
  6. **Fabric Data Agent + Power BI** ← 強調
  7. Entra ID (全体を覆うように)

### ナレーション

> 「アーキテクチャは、Microsoft Foundry の gpt-4o で 4 つのエージェントを動かし、
> Copilot Studio が Teams から発注を受け、MCP サーバが経理担当者の Claude Desktop からの問合せを受け、
> Microsoft Fabric の Data Agent が経営者向けに自然言語 BI を提供する。
> Entra ID がすべての入口を統合し、Polygon の JPYC で決済が完結する。
> Multi-agent エコシステムの完成形です。」

---

## Scene 9: Impact (3:40 - 3:55)

### 映像
- 3:40-3:55: 数値を1つずつ表示:
  ```
  経理工数:        20 時間/月 → 1 時間/月  (-95%)
  振込手数料:     50,000 円/月 → ほぼ 0 円  (-99.6%)
  受注者の入金待機:  3-5 日 → 3 秒
  経営者の月次集計: 経理依頼 → Teams で1分
  ```
- 3:50-3:55: 「副業 3,000 万人 × 全企業の月末経理が対象」テロップ

### ナレーション

> 「中小企業1社あたり、月20時間の経理工数と5万円の振込手数料を消去。
> 経営者の数字把握も、月次レポート依頼から、その場で完結。
> 副業3,000万人時代の、すべての業務委託に届く規模感です。」

---

## Scene 10: Outro (3:55 - 4:00)

### 映像
- 黒画面に大きく:
  ```
  Agentic Gig-Flow

  「働いた瞬間に、円が動く」
  ```
- URL 4点を控えめに表示:
  ```
  Demo:    https://...
  Teams:   gigflow Agent (招待リンク)
  GitHub:  github.com/.../agentic-gig-flow
  Article: zenn.dev/.../agentic-gig-flow
  ```

---

## チェックリスト (撮影前)

- [ ] OBS の解像度 1920x1080 / 60fps 設定
- [ ] マイクのテスト録音
- [ ] 部屋を整える
- [ ] Cosmos / Functions / Dashboard / MCP / Fabric / Polygon すべて稼働確認
- [ ] テストデータ (order x 3 シナリオ) の事前投入
- [ ] **Copilot Studio Adaptive Card のレンダリング確認**
- [ ] **Claude Desktop で gigflow-mcp 接続済みであること**
- [ ] **Power BI レポートのダミーデータ準備**
- [ ] BGM・効果音のライセンス確認

## チェックリスト (撮影後)

- [ ] Scene 5 の3分割映像が成立
- [ ] カウンタの "3.2 sec" のエビデンス (App Insights スクショ)
- [ ] **Scene 2 の Copilot Studio + Adaptive Card が綺麗**
- [ ] **Scene 6 の Claude Desktop の MCP バッジが映っている**
- [ ] **Scene 7 の Fabric Data Agent + Power BI が動いている絵が取れている**
- [ ] 字幕 (日英) 全シーン
- [ ] 全体 3:50〜4:10 に収まっている
- [ ] YouTube に unlisted で先行アップロード

## 失敗時のフォールバック

| 想定外 | 対処 |
|---|---|
| Polygon RPC が遅い | Settlement の計測を事前に取って固定値で字幕 |
| Sato アカウントが用意できない | 別ブラウザ + 別 wallet で代替 |
| Copilot Studio Adaptive Card がレンダリングされない | Bot Framework Emulator で同等画面を作って差替 |
| Fabric Mirror が間に合わない | Power BI に直接 Cosmos コネクタで接続して代替。Data Agent シーンは shorter cut |
| MCP Server デプロイ失敗 | ローカルで Claude Desktop に接続して撮影 |
| デモ用 Repo の CI が落ちる | 簡易テスト1個だけにして必ず通す |
