# デプロイ進捗・引き継ぎ資料

> このファイルは Azure 本番環境構築の進捗を記録する作業ログ。
> 新しいセッションで「続き」と言われたら、まず本ファイルを読んで現在地を把握すること。
> `docs/12-deployment-guide.md` が全体手順。本ファイルはそれに対する「いまどこ」の注記。

**最終更新: 2026-05-19（Step 2・3・7 完了。Node は 22 に確定）**

---

## 0. 最重要・現在地サマリ

- **Step 2・3・7 完了。** Step 4/5/6 はユーザー作業待ち。
- Cosmos DB に seed 投入済み: tenants 1 / accounts 1 / orders 49 / events 0。
- **Function App は Node 22 で稼働中**（Node 24 は japaneast Linux Consumption で起動不能 — §11 参照）。
  5関数（githubWebhook / copilotWebhook / ordersCreate / ordersList / ordersStream）デプロイ済み・稼働確認済み。
- GitHub demo repo `Mameta29/gigflow-demo-workspace` 作成済み。Webhook 登録済み・ping `200 OK` 確認済み。
- **次は Step 4（JPYC 送金疎通）— ユーザー作業が必須**（秘密鍵生成・MATIC/JPYC 入金）。詳細は §9。
- Step 5（Copilot Studio）・6（Fabric）もブラウザ UI 操作のためユーザー作業必須。

### 次にやるべき1手（ユーザー作業）

**Step 5（Copilot Studio）/ Step 6（Fabric）はブラウザ UI 操作のためユーザー必須。**
Step 4 まで完了済み。Container Apps（Dashboard/MCP）デプロイは私が進行中。

### Step 4 完了の確定値（JPYC 送金疎通・Amoy testnet）

- ネットワーク: Polygon Amoy testnet（`POLYGON_CHAIN_ID=80002`）
- **JPYC コントラクト（Amoy）: `0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29`**
  （mainnet の `0x431D5dfF...` とは別アドレス。`getBytecode` で実在を確認済み）
- デモウォレット: `0x5fA77C457A1afa353D495991dB548BCC2F60057c`
  （testnet 専用・使い捨て。秘密鍵は Key Vault `wallet-pk` に保存済み。残高 ~100万 JPYC + 0.078 POL）
- 送金疎通テスト成功: 100 JPYC → `0x7F37f6D0c5B4D41E3722d12930430FE309489389`
  tx `0x759399aa302c44d7da0c1e40eddc5337a956bdf5625ccc6c3928eca3efde6ba7`（block 38628755）
- Function App settings: `JPYC_ADDRESS` も Amoy アドレスに更新済み。
- ⚠️ `env.ts` の `jpycAddress()` デフォルトは mainnet 値のまま。Function App は環境変数で上書き済みなので
  実害なし。ローカルで `test-transfer.ts` を回すときは `JPYC_ADDRESS` 環境変数を渡すこと。

### Step 7 完了の確定値

- GitHub demo repo: `Mameta29/gigflow-demo-workspace`（public）
- Webhook: hook id `626406675`、events = pull_request / pull_request_review / check_run、ping `200 OK`
- Webhook URL は `/tmp/webhook-url.txt`（function key 込み）。再取得は
  `az functionapp keys list --name func-gigflow-28fa80 -g rg-gigflow-prod --query functionKeys.default -o tsv`
- Function App は削除→再作成済み。新 Managed Identity principalId = `2235b211-1a2f-4973-9b69-bedc14fea828`
  （旧 `4de2ddcf-...` は無効）。3ロール（KV Secrets User / OpenAI User / Cosmos Data Contributor）再付与済み。
- OIDC: `app-gigflow-github-actions`（appId `903211a9-129e-436e-b9c6-39a3abd73391`）+ repo secret 5個 +
  production environment 設定済み。ただし GitHub Actions の `Azure/functions-action` は Sync Trigger 問題で
  使えず、デプロイは **`func azure functionapp publish` をローカルから**実施した（§11）。

### Step 2 で作成した Entra アプリ（MAMETA テナント・確定値）

