# デモ動画 撮影ランブック

> 動く様子をそのまま撮るための画面遷移・操作手順書。
> **発注 → Issue起票 → PR → Review Agent 検収 → 自動マージ → JPYC 着金 → 記帳** を1本通す。
> 撮影中に「次どこを開く？何をクリックする？」で迷わないことを目的にする。

---

## 0. 撮影前の事前準備（前日まで）

### 0-1. 使うURL・アカウント一覧

| 用途 | URL | アカウント |
|---|---|---|
| **Dashboard（発注 / 仕訳・支払調書 確認）** | `https://ca-gigflow-dashboard.mangomeadow-46aa4d19.japaneast.azurecontainerapps.io` | **PM/経理役**: `demo@MAMETAZK.onmicrosoft.com` / `Gigflow-Judge-vpebfyem!` |
| **GitHub（Issue / PR を見せる）** | `https://github.com/Mameta29/gigflow-demo-workspace` | **PM/経理役**: 自分の GitHub（読み取りで十分）<br>**Sato役（Worker）**: `ei-chan-bot` で PR を出す |
| **Polygonscan（着金 tx を見せる）** | `https://amoy.polygonscan.com/address/0x7F37f6D0c5B4D41E3722d12930430FE309489389` | ログイン不要 |
| **Copilot Studio（発注UI のイメージ用、Test pane）** | `https://make.powerapps.com/` → 右上の環境セレクタで **`dev-jpn-a523bcd3`**（Dataverse 有り）に切替 → 左メニュー Agents → `gigflow` | `mameta@MAMETAZK.onmicrosoft.com`<br>**注**: `https://copilotstudio.microsoft.com/` 直打ちは既定環境にルーティングされ `viral-signup 404` で永続ローディングになる罠あり。必ず環境セレクタ経由で入る |
| **Power BI / Fabric Data Agent（経営者ビュー）** | `https://app.fabric.microsoft.com/groups/2ddd9a2b-61ed-48b5-8bb5-b1e4bdcf6500` （Workspace `gigflow`） | `mameta@MAMETAZK.onmicrosoft.com` |

> **Copilot Studio は Publish 不可（Viral Trial 制約）** なので Test pane の画面録画で「発注UIの体験」を見せる。実際の発注処理（Issue 起票〜Webhook〜着金）は Dashboard 経由で確実に走らせる。

### 0-2. ブラウザの準備

- Chrome を **2ウィンドウ** 用意：
  - **A. PM/経理ウィンドウ** → Dashboard と GitHub を切り替えて使う
  - **B. Worker(Sato)ウィンドウ** → GitHub に `ei-chan-bot` でログイン
- 撮影用なのでブックマークバー・拡張機能・通知は事前にオフ
- ズーム 100%（リサイズ崩れ防止）、ウィンドウサイズは 1920×1080

### 0-3. demo repo を「ベース状態」に戻す

毎回新規 PR を出すために、`gigflow-demo-workspace` の main から前回の `contact` セクションが消えていることを確認：

```bash
git clone https://github.com/Mameta29/gigflow-demo-workspace.git
cd gigflow-demo-workspace
grep -c 'id="contact"' index.html   # → 0 が期待値
```

残っていたら revert PR を先にマージしておく。

### 0-4. Sato役 PR の差分を手元に用意

Sato役の Worker ウィンドウで使うため、以下2つの編集をクリップボードに用意：

**①ナビに1行追加** — `.nav` の中、会社情報リンクの後：
```html
<a href="#contact">お問い合わせ</a>
```

**②会社情報セクションの直後に追加**：

> **デザイン整合の注意**: `index.html` の既存 `.company-info` は `<dl><dt><dd>` 専用（CSS `.company-info { display: grid; grid-template-columns: 120px 1fr; }` で `dt` ラベル / `dd` 値の2列グリッドを描画）。お問い合わせは項目構造が違うので **`<dl>` を使い回さず、`<dl>` で同じ2列レイアウトに揃える** か、独自クラスにする。下記は前者（既存スタイルを再利用してデザインが揃う差分）。

