# 05. GitHub セットアップ

デモ用の対象リポジトリと、Webhook 連携の設定手順。

## §1. デモ用リポジトリの作成

このシステムは「Worker (受注者) が PR を出すリポジトリ」が必要。本番リポジトリ (`agentic-gig-flow`) とは**別に**用意する。

```bash
# GitHub CLI を使う場合 (推奨)
gh repo create gigflow-demo-workspace --public --description "Demo workspace for Agentic Gig-Flow"

# あるいは Web UI から手動作成
# - 名前: gigflow-demo-workspace
# - public
# - README + .gitignore (Node) + License (MIT)
```

このリポは **Sato さん (受注者) が作業する想定の場所**。実際の業務委託シナリオでは「会社が用意したプロジェクトリポ」に相当。

## §2. リポに最初の Issue を作る (テスト用)

Day 1 〜 Day 5 ぐらいまでは Cosmos に手動で Order を仕込み、それに対応する Issue を手動で作ることで Settlement までを E2E テストする。

Issue 本文 (Day 5 まで手動作成):
```markdown
## 業務内容
ログイン機能を実装する

## 検収基準
- [ ] /login ページがレンダリングされる
- [ ] ログイン成功時に / にリダイレクトされる
- [ ] ログイン失敗時にエラーメッセージが表示される
- [ ] テストが追加されている
- [ ] CI が通過している

## 報酬
50000 JPYC

## 期日
2026-05-23

## 受注者
@your_test_account

---
<!-- gigflow:orderId=test-order-001 -->
```

末尾の HTML コメント (`<!-- gigflow:orderId=... -->`) が **Cosmos 上の order と PR を紐付ける唯一の手がかり**。これを忘れると Settlement が起動しない。

## §3. GitHub PAT (Personal Access Token) の作成

Contract / Review Agent が Octokit 経由で API を叩くために必要。

1. https://github.com/settings/tokens (classic) または fine-grained tokens
2. 推奨: **fine-grained token**、対象リポジトリは `gigflow-demo-workspace` のみ
3. 必要な permissions:
   - **Repository permissions**:
     - Contents: Read and write
     - Issues: Read and write
     - Pull requests: Read and write
     - Metadata: Read (auto)
4. 90日 expiry でOK (ハッカソン期間 + バッファ)
5. 生成したトークンを Key Vault に格納:
   ```bash
   az keyvault secret set \
     --vault-name $KV_NAME \
     --name github-pat \
     --value "github_pat_..."
   ```

## §4. Webhook 設定

### Webhook URL の取得

Functions をデプロイ後、Webhook の URL は:
```
https://<FUNC_NAME>.azurewebsites.net/api/webhook/github?code=<function-key>
```

Function key の取得:
```bash
az functionapp keys list \
  --name $FUNC_NAME \
  --resource-group $RG \
  --query functionKeys.default -o tsv
```

### GitHub での設定

1. デモリポの Settings → Webhooks → Add webhook
2. **Payload URL**: 上記 URL
3. **Content type**: `application/json`
4. **Secret**: §1 で生成した `WEBHOOK_SECRET` (Day 0 の Key Vault 投入時の値)
5. **Which events?**: Let me select individual events
   - ✅ Pull requests
   - ✅ Pull request reviews (任意)
   - ✅ Check runs (CI連携用)
   - ✅ Issues (任意、debugging に便利)
6. **Active**: ☑

### 動作確認

GitHub の Webhook 設定画面に "Recent Deliveries" タブがある。最新の delivery を選んで:
- 200 OK が返っているか
- Payload と Response が見える

Application Insights のログで対応する `customEvents` がきていることも確認。

## §5. テスト用の二人目アカウント

「Worker (Sato) が PR を出す」シーンを作るには、**自分とは別の GitHub アカウント** が必要。理想:
- 副アカウントを作る (`@yourname-dev` 等)
- 自分の本アカウントが repo owner、副アカウントを Collaborator に
- Wallet も別 EOA を生成し、Cosmos の order の `workerWallet` に設定

代替案 (時間がない場合):
- 自分のアカウントから自分のリポに PR を出す。デモ的には十分

## §6. CI のセットアップ (GitHub Actions)

Worker の PR で CI が動かないと Review Agent が "ciStatus: pending" のまま動けないので、**最低限の Actions** を入れる:

`.github/workflows/ci.yml` (デモリポ側):

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci || true
      - run: npm test || echo "tests passed (placeholder)"
```

**ポイント**: デモリポは中身が薄くてもいい。CI が `success` で終わる構成にしておく。Review Agent が ciStatus を見て判定するロジックの動作確認に使う。

## §7. デモ用のサンプル PR を準備

Day 6 〜 Day 10 の間に、以下の PR シナリオを撮影できるようにしておく:

### シナリオA: 合格する PR
- Issue: 「README に "About" セクションを追加」 (簡単)
- PR: `README.md` に該当セクション追加 + テスト的なコミット
- 期待: Review Agent が approve → auto-merge → 送金

### シナリオB: 不合格になる PR
- 同じ Issue に対して、要件と関係ないファイル変更
- 期待: Review Agent が「要件未充足」とコメントして reject

### シナリオC: CI 失敗の PR
- 意図的にテストが落ちる PR
- 期待: Review Agent が "ciStatus: failure" を見て即 reject

これらのシナリオを録画素材として確保 (Day 21〜22 の動画撮影で使う)。

## §8. ブランチ保護 (任意)

本番運用を意識するなら、`main` ブランチに保護ルール:
- Require PR reviews (Review Agent が approve として記録される)
- Require status checks to pass (CI)

ハッカソンデモでは入れなくてもOK。ただし「実運用で使えますよ」と Zenn 記事で言及できる。

---

## §9. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| Webhook が 401/403 を返す | Function key が違う or HMAC 検証コードが署名と不一致 | Function key を再取得、署名検証を `crypto.createHmac` で確認 |
| Webhook delivery は成功しているが Functions に届かない | Functions の `host.json` の `extensionBundle` が古い、または未デプロイ | `func azure functionapp publish` を再実行 |
| `octokit` の calls が 401 | PAT の scope 不足 or expired | PAT を再生成、Key Vault に再投入 |
| Issue 本文の `<!-- gigflow:orderId=... -->` が消える | GitHub Markdown が一部 HTML コメントを保持しない場合あり | 隠しコメントの代わりに `> orderId: xxx` blockquote 行を末尾に置くフォールバックも実装 |