| アプリ | appId | SP objectId |
|---|---|---|
| app-gigflow-functions | `888bf613-f88b-48d0-8f67-d952efb74ebd` | `cc4b9af5-8e1a-4d2e-bddc-5dbf01348957` |
| app-gigflow-mcp | `490f9eb7-77c4-4811-91e5-53a2b41f8aaa` | `55dceaab-5c90-4103-bb36-6681d5d1ea81` |
| app-gigflow-fabric | `8936db6a-bd9e-48cb-aa60-7f03708d3eb5` | `c24dc055-1ac1-4ccc-89de-a2cf97470807` |
| app-gigflow-dashboard | `20df8952-5090-4333-886c-18f9f60af6ed` | `ceba7b8b-ef85-4e50-9d9f-112b52d8a79b` |
| app-gigflow-copilot (bot) | `5f03c4f8-87ce-4b38-90be-86dc0e0eb7a3` | `e529154b-a744-4aae-a60c-e22e21e97d04` |

- identifier URI は全て `api://{appId}` 形式。
- App Roles（PM/Accountant/Executive）は functions・mcp に設定済み。デモ用に自分自身へ全ロール割当済み。
- API permissions（Dashboard→Functions/MCP、Bot→Functions/MCP/Fabric）登録済み。
- **admin-consent**: `az ad app permission admin-consent` は AAD Graph 経由で
  「organization has not subscribed to a service」で失敗する。
  → Microsoft Graph の `oauth2PermissionGrants` に `consentType=AllPrincipals` で直接 POST して解決済み。
  5グラント（Dashboard→Functions/MCP、Bot→Functions/MCP/Fabric）全て成功。手動同意も不要。
- Function App settings の `FUNCTIONS_APP_AUDIENCE` / `MCP_APP_AUDIENCE` / `BOT_APP_ID` は新 appId に更新済み。

---

## 1. アカウント・テナント構成（確定）

全リソースを **MAMETA テナント1つに統一済み**（当初 Azure と M365 が別テナントに分裂していたのを移管で解決）。

| 項目 | 値 |
|---|---|
| MAMETA テナント ID | `3894eada-7a32-44e1-9c8b-6098a6a92a2d` |
| プライマリドメイン | `MAMETAZK.onmicrosoft.com` |
| Azure サブスクリプション名 | `Azure subscription 1` |
| Azure サブスクリプション ID | `5e446400-4cf3-4651-88bc-b02e2edfcb36` |
| 旧テナント（使わない） | Default Directory `860aac53-75a0-4506-ab6c-956e2b43a055` |

### アカウント2つの役割（重要）

| アカウント | MAMETA での権限 | できること |
|---|---|---|
| `mameta.zk@gmail.com` | ゲスト + サブスクリプション **Owner** | Azure リソース操作 ✅ / Entra アプリ操作 ❌（権限不足） |
| `mameta@MAMETAZK.onmicrosoft.com` | **グローバル管理者** | Entra アプリ操作 ✅ / Azure リソース操作 ❌ |

→ `az login` は **`mameta.zk@gmail.com`** で MAMETA テナント(`--tenant 3894eada-7a32-44e1-9c8b-6098a6a92a2d`)に入る。
→ Entra アプリ作成のため、ゲストに「アプリケーション管理者」ロールを付与して1アカウントで全部できるようにする方針（依頼済み・完了待ち）。

### az ログインコマンド（セッション再開時）

```bash
az login --tenant 3894eada-7a32-44e1-9c8b-6098a6a92a2d
# ブラウザで mameta.zk@gmail.com を選択
az account show --query "{name:name, tenantId:tenantId}" -o table
# tenantId が 3894eada-... なら OK
```

---

## 2. 作成済み Azure リソース（SUFFIX = `28fa80`）

リソースグループ `rg-gigflow-prod`（リージョン japaneast、OpenAI のみ eastus2）。

