# 検収デモ 撮影ランブック（Scene 2〜6 を実機で通す）

> 動画 Scene 2〜6 を **実際に動かして撮る**ための段取り。
> 発注 → Issue → Sato役PR → Review Agent が gpt-4o で検収基準を照合 → 自動マージ → JPYC着金 → 記帳 を1本通す。
> demo repo: **`Mameta29/gigflow-demo-workspace`**（public、ベースサイト配置済み）。
> Dashboard: https://ca-gigflow-dashboard.mangomeadow-46aa4d19.japaneast.azurecontainerapps.io

---

## 0. 大前提（必ず守る）

- **一度に1PRずつ。** 複数PRを同時にマージしない（既知レース回避。SUBMISSION-PLAN 判断2）。
- 発注は2経路ある:
  - **Scene 2 の見せ用** = Copilot Studio（Test pane）で発注する画を**録画**（Publish不可なので録画）。
  - **実際に Issue→Review→着金 を通す用** = **Dashboard の発注フォーム**から発注（確実に通る本番経路）。
  - 撮影では「Copilot Studio で発注した体」で見せ、裏で Dashboard 発注が Issue を立てる、という編集でつなぐのが安全。両方が同じ Issue を指すように内容を揃える。
- 撮影前に全サービス稼働確認（Functions / Dashboard / Cosmos / Fabric / Polygon RPC）。

---

## 1. 発注内容（題材＝お問い合わせセクション追加）

Dashboard の発注フォーム（または Copilot Studio）に、次の内容で発注する。

| 項目 | 値 |
|---|---|
| 受注者（GitHub） | `ei-chan-bot`（Sato役。過去E2Eで使用実績あり） |
| 受注者ウォレット | デモ用受取アドレス（過去E2E: `0x7F37f6D0c5B4D41E3722d12930430FE309489389`） |
| 業務内容 | コーポレートサイトに「お問い合わせ」セクションを追加する |
| 報酬 | 50,000 JPYC |
| 期日 | 2週間後 |
| リポジトリ | `Mameta29/gigflow-demo-workspace` |

### 検収基準（acceptanceCriteria）— gpt-4o が diff から照合できる粒度にする

Contract Agent が Issue 本文に書き出す検収基準は、**「diff を見れば真偽が判定でき、証拠を引用できる」**ものにする。発注時の説明にこの4点を含める:

1. `index.html` に `id="contact"` のセクションが追加されている
2. お問い合わせセクションに見出し（例「お問い合わせ」）がある
3. ナビゲーション（`.nav`）に「お問い合わせ」への導線（`#contact` リンク）が追加されている
4. HTML の基本構造（`<!DOCTYPE html>` 〜 `</html>`）が壊れていない

> この4点は、後述の Sato役PR が**確実に満たす**ように作ってある。かつ CI（grep チェック）とも整合する。

---

## 2. Sato役の PR（確実に検収を通る変更）

発注後、Issue が立ったら、Sato役（`ei-chan-bot`）として次の変更で PR を出す。Scene 3 の「開発」を早送りで撮る部分。

### 変更1: `index.html` のナビに導線を追加

`.nav` の中（会社情報リンクの後）に1行追加:

```html
<a href="#contact">お問い合わせ</a>
```

### 変更2: `index.html` の会社情報セクションの後に、お問い合わせセクションを追加

`<section id="company">…</section>` の直後（`</main>` の前）に追加:

```html
<section id="contact" class="section section-alt">
  <div class="container">
    <h2 class="section-title">お問い合わせ</h2>
    <p>業務のご相談・お見積りは、下記よりお気軽にご連絡ください。</p>
    <ul class="company-info">
      <li>メール：contact@marche.example.co.jp</li>
      <li>電話：03-0000-0000（平日 10:00〜18:00）</li>
    </ul>
  </div>
</section>
```

> これで検収基準1〜4をすべて満たす。CI の grep チェックも通る（既存セクションを壊さないため）。

### PR の出し方（撮影手順）

```bash
# Sato役のローカルで（または GitHub Web UI で）
git clone https://github.com/Mameta29/gigflow-demo-workspace.git
cd gigflow-demo-workspace
git checkout -b feature/contact-section
# 上の変更1・2を index.html に適用
git add index.html
git commit -m "Add contact section"
git push origin feature/contact-section
# GitHub で main 向けに PR を作成（PR本文に Issue 番号を紐付け）
```

> **重要**: Issue と PR の紐付けは、Contract Agent が Issue 本文末尾に埋め込む `<!-- gigflow:orderId=... -->` で行われる。PR は通常通り main 向けに出せばよい（Webhook が拾う）。

---

## 3. 撮影で起きること（Scene 4〜6 の実機）

PR を出すと自動でこう進む。これをそのまま撮る:

1. **Scene 4**: GitHub Webhook → Functions → `waitForCheckRun` で CI 完了待ち → `ciStatus=success` → Review Agent が gpt-4o で検収基準を1項目ずつ照合。PR に**証拠（ファイルパス+抜粋）付きの合格コメント**が付く → `qualityScore>=70 && 全met` で **auto-merge**。
2. **Scene 5（山場）**: merge の `pull_request.closed(merged=true)` Webhook → Settlement Agent（LLM不使用）→ ガードレール→ Key Vault から秘密鍵→ `transfer()` で JPYC送金 → 約3秒で着金。Polygonscan に tx が出る。
3. **Scene 6**: Settlement → Bookkeeping Agent が仕訳・源泉徴収・支払調書を生成 → Copilot Studio に完了通知（Adaptive Card）→ 経理は Dashboard の注文詳細で確認。

### Scene 4 で見せる Review コメント（実物が出る）

Review Agent が実際に PR に書くコメント例（gpt-4o 出力なので文言は変動する）:

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

---

## 4. 撮り直し・リセット手順

デモを繰り返すとき、demo repo をベース状態に戻す:

```bash
cd gigflow-demo-workspace
git checkout main && git pull
# マージ済みの contact セクションを取り除いて main をベースに戻す（revert か手戻し）
# または別ブランチ名で毎回新しい PR を出す（feature/contact-section-2 ...）
```

- Cosmos の order は毎回新規 orderId になるので、注文を作り直せばクリーンに撮れる。
- 既に着金済みの order を再利用すると Settlement が冪等で空振りするので、**毎回新規発注**する。

---

## 5. チェックリスト（撮影直前）

- [ ] demo repo の main がベースサイト状態（前回のcontactセクションが残っていないか）
- [ ] Dashboard にサインインできる（審査員アカウント or 自分のアカウント）
- [ ] 発注フォームから「お問い合わせセクション追加」を発注できる
- [ ] Issue に検収基準4点が書き出される
- [ ] Sato役の PR が出せる（`ei-chan-bot` の権限・PAT が demo repo を指している）
- [ ] CI が通る（grep チェック）
- [ ] Review Agent が証拠付きで approve → auto-merge する
- [ ] Settlement で Polygon に tx が出て着金する
- [ ] Bookkeeping が仕訳・源泉徴収・支払調書を生成し Dashboard に出る
- [ ] **一度に1PRずつ**（同時マージしない）