```html
<section id="contact" class="section section-alt">
  <div class="container">
    <h2 class="section-title">お問い合わせ</h2>
    <p>業務のご相談・お見積りは、下記よりお気軽にご連絡ください。</p>
    <dl class="company-info">
      <dt>メール</dt>
      <dd>contact@marche.example.co.jp</dd>
      <dt>電話</dt>
      <dd>03-0000-0000（平日 10:00〜18:00）</dd>
    </dl>
  </div>
</section>
```

---

## 1. 撮影シナリオ全体像（時系列）

| # | 何を見せる | どの画面 | どのアカウント | 所要 |
|---|---|---|---|---|
| 1 | 発注UIの体験 | Copilot Studio Test pane | `mameta@MAMETAZK` | 30s |
| 2 | Dashboard で実際に発注 | Dashboard `/orders/new` | `demo@MAMETAZK`（PM役） | 30s |
| 3 | Issue が自動起票されたところ | GitHub Issues | `demo@MAMETAZK`（GitHub個人） | 20s |
| 4 | Sato が PR を出す | GitHub Web UI（editor） | `ei-chan-bot`（Worker役） | 40s |
| 5 | Review Agent が検収コメント | GitHub PR ページ | PM役 | 30s |
| 6 | auto-merge → JPYC 着金 | GitHub PR → Polygonscan | PM役 | 30s |
| 7 | 仕訳・源泉徴収・支払調書 | Dashboard `/orders/[id]` | `demo@MAMETAZK`（経理役） | 30s |
| 8 | Fabric Data Agent で経営者ビュー | Power BI / Fabric | `mameta@MAMETAZK`（経営者役） | 30s |

合計 約4分。台本に合わせて編集で調整。

---

## 2. 撮影手順（画面・操作レベル）

### Scene 1: Copilot Studio で「発注UIの体験」を見せる（30秒）

> 録画素材。実処理は走らせない。「PM はチャットで発注できる」絵を作るだけ。

1. ブラウザで `https://make.powerapps.com/` を開く（`https://copilotstudio.microsoft.com/` 直打ちは既定環境にルーティングされて `viral-signup 404` でローディングが終わらないので使わない）
2. `mameta@MAMETAZK.onmicrosoft.com` でサインイン
3. 右上の**環境セレクタ**で **`dev-jpn-a523bcd3`**（Dataverse 有りの開発者環境）に切替
4. 左メニュー **Agents** → **gigflow** を選択
5. 右上の **「Test your agent」** をクリック（Test pane が開く）
6. 入力欄に貼り付け：
   ```
   Sato さんに、コーポレートサイトに「お問い合わせ」セクションを追加してほしい。
   報酬は 50,000 JPYC、期日は2週間後。
   リポジトリは Mameta29/gigflow-demo-workspace。
   ```
7. Enter → Bot が応答するところまで撮る（Adaptive Card で「発注確認」が出る想定の画）
8. **「発注する」ボタンを押す動作までで止める**（実際の Issue 起票は Scene 2 で Dashboard 経由でやる）

**撮影ポイント**: 「自然言語で書くだけ」「人間が書くのはここだけ」を音声/字幕で強調。

---

### Scene 2: Dashboard で実発注（30秒）

> ここから先は実機。Issue が立ち、後段が全部つながる。

1. **PM/経理ウィンドウ A** で `https://ca-gigflow-dashboard.mangomeadow-46aa4d19.japaneast.azurecontainerapps.io` を開く
2. Entra ID サインイン画面 → `demo@MAMETAZK.onmicrosoft.com` / `Gigflow-Judge-vpebfyem!` でサインイン
3. **注文一覧ページ** が表示される。過去案件が並んでいる画を1秒見せる
4. 右上 **「＋ 新規発注」** ボタンをクリック → `/orders/new` へ
5. テキストエリアに Scene 1 と同じ内容を貼り付け：
   ```
   Sato さんに、コーポレートサイトに「お問い合わせ」セクションを追加してほしい。
   報酬は 50,000 JPYC、期日は2週間後。
   リポジトリは Mameta29/gigflow-demo-workspace。
   受注者の GitHub は ei-chan-bot、ウォレットは 0x7F37f6D0c5B4D41E3722d12930430FE309489389。
   検収基準は、index.html に id="contact" のセクションが追加され、ナビに #contact への導線が入り、HTML 構造が壊れていないこと。
   ```