| リソース | 名前 | 備考 |
|---|---|---|
| Resource Group | `rg-gigflow-prod` | |
| Cosmos DB | `cosmos-gigflow-28fa80` | DB `gigflow` + コンテナ orders/events/accounts/tenants 作成済み |
| Key Vault | `kv-gigflow-28fa80` | RBAC 認可。secret `github-webhook-secret` 保存済み |
| Storage | `stgigflow28fa80` | Function App 用 |
| Function App | `func-gigflow-28fa80` | **Node 24**（後述の決定事項参照）。Linux Consumption |
| App Insights | `func-gigflow-28fa80`（Function App 自動生成分を流用） | 接続文字列は Function App settings に設定済み |
| Log Analytics | `log-gigflow-28fa80` | |
| Azure OpenAI | `aoai-gigflow-28fa80-eus2` | **eastus2**。gpt-4o デプロイ名 `gpt-4o`、**Standard SKU**（後述） |
| Container Apps Env | `cae-gigflow-28fa80` | Dashboard / MCP 用。コンテナ本体は未デプロイ |

### Function App Managed Identity（移管後に作り直し済み）

- principalId: `4de2ddcf-aadb-408b-9889-e1ba461d971e`（新テナント `3894eada-...`）
- 付与済みロール: Key Vault Secrets User / Cognitive Services OpenAI User / Cosmos DB Built-in Data Contributor

### 自分（mameta.zk@gmail.com, objectId `d43c91a4-0104-408d-a89c-f9e83ff58f8c`）の付与済みロール

- サブスクリプション Owner
- Key Vault Secrets Officer（kv-gigflow-28fa80）
- Cosmos DB Built-in Data Contributor（cosmos-gigflow-28fa80）

### Function App の app settings（設定済み）

`COSMOS_ENDPOINT` / `COSMOS_DATABASE=gigflow` / `KEY_VAULT_NAME` / `AZURE_OPENAI_ENDPOINT` /
`AZURE_OPENAI_DEPLOYMENT=gpt-4o` / `AZURE_OPENAI_API_VERSION=2024-10-21` / `POLYGON_RPC` /
`JPYC_ADDRESS` / `APPLICATIONINSIGHTS_CONNECTION_STRING` /
`FUNCTIONS_APP_AUDIENCE` / `MCP_APP_AUDIENCE` / `BOT_APP_ID`

✅ `FUNCTIONS_APP_AUDIENCE` / `MCP_APP_AUDIENCE` / `BOT_APP_ID` は新 appId に更新済み（§5）。

### Key Vault の tenantId（2026-05-19 修正済み）

⚠️ サブスクリプション移管後も Key Vault リソースの `tenantId` プロパティは旧テナント
`860aac53-...` のまま残っていた。Key Vault は認証時にこのプロパティを使うため、MAMETA
トークンが `AKV10032: Invalid issuer` で全拒否されていた。
→ `az keyvault update --name kv-gigflow-28fa80 -g rg-gigflow-prod --set properties.tenantId=3894eada-7a32-44e1-9c8b-6098a6a92a2d`
で MAMETA に変更して解決済み（§8 参照）。

---

## 3. このデプロイで発生した決定事項（CLAUDE.md 絶対線との差分）

### 決定1: Node 20 → Node 24

Azure が「Node 20 は 2026-04-30 EOL」として Function App 作成を拒否したため Node 24 を採用。
✅ **対応済み（コミット `3ae17f9`）**: CLAUDE.md §2/§5、`.github/workflows/ci.yml`・
`deploy-functions.yml` の `node-version` を 24 に更新。
root `package.json` の `engines` は `>=20`（Node 24 を含むので変更不要）、各ワークスペースは
`engines` 指定なし。コードは TypeScript なのでランタイム影響は確認した範囲で無し
（ローカル Node 22 でビルド・typecheck・全テスト pass）。

### 決定2: Azure OpenAI が eastus2 / Standard SKU

新規サブスクリプションでは japaneast の gpt-4o quota が 0 だった。
eastus2 で `Standard` SKU（GlobalStandard ではなく）に枠 50 があったため、そちらで作成。
エンドポイント `https://aoai-gigflow-28fa80-eus2.openai.azure.com/`。デモのレイテンシ影響は許容範囲。

### 決定3: Entra identifier URI が `api://{appId}` 形式

MAMETA テナントのポリシーで `api://gigflow-functions` のような名前付き URI が拒否される。
`api://{appId}` 形式を使う。`infra/entra/setup-app-roles.sh` は修正済み（コミット未確認、§6参照）。

---

## 4. 旧テナント（Default Directory）に残っているゴミ

旧テナント `860aac53-...` で作成した Entra アプリ5つ（app-gigflow-functions など）が残存。
旧テナントのものなので MAMETA からは使えない。**課金はしないが、混乱回避のため後で削除推奨**。
Azure リソース自体は移管済みなので旧テナント側には残っていない。

---

## 5. Step 2 完了記録：Entra アプリ作成（2026-05-19 完了）

§0 に確定値を記載。実施した内容:

1. ゲスト `mameta.zk@gmail.com` に「アプリケーション管理者」ロールが付与され、
   `az ad app create` でアプリ操作が可能になった。
2. Entra アプリ5つを `az ad app create --sign-in-audience AzureADMultipleOrgs` で作成。
3. `infra/entra/setup-app-roles.sh` を appId 環境変数付きで実行 →
   identifier URI（api://{appId}）・App Roles・公開スコープ・API permissions・デモ用ロール割当が完了。
4. admin-consent は AAD Graph 経由で失敗 → Microsoft Graph `oauth2PermissionGrants` に
   `consentType=AllPrincipals` で直接 POST して解決（§8 のハマりどポイント参照）。
5. Function App settings の `FUNCTIONS_APP_AUDIENCE` / `MCP_APP_AUDIENCE` / `BOT_APP_ID` を更新。

⚠️ 残課題: `setup-app-roles.sh` の末尾 `az ad app permission admin-consent` は AAD Graph 経由で
失敗する。将来スクリプトを直すなら oauth2PermissionGrants への直接 POST に置き換えるべき。

---

## 6. リポジトリ側の状態

- ブランチ `main`。最新コミット `3ae17f9`（Node 24 整合）。手前に `42dd796`（Step 2 完了 docs）。
- ローカルで未プッシュのコミットあり（`42dd796` / `3ae17f9`）→ 次セッションで `git push` する。
- ビルド・typecheck・テストは全 green（functions 19 / mcp-server 3）。デプロイ可能な状態。
- `.env` はユーザーが作成済み。⚠️ `.env` の `AZURE_TENANT_ID` は旧テナント値の可能性 →
  MAMETA `3894eada-...` に直す必要あり（私は `.env` を読めないため未確認・ユーザー要確認）。
  ※ seed 実行時は `.env` に依存せず環境変数を直接渡したので影響なし。

---

## 7. 残作業

`docs/12-deployment-guide.md` の該当 Step を参照。

| Step | 内容 | 状態 |
|---|---|---|
| 3 | Cosmos seed 投入 | ✅ 完了（tenants 1 / accounts 1 / orders 49）|
| 4 | JPYC 送金疎通（Amoy testnet） | ✅ 完了（100 JPYC 送金成功・§0 に確定値）|
| 5 | Copilot Studio Bot（M365 必要） | ⏳ ユーザー必須（ブラウザUI）|
| 6 | Fabric / Power BI（M365 必要） | ⏳ ユーザー必須（ブラウザUI）|
| 7 | GitHub demo repo + Webhook + Functions デプロイ | ✅ 完了（Container Apps デプロイは未）|
| 8 | E2E リハーサル → Workbook デプロイ → 動画 → Zenn → 提出（6/1締切）| ⏳ ユーザー主体 |

⚠️ Step 7 のうち **Container Apps（Dashboard / MCP サーバ）のデプロイは未実施**。
`deploy-containers.yml` があるが、GHCR ビルド + Container Apps 更新は別途実行が必要。

### 重要な期日

- M365 試用版: 2026-05-19 登録、**6/19 に自動課金開始**。ピッチ 6/18 → 6/18〜19 に解約必須。
- ハッカソン提出: **2026-06-01 23:59**。審査 6/2〜6/18。

---

## 8. 既知のハマりどポイント（再発防止メモ）

- `az` 拡張インストールが `pyexpat` シンボルエラーで失敗 → `brew reinstall --build-from-source python@3.13` で解決済み。
- `for ... do ... done` を改行付きで貼ると zsh が parse error → 1行 `;` 区切りで渡す。
- `[system]` は zsh がグロブ展開 → `'[system]'` とクォートする。
- サブスクリプション移管: 「ディレクトリの切り替え（表示）」と「ディレクトリの変更（移管）」は別物。
  移管は「譲渡の続行」ボタンまで押し切る必要がある。移管先テナントにゲスト登録＋承諾が前提。