6. **「発注する」** ボタンをクリック
7. Contract Agent が gpt-4o で構造化 → Issue 起票 → ページ自動遷移 `/orders/<新しいID>` まで撮る
8. 注文詳細ページに「ステータス: issue_created」「Issue: #N」「金額: 50,000 JPYC」が表示される画で止める

**撮影ポイント**: 「ここで人間の手作業はおしまい。あとは全部 Agent が回す」を強調。

---

### Scene 3: GitHub Issue が自動で立っているのを見せる（20秒）

1. 同じ PM/経理ウィンドウ A で新しいタブを開く
2. `https://github.com/Mameta29/gigflow-demo-workspace/issues` へ移動
3. 一番上に立ったばかりの Issue が見える（タイトル例: `[gigflow] コーポレートサイトにお問い合わせセクションを追加`）
4. Issue をクリックして本文を見せる：
   - **検収基準が箇条書きで4点** 整理されている
   - **受注者・報酬・期日** が表形式で書かれている
   - 末尾に `<!-- gigflow:orderId=... -->` のメタコメント
5. 右上の **Assignees** に `ei-chan-bot` が割り当たっている画も入れる

**撮影ポイント**: 「自然文 → 構造化された発注書」になっていることをカーソルで指差し。

---

### Scene 4: Sato（Worker）が PR を出す（40秒）

> Worker ウィンドウ B に切り替えて、`ei-chan-bot` で PR を出す。

1. **Worker ウィンドウ B** で GitHub を開き、`ei-chan-bot` でログイン済みであることを確認
2. `https://github.com/Mameta29/gigflow-demo-workspace` を開く
3. `index.html` を開いて編集（Web UI の鉛筆アイコン）
4. クリップボードの **①ナビ1行追加** を該当箇所に貼る
5. 同じファイルで **②contact セクション** を該当箇所に貼る
6. ページ下部の **Commit changes** → **Create a new branch** → ブランチ名 `feature/contact-section`（または `-2`, `-3` で都度変える）→ **Propose changes**
7. PR 作成画面：
   - タイトル: `お問い合わせセクションを追加`
   - 本文に `Closes #N`（Scene 3 の Issue 番号）を入れる
8. **Create pull request** をクリック
9. PR ページが開く。下部の **Checks** で CI が走り始める画を撮る

**撮影ポイント**: 「Worker は普通に PR を出すだけ。GitHub の標準フロー以外を一切やらない」を強調。

---

### Scene 5（山場前半）: Review Agent の検収コメント（30秒）

> ここで自動で起きることを「ただ眺める」。手は出さない。

1. Worker ウィンドウ B の PR ページに留まる
2. **CI（grep チェック）が ✅ になる** のを待つ（30秒〜1分）
3. CI が通った数秒後、Review Agent のコメントが PR に投稿される：
   ```
   ## ✅ Review passed by Agentic Gig-Flow
   Quality score: 8x/100  (Reviewed by Azure OpenAI gpt-4o / Foundry)

   | 基準 | 結果 | 証拠 |
   |---|---|---|
   | id="contact" セクションが追加 | ✅ | index.html: <section id="contact" ...> |
   | 見出しがある | ✅ | index.html: <h2 ...>お問い合わせ</h2> |
   | ナビに導線 | ✅ | index.html: <a href="#contact">お問い合わせ</a> |
   | HTML構造が壊れていない | ✅ | <!DOCTYPE html> 〜 </html> |
   ```
4. このコメントが投稿される瞬間〜表示される画を撮る
5. PR 上部の **Approve** バッジが Agent から付くのも撮る

**撮影ポイント**: 「Agent が diff から証拠（ファイルパス＋抜粋）を引用している」のテーブルにズーム。

---

### Scene 6（山場本体）: auto-merge → JPYC 着金（30秒）

> Review が通ると数秒で auto-merge → Settlement Agent → Polygonscan に tx。これを連続で見せる。

1. PR ページで **自動的に Merge pull request が走る**（PM ボタンを押さない）
2. PR が **Merged** バッジに変わる
3. ここで **画面を切り替え**：別タブで Polygonscan を開く
   - `https://amoy.polygonscan.com/address/0x7F37f6D0c5B4D41E3722d12930430FE309489389`
   - これは Sato の受取アドレス