- 新規サブスクは OpenAI quota が 0 のことがある → `az cognitiveservices usage list --location <loc>` で枠探し。
- `az ad app permission admin-consent` は旧 AAD Graph を叩くため、テナントによって
  「organization has not subscribed to a service」で失敗する。
  → Microsoft Graph の `oauth2PermissionGrants` に `consentType=AllPrincipals` で
  `az rest --method POST` すれば回避できる（clientId=consumer の SP, resourceId=resource の SP, scope=スペース区切り）。
- `az ad` の Graph 呼び出しは稀に `Network is unreachable` で瞬断する。リトライで通る。
- **サブスクリプション移管後、Key Vault の `tenantId` プロパティは自動追従しない。**
  旧テナントのままだと全 secret アクセスが `AKV10032: Invalid issuer` で失敗する。
  `az keyvault update --set properties.tenantId=<新テナント>` で修正。
  （Cosmos/Storage/Function App は tenantId プロパティを持たないので影響なし。Key Vault 固有）
- `tsx -e '...'`（inline）は CJS 評価で top-level await が使えない。一時 `.ts` ファイルにして実行する。

---

## 9. Step 4 完了記録（JPYC 送金疎通）

✅ **完了済み**。確定値は §0 を参照。以下は実施した手順の記録。

**ネットワーク方針: Polygon Amoy testnet**（ユーザー判断で確定。JPYC は Amoy 上にも同じ
コントラクトアドレス `0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB` で存在し、挙動は mainnet と同一）。

Function App 側は設定済み: `POLYGON_RPC=https://rpc-amoy.polygon.technology`、
`POLYGON_CHAIN_ID=80002`、`JPYC_ADDRESS` は変更なし。コードも `POLYGON_CHAIN_ID` で
mainnet/testnet を切替（コミット `307838d`）。

ユーザー（吉川さん）が実施する必要がある。完了したら私に伝えれば送金疎通を実行する。

### 9-1. デモ専用ウォレットの秘密鍵を生成（秘密鍵をチャットに貼らないこと）

セッションのプロンプトで `! ` プレフィックス付きで実行（出力は本人の画面にのみ表示）:

```
! cd ~/dev/hackson/agentic-gig-flow/packages/functions && node -e "const {generatePrivateKey,privateKeyToAddress}=require('viem/accounts'); const pk=generatePrivateKey(); console.log('ADDRESS:',privateKeyToAddress(pk)); require('fs').writeFileSync('/tmp/demo-wallet-pk.txt',pk); console.log('key written to /tmp/demo-wallet-pk.txt');"
```

⚠️ 以前チャットに貼られた鍵（アドレス `0x5fA77C457A1afa353D495991dB548BCC2F60057c`）は
ログに残ったため使わない。新しい鍵を生成すること。

### 9-2. Key Vault に秘密鍵を保存（ファイル経由、画面に出さない）

```
! az keyvault secret set --vault-name kv-gigflow-28fa80 --name wallet-pk --file /tmp/demo-wallet-pk.txt --output none && echo saved
! rm -P /tmp/demo-wallet-pk.txt 2>/dev/null || rm /tmp/demo-wallet-pk.txt; echo "temp key removed"
```

（Key Vault の tenantId は修正済みなので MAMETA アカウントで通る。）

### 9-3. ウォレットに入金（Polygon Amoy testnet）

- POL/MATIC（ガス代）: Amoy faucet から無料取得（https://faucet.polygon.technology/ で Amoy 選択）
- JPYC（送金原資）: Amoy 上の JPYC を入手してデモウォレットへ。最低 1,000 JPYC 程度で足りる
- Amoy Polygonscan で残高確認: `https://amoy.polygonscan.com/address/<ADDRESS>`

### 9-4. 送金疎通（私が実行可）

ユーザーが 9-1〜9-3 を完了したら、私が `scripts/test-transfer.ts` を
`POLYGON_RPC` / `POLYGON_CHAIN_ID=80002` 環境変数付きで実行し、100 JPYC 送金を確認する。
受取先アドレス（テスト送金先）をユーザーから受け取る必要がある。

---