4. ページをリロード → **Transactions** タブの一番上に新しい tx（数秒前）が出ている
5. tx をクリック → tx 詳細：
   - **Method**: `transfer`
   - **Token Transferred**: `50,000 JPYC` → Sato アドレスへ
   - **Block Confirmations**: 数ブロック（つまり既にファイナライズ済み）
6. tx の時刻と PR merge の時刻が **約3秒差** であることを字幕で強調

**撮影ポイント**: PR merge から着金 tx 出現までの「時間の短さ」が山場。タイムスタンプを並べて見せる。

---

### Scene 7: 仕訳・源泉徴収・支払調書（30秒）

> 経理が確認する画面。Dashboard の注文詳細に戻る。

1. PM/経理ウィンドウ A の Dashboard タブに戻る（Scene 2 で開いた `/orders/<id>` がまだ開いているはず。なければ注文一覧から再度開く）
2. ページをリロード → ステータスが **`bookkept`** に変わっている
3. 注文詳細ページを上から下までスクロール：
   - **基本情報**: 金額 50,000 JPYC / 受注者 / 期日
   - **送金 tx**: Polygonscan へのリンク（Scene 6 の tx）
   - **仕訳**: 借方 外注費 50,000 / 貸方 電子決済手段（JPYC）50,000
   - **源泉徴収**: `applies / rate / rationale` を表示（gpt-4o の判定理由つき）
   - **支払調書プレビュー**: Markdown レンダリング
4. 「経理が月末に手作業でやっていた処理が全部終わっている」ことを字幕で

**撮影ポイント**: 仕訳と支払調書のテーブルを順にズーム。日本の税務固有の処理（源泉徴収判定・支払調書）が自動で出ていることを強調。

> **源泉徴収を「あり 10.21%」で見せたい場合**（gpt-4o の判定ロジック）:
> - 「**プログラミング業務**」「**Web開発**」と判定されると → **源泉徴収なし**（記事 §2 の発注例「お問い合わせセクション追加」はこちらになる可能性が高い）
> - 「**ライティング・原稿料**」「**デザイン業務**」「**コンサルティング**」と判定されると → **源泉徴収あり 10.21%**
>
> Scene 7 で「源泉徴収あり」を確実に見せたいなら、発注文言に「**コピーライティング**」「**文案作成**」「**デザイン**」を入れる：
> ```
> Sato さんに、コーポレートサイトに「お問い合わせ」セクションの
> 文案・キャッチコピー作成と、それを反映する HTML 修正をお願いしたい。
> 報酬は 50,000 JPYC、期日は2週間後。
> ```
> ただし gpt-4o の判定は確率的なので、**撮影前に1度試走**して結果を確認すること。
> もし「なし」が出ても、それはそれで「日本のプログラミング業務は源泉徴収対象外という税法判定を AI が自動で行った」と説明できるので、デモ価値は維持できる。

---

### Scene 8: 経営者ビュー（Power BI / Fabric Data Agent）（30秒）

> 経営者は Power BI で月次外注費を見る。自然言語で Fabric Data Agent に問い合わせる。

1. ブラウザの別タブで **Fabric Workspace `gigflow`** を直接開く：
   `https://app.fabric.microsoft.com/groups/2ddd9a2b-61ed-48b5-8bb5-b1e4bdcf6500`
   - もしくは `https://app.fabric.microsoft.com/` → 左メニュー Workspaces → `gigflow`
2. `mameta@MAMETAZK.onmicrosoft.com` でサインイン
3. Workspace 内の **「月次業務委託費レポート」**（Power BI レポート）を開く
4. レポートを2秒見せる：
   - 月次の外注費推移グラフ（棒グラフ・右肩下がりトレンド 77万→26万 JPYC）
5. Workspace に戻り、**`gigflow-data-agent`**（Fabric Data Agent）を開いてチャット欄を表示
6. 1問目（業務委託費合計）：
   ```
   2026年1月の業務委託費の合計はいくら？
   ```
   - 動作確認済み回答（2026-05-30 撮影リハ）: **「2026年1月の業務委託費の合計は586,537円です」**
7. 2問目（月別推移）：
   ```
   月別の業務委託費の推移を教えて
   ```
   - 動作確認済み回答: 6ヶ月分の右肩下がりトレンド
     - 2025年11月: 769,583円
     - 2025年12月: 765,438円
     - 2026年1月: 586,537円
     - 2026年2月: 532,226円
     - 2026年3月: 381,433円
     - 2026年4月: 257,122円

> **重要**: 質問の作り方の注意点（2026-05-30 撮影リハで判明）
> - **「今月」「先月」は使わない**。seed データは 2025-11〜2026-04 の固定6ヶ月で、当月（2026-05）には1件も無い。Data Agent が「該当データなし」と返してしまう。**年月を明示**する。
> - **源泉徴収の質問は Data Agent では聞かない**。seed の `bookkeepingArtifacts.withholding` には金額カラムが無く、Data Agent が金額計算できずに業務委託費と同じ値を返してしまう（撮影リハで確認）。源泉徴収は Scene 7 の Dashboard 注文詳細で見せる（`bookkeepingArtifacts.withholding` の `applies/rate/rationale` を表示）。

**撮影ポイント**: 「経営者は SQL も画面遷移も覚えなくていい。日本語で聞くだけ」を強調。

---

## 3. 撮影中に避けること

- **複数 PR を同時に出さない** — 既知の Webhook 並走バグで Settlement が空振りすることがある。1本ずつ完走させる。
- **撮り直しのたびに demo repo を main 状態に戻す**（前回の contact セクションが残っていると差分が出ず CI が空回りする）
- 撮影中に Dashboard で「サインアウト→再ログイン」しない（Entra のセッション復元で待ち時間が出る）
- Polygon Amoy testnet の混雑時は着金が10秒以上かかることがある。山場で長引きそうなら**ピッチ動画では数秒に編集でカット**。

---

## 4. 撮り直し（リセット）手順

```bash
# demo repo を main に戻す
cd gigflow-demo-workspace
git checkout main && git pull

# 直近の contact セクションを取り除く revert PR を1本マージして main をクリーンに
# （あるいは別ブランチ名 feature/contact-section-2, -3 で毎回新規 PR にする）
```

- Cosmos の order は毎回新規 orderId になるので注文を作り直すだけでクリーン
- 既着金 order を再利用すると Settlement が冪等で空振りするので**必ず新規発注**

---

## 5. 撮影直前チェックリスト

- [ ] Dashboard に `demo@MAMETAZK` でサインインできる（MFA は無効化済み）
- [ ] demo repo `main` に前回の contact セクションが残っていない
- [ ] `ei-chan-bot` が demo repo に push できる（PAT 期限切れていない）
- [ ] Polygon Amoy のデモウォレット `0x5fA77C...` に MATIC 残高あり（送金ガス用）
- [ ] Function App `func-gigflow-28fa80` が稼働中（Application Insights で直近 traces が出ている）
- [ ] Container Apps の Dashboard が起動済み（cold start 回避のため事前に1回サインインしておく）
- [ ] Power BI レポートが当月データで更新されている
- [ ] Copilot Studio の Test pane で gigflow Agent が応答する（cold start なら撮影直前に1往復しておく）

---

## 6. 予備：失敗時のリカバリ

| 症状 | 対処 |
|---|---|
| Dashboard でサインイン後 500 / 401 | シークレットウィンドウで再サインイン。`demo@` ユーザーへの appRoleAssignment 確認 |
| Issue が立たない | Function App の `/api/orders/create` の Application Insights ログを確認。gpt-4o の金額抽出失敗が多い → `50,000 JPYC` のように明示 |
| Review Agent が PR にコメントしない | CI が ✅ になっているか確認。`waitForCheckRun` が timeout してないか Functions ログで確認 |
| auto-merge しない | PR の `qualityScore >= 70` か Review コメントで確認。70 未満なら検収基準を満たしていない |
| 着金しない | Polygonscan の **Internal Txns** タブも確認。デモウォレットの MATIC 切れの可能性 |
| Bookkeeping が走らない | Settlement の event が出ているか Cosmos `events` を確認。`settlement_succeeded` がないと Bookkeeping は起動しない |