## 10. Step 7 の実行プラン（GitHub + Functions デプロイ）

コード側は準備完了（ビルド・テスト green）。デプロイ手段は2つ:

### 推奨: GitHub Actions（OIDC）

`infra/entra/setup-github-oidc.sh` を実行すると federated credential + repo secret が設定され、
`packages/functions/**` への push で `deploy-functions.yml` が自動デプロイする。
→ `gh` CLI のログイン（ブラウザ）が必要。GitHub の Settings > Environments に `production` 作成も必要。

### フォールバック: ローカルから手動デプロイ

`func azure functionapp publish func-gigflow-28fa80 --no-build --javascript` を使う。
Core Tools v4.10.0 インストール済み。

**実際に採った経路**: `func` のローカル publish で成功。詳細は §11。

---

## 11. Step 7 デプロイの顛末（Node 24 問題 + Function App 再作成）

Step 7 デプロイは長い切り分けを経た。次セッションのために記録する。

### 症状

`Azure/functions-action`（GitHub Actions）も `func publish`（ローカル）も、パッケージの
アップロードは成功するが **`Sync Triggers (BadRequest)`** で失敗。Function App ホストは全
エンドポイント 503、`listkeys` も失敗。

### 根本原因

ARM の `syncfunctiontriggers` を直接叩くと真のエラーが見えた:
`"Encountered an error (ServiceUnavailable) from host runtime."`
→ Sync Trigger 自体ではなく **Functions ホストランタイムが起動していない**のが原因。

新規 RG にテスト Function App を立てて切り分けた結果:
- **`Node|24` × Linux Consumption × japaneast ではホストが起動しない**（`ServiceUnavailable`）。
- `Node|20` / `Node|22` に切り替えるとホストが起動し、`listkeys` も成功する。
- `az functionapp list-runtimes` は「Node 24 / v4 対応」と返すが、japaneast の Linux
  Consumption インフラに Node 24 ワーカーが実展開されていない。CLI のバリデーションと
  実行時サポートに矛盾がある（Azure 側の問題）。

§3 決定1 の「Azure が Node 20 を作成時に拒否した」のは事実だが、その代替の Node 24 が
起動しないという二重の罠だった。**Node 22 が唯一の現実解**（20 は EOL 警告、24 は起動不能）。

### 採った対応

1. 壊れた Function App + Consumption プランを削除し、`az functionapp create` で再作成。
2. ランタイムを `az functionapp config set --linux-fx-version "Node|22"` に変更 → ホスト起動確認。
3. `func azure functionapp publish func-gigflow-28fa80 --no-build --javascript` でデプロイ成功。
   デプロイパッケージは GitHub Actions の「Assemble deploy package」と同じ手順をローカルで
   再現（`dist` + `host.json` + `package.json` + `node_modules` に `@gigflow/shared` を vendor）。
4. 再作成で Managed Identity が消えたため `az functionapp identity assign` で再有効化し、
   3ロール（KV Secrets User / OpenAI User / Cosmos Data Contributor）を新 principalId に再付与。

### コード整合（対応済み）

- ✅ CLAUDE.md・`.github/workflows/ci.yml`・`deploy-functions.yml` の Node 表記を **22** に修正済み。
- ⚠️ `deploy-functions.yml`（`Azure/functions-action`）はこの環境では Sync Trigger 問題で
  使えない可能性が高い。次に Functions を更新するときも **`func publish` 経路を使うのが安全**。
- デプロイパッケージ組み立て手順は `/tmp/deploy-test` に再現済み（再ビルド時は作り直す）。
  手順: `dist` + `host.json` + `package.json` をコピー → `npm pkg delete dependencies.@gigflow/shared`
  → `npm install --omit=dev --no-package-lock --ignore-scripts` → `node_modules/@gigflow/shared` に
  `packages/shared/dist` と `package.json` を vendor → `func azure functionapp publish ... --no-build --javascript`。

### 後片付け TODO

- テスト用リソース `rg-gigflow-test`（Function App `func-gigflow-test-28fa80` + ストレージ
  `stgigflowtest28fa80` + App Insights）は切り分け用。**不要なので RG ごと削除してよい**:
  `az group delete --name rg-gigflow-test --yes --no-wait`
