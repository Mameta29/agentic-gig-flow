# 12. デプロイメント・ガイド (本人作業の完全手順)

このドキュメントはコード実装が完了した状態 (= GitHub にプッシュ済み) から、**実環境を立ち上げてハッカソン提出するまでの全手順**をコピペで実行できる粒度で記録する。

## 全体タイムライン

| Step | 所要 | 待ち時間 |
|---|---|---|
| 1. `.env` 設定 | 15分 | – |
| 2. Azure 構築 | 90分 | OpenAI モデルデプロイ承認 (即日〜数日) |
| 3. Cosmos seed | 5分 | – |
| 4. JPYC 送金疎通 | 30分 | – |
| 5. Copilot Studio Bot | 90分 | Teams 管理者承認 |
| 6. Fabric / Power BI | 120分 | Mirror 同期 (~10分) |
| 7. GitHub demo repo + Webhook + Functions デプロイ | 30分 | – |
| 8. E2E 〜提出 | 多日 | 動画撮影 / 記事執筆 |

---

## Step 1: `.env` 設定 (15分)

### 1-1. ファイルをコピー

```bash
cd ~/dev/hackson/agentic-gig-flow
cp .env.example .env
```

### 1-2. Azure サブスクリプションIDとテナントIDを取得

```bash
# Azure CLI が無ければ先にインストール
brew install azure-cli   # macOS
# または公式: https://learn.microsoft.com/cli/azure/install-azure-cli

az login   # ブラウザで Microsoft アカウントログイン
az account list --output table
az account show --query "{subscriptionId:id, tenantId:tenantId}" -o table
```

出力された `subscriptionId` を `.env` の `AZURE_SUBSCRIPTION_ID` に、`tenantId` を `AZURE_TENANT_ID` にセット。

### 1-3. 残りはこの時点では空欄でOK

`.env` の他の値 (`COSMOS_ENDPOINT` 等) は **Step 2 で Azure リソースを作成した時に出力される値で埋める**ので、いったん空欄のまま。

---

## Step 2: Azure 環境構築 (90分 + モデル承認待ち)

### 2-1. 前提

- **Azure サブスクリプション**: 個人サブスクで OK。クレジットカード登録済みのものを使用 (https://portal.azure.com)
- **Azure OpenAI のアクセス申請**: 既に完了している前提。**まだなら今すぐ申請** → https://aka.ms/oai/access (個人で取れない可能性あり、その場合は会社アカウントで)
- **GitHub アカウント**: 既存 (`Mameta29`)
- **Microsoft 365 アカウント**: Teams で Copilot Studio を動かすため必要 (Microsoft 365 開発者プログラム https://developer.microsoft.com/microsoft-365/dev-program で無料テナント発行可)

### 2-2. Azure CLI でリソース作成

`docs/04-azure-setup.md` の §0 〜 §12 を順に実行。コピペ用にまとめると:

```bash
# === §0: 共通変数 ===
export RG=rg-gigflow-prod
export LOCATION=japaneast
export PREFIX=gigflow
export SUFFIX=$(openssl rand -hex 3)
echo "PREFIX=${PREFIX} SUFFIX=${SUFFIX}"
# 出力された SUFFIX をメモ ← 以後このセッションでだけ有効

# === §1: Resource Group ===
az group create --name $RG --location $LOCATION

# === §2: Cosmos DB ===
COSMOS_NAME=cosmos-${PREFIX}-${SUFFIX}
az cosmosdb create \
  --name $COSMOS_NAME --resource-group $RG \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --default-consistency-level Session

az cosmosdb sql database create \
  --account-name $COSMOS_NAME --resource-group $RG --name gigflow

for c in "orders /companyId" "events /orderId" "accounts /id" "tenants /id"; do
  set -- $c
  az cosmosdb sql container create \
    --account-name $COSMOS_NAME --resource-group $RG \
    --database-name gigflow --name $1 --partition-key-path "$2"
done

COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query documentEndpoint -o tsv)
echo "COSMOS_ENDPOINT=$COSMOS_ENDPOINT"

# === §3: Key Vault ===
KV_NAME=kv-${PREFIX}-${SUFFIX}
az keyvault create \
  --name $KV_NAME --resource-group $RG --location $LOCATION \
  --enable-rbac-authorization true --retention-days 7

USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee $USER_OBJECT_ID \
  --scope $(az keyvault show --name $KV_NAME --query id -o tsv)

sleep 30   # RBAC 反映待ち

# Webhook secret を生成して保存
WEBHOOK_SECRET=$(openssl rand -hex 32)
az keyvault secret set --vault-name $KV_NAME --name github-webhook-secret --value "$WEBHOOK_SECRET"
echo "WEBHOOK_SECRET (GitHub Webhook 設定で使う): $WEBHOOK_SECRET"
# ↑ メモする。Step 7 で使う

# === §4: Storage Account ===
STORAGE_NAME=st${PREFIX}${SUFFIX}
az storage account create \
  --name $STORAGE_NAME --resource-group $RG \
  --location $LOCATION --sku Standard_LRS

# === §5: Function App ===
FUNC_NAME=func-${PREFIX}-${SUFFIX}
az functionapp create \
  --name $FUNC_NAME --resource-group $RG \
  --storage-account $STORAGE_NAME \
  --consumption-plan-location $LOCATION \
  --runtime node --runtime-version 20 \
  --functions-version 4 --os-type Linux \
  --assign-identity '[system]'

FUNC_PRINCIPAL_ID=$(az functionapp identity show --name $FUNC_NAME --resource-group $RG --query principalId -o tsv)

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $FUNC_PRINCIPAL_ID \
  --scope $(az keyvault show --name $KV_NAME --query id -o tsv)

az cosmosdb sql role assignment create \
  --account-name $COSMOS_NAME --resource-group $RG \
  --scope $(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query id -o tsv) \
  --principal-id $FUNC_PRINCIPAL_ID \
  --role-definition-id 00000000-0000-0000-0000-000000000002

# === §6: Application Insights ===
LAW_NAME=log-${PREFIX}-${SUFFIX}
APPI_NAME=ai-${PREFIX}-${SUFFIX}

az monitor log-analytics workspace create \
  --resource-group $RG --workspace-name $LAW_NAME --location $LOCATION

LAW_ID=$(az monitor log-analytics workspace show --resource-group $RG --workspace-name $LAW_NAME --query id -o tsv)

az monitor app-insights component create \
  --app $APPI_NAME --location $LOCATION --resource-group $RG --workspace $LAW_ID

APPI_CONNSTR=$(az monitor app-insights component show --app $APPI_NAME --resource-group $RG --query connectionString -o tsv)

az functionapp config appsettings set \
  --name $FUNC_NAME --resource-group $RG \
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING="$APPI_CONNSTR"

# === §7: Azure OpenAI ===
AOAI_NAME=aoai-${PREFIX}-${SUFFIX}
az cognitiveservices account create \
  --name $AOAI_NAME --resource-group $RG --location $LOCATION \
  --kind OpenAI --sku S0 --custom-domain $AOAI_NAME

# gpt-4o デプロイ (この時点で承認待ちになる場合あり)
az cognitiveservices account deployment create \
  --resource-group $RG --name $AOAI_NAME \
  --deployment-name gpt-4o --model-name gpt-4o \
  --model-version 2024-11-20 --model-format OpenAI \
  --sku-name "GlobalStandard" --sku-capacity 50

az role assignment create \
  --role "Cognitive Services OpenAI User" \
  --assignee $FUNC_PRINCIPAL_ID \
  --scope $(az cognitiveservices account show --name $AOAI_NAME --resource-group $RG --query id -o tsv)

AOAI_ENDPOINT=$(az cognitiveservices account show --name $AOAI_NAME --resource-group $RG --query properties.endpoint -o tsv)

az functionapp config appsettings set \
  --name $FUNC_NAME --resource-group $RG \
  --settings \
    AZURE_OPENAI_ENDPOINT="$AOAI_ENDPOINT" \
    AZURE_OPENAI_DEPLOYMENT="gpt-4o" \
    AZURE_OPENAI_API_VERSION="2024-10-21" \
    COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_DATABASE="gigflow" \
    KEY_VAULT_NAME="$KV_NAME" \
    POLYGON_RPC="https://polygon-rpc.com" \
    JPYC_ADDRESS="0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB"

# === §8: Container Apps Environment ===
CAE_NAME=cae-${PREFIX}-${SUFFIX}
az containerapp env create \
  --name $CAE_NAME --resource-group $RG --location $LOCATION \
  --logs-workspace-id $(az monitor log-analytics workspace show --resource-group $RG --workspace-name $LAW_NAME --query customerId -o tsv) \
  --logs-workspace-key $(az monitor log-analytics workspace get-shared-keys --resource-group $RG --workspace-name $LAW_NAME --query primarySharedKey -o tsv)

# Dashboard / MCP の Container App 作成は Docker image を push してから行う (Step 2-5 で再開)
```

### 2-3. Entra ID App Registrations

```bash
# === §11: Entra App Registrations ===
FUNCTIONS_APP_ID=$(az ad app create \
  --display-name "app-gigflow-functions" \
  --sign-in-audience AzureADMultipleOrgs \
  --identifier-uris "api://gigflow-functions" \
  --query appId -o tsv)
echo "FUNCTIONS_APP_ID=$FUNCTIONS_APP_ID"

MCP_APP_ID=$(az ad app create \
  --display-name "app-gigflow-mcp" \
  --sign-in-audience AzureADMultipleOrgs \
  --identifier-uris "api://gigflow-mcp" \
  --query appId -o tsv)
echo "MCP_APP_ID=$MCP_APP_ID"

DASHBOARD_APP_ID=$(az ad app create \
  --display-name "app-gigflow-dashboard" \
  --sign-in-audience AzureADMultipleOrgs \
  --web-redirect-uris "http://localhost:3000/api/auth/callback/microsoft-entra-id" \
  --query appId -o tsv)
echo "DASHBOARD_APP_ID=$DASHBOARD_APP_ID"

DASHBOARD_CLIENT_SECRET=$(az ad app credential reset \
  --id $DASHBOARD_APP_ID --display-name "default" \
  --years 1 --query password -o tsv)
az keyvault secret set --vault-name $KV_NAME --name dashboard-client-secret --value "$DASHBOARD_CLIENT_SECRET"

BOT_APP_ID=$(az ad app create \
  --display-name "app-gigflow-copilot" \
  --sign-in-audience AzureADMultipleOrgs \
  --query appId -o tsv)
echo "BOT_APP_ID=$BOT_APP_ID"

BOT_CLIENT_SECRET=$(az ad app credential reset \
  --id $BOT_APP_ID --display-name "default" \
  --years 1 --query password -o tsv)
az keyvault secret set --vault-name $KV_NAME --name bot-client-secret --value "$BOT_CLIENT_SECRET"

az bot create \
  --resource-group $RG \
  --name bot-gigflow-${SUFFIX} \
  --app-type MultiTenant \
  --appid $BOT_APP_ID \
  --location global --sku F0

FABRIC_APP_ID=$(az ad app create \
  --display-name "app-gigflow-fabric" \
  --sign-in-audience AzureADMultipleOrgs \
  --identifier-uris "api://gigflow-fabric" \
  --query appId -o tsv)
echo "FABRIC_APP_ID=$FABRIC_APP_ID"
```

### 2-4. App roles / 公開スコープ / API permissions の構築 (スクリプト)

App Roles・公開スコープ・API permissions・ロール割当を **`infra/entra/setup-app-roles.sh` が一括で構築する**。GUI 操作は不要。

```bash
cd ~/dev/hackson/agentic-gig-flow
./infra/entra/setup-app-roles.sh
```

このスクリプトが冪等に行うこと:

- `app-gigflow-functions` / `app-gigflow-mcp` に App Roles **PM / Accountant / Executive** を作成
- `app-gigflow-functions` に `orders.read` / `orders.write`、`app-gigflow-mcp` に `mcp.read`、`app-gigflow-fabric` に `data.read` を公開スコープとして作成
- Dashboard → Functions/MCP、Bot → Functions/MCP/Fabric の API permissions を付与し、管理者同意を実行
- デモ用に自分自身へ全ロール (Functions: PM+Accountant+Executive / MCP: Accountant+Executive) を割当

App ID は displayName から自動解決する。明示したい場合は `FUNCTIONS_APP_ID` 等の環境変数で渡す。
管理者同意が権限不足で失敗した場合は Entra Portal で手動同意すること (スクリプトは警告のみで継続)。

> これにより旧 Step 2-6 (API permissions の Portal 操作) も不要になった。

### 2-5. Dashboard と MCP の Container App デプロイ

GitHub Container Registry (GHCR) に Docker image を push する。

#### 2-5-1. GHCR トークン作成

1. https://github.com/settings/tokens (classic) → Generate new token (classic)
2. Note: `gigflow-ghcr`
3. Expiration: `90 days`
4. Scopes: `write:packages`, `read:packages`, `delete:packages`
5. Generate → トークン (`ghp_...`) をコピー

#### 2-5-2. Docker image をビルド & push

```bash
# ローカルで pnpm install / build を一度通しておく
pnpm install
pnpm -r build

# GHCR にログイン
export GITHUB_USER=Mameta29
export GHCR_TOKEN=<上で生成したトークン>
echo $GHCR_TOKEN | docker login ghcr.io -u $GITHUB_USER --password-stdin

# Dashboard image
docker build -f packages/dashboard/Dockerfile -t ghcr.io/$GITHUB_USER/gigflow-dashboard:latest .
docker push ghcr.io/$GITHUB_USER/gigflow-dashboard:latest

# MCP image
docker build -f packages/mcp-server/Dockerfile -t ghcr.io/$GITHUB_USER/gigflow-mcp:latest .
docker push ghcr.io/$GITHUB_USER/gigflow-mcp:latest

# image を public に変更 (任意。private のままなら Container Apps に registry 認証情報を渡す必要あり)
# https://github.com/users/Mameta29/packages/container/gigflow-dashboard/settings → Change visibility → Public
# 同じく gigflow-mcp も public 化
```

#### 2-5-3. MCP を先にデプロイ → URL を取得

```bash
az containerapp create \
  --name ca-gigflow-mcp \
  --resource-group $RG \
  --environment $CAE_NAME \
  --image ghcr.io/$GITHUB_USER/gigflow-mcp:latest \
  --target-port 3333 --ingress external \
  --system-assigned \
  --min-replicas 1 --max-replicas 3 \
  --env-vars \
    COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_DATABASE="gigflow" \
    MCP_APP_AUDIENCE="api://gigflow-mcp"

MCP_PRINCIPAL_ID=$(az containerapp identity show --name ca-gigflow-mcp --resource-group $RG --query principalId -o tsv)
az cosmosdb sql role assignment create \
  --account-name $COSMOS_NAME --resource-group $RG \
  --scope $(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query id -o tsv) \
  --principal-id $MCP_PRINCIPAL_ID \
  --role-definition-id 00000000-0000-0000-0000-000000000001

MCP_URL=$(az containerapp show --name ca-gigflow-mcp --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
echo "MCP URL: https://$MCP_URL/mcp"

curl https://$MCP_URL/healthz   # → "ok" が返れば疎通成功
```

#### 2-5-4. Dashboard をデプロイ

```bash
az containerapp create \
  --name ca-gigflow-dashboard \
  --resource-group $RG \
  --environment $CAE_NAME \
  --image ghcr.io/$GITHUB_USER/gigflow-dashboard:latest \
  --target-port 3000 --ingress external \
  --system-assigned \
  --min-replicas 1 --max-replicas 3 \
  --secrets \
    auth-entra-secret="$DASHBOARD_CLIENT_SECRET" \
    auth-secret="$(openssl rand -base64 32)" \
  --env-vars \
    AUTH_ENTRA_CLIENT_ID="$DASHBOARD_APP_ID" \
    AUTH_ENTRA_CLIENT_SECRET=secretref:auth-entra-secret \
    AUTH_SECRET=secretref:auth-secret \
    FUNCTIONS_BASE_URL="https://${FUNC_NAME}.azurewebsites.net" \
    MCP_BASE_URL="https://${MCP_URL}" \
    FUNCTIONS_APP_ID="gigflow-functions" \
    MCP_APP_ID="gigflow-mcp"

DASHBOARD_URL=$(az containerapp show --name ca-gigflow-dashboard --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
echo "Dashboard URL: https://$DASHBOARD_URL"

# Dashboard の redirect URI を実 URL に更新
az ad app update --id $DASHBOARD_APP_ID --web-redirect-uris \
  "https://$DASHBOARD_URL/api/auth/callback/microsoft-entra-id" \
  "http://localhost:3000/api/auth/callback/microsoft-entra-id"
```

### 2-6. API permissions の付与

**Step 2-4 の `setup-app-roles.sh` で構築済み** (Dashboard → Functions/MCP、Bot → Functions/MCP/Fabric)。
Entra Portal の App registrations で各アプリの「API のアクセス許可」が緑チェックになっているか確認するだけでよい。
管理者同意が `setup-app-roles.sh` 実行時に権限不足で失敗していた場合のみ、Portal で「管理者の同意を与える」を押す。

### 2-7. `.env` を埋める

ここまでで取得した値を `.env` に書き込む:

```bash
cat <<EOF >> .env
COSMOS_ENDPOINT=$COSMOS_ENDPOINT
KEY_VAULT_NAME=$KV_NAME
AZURE_OPENAI_ENDPOINT=$AOAI_ENDPOINT
DASHBOARD_APP_ID=$DASHBOARD_APP_ID
FUNCTIONS_APP_ID=$FUNCTIONS_APP_ID
MCP_APP_ID=$MCP_APP_ID
BOT_APP_ID=$BOT_APP_ID
DASHBOARD_URL=https://$DASHBOARD_URL
MCP_URL=https://$MCP_URL
APPLICATIONINSIGHTS_CONNECTION_STRING=$APPI_CONNSTR
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_ENTRA_CLIENT_ID=$DASHBOARD_APP_ID
AUTH_ENTRA_CLIENT_SECRET=$DASHBOARD_CLIENT_SECRET
EOF
```

---

## Step 3: Cosmos seed (5分)

ローカルから Cosmos に初期データを投入する。

```bash
cd ~/dev/hackson/agentic-gig-flow

# 自分自身に Cosmos の Data Contributor 権限を付与 (ローカルから書き込めるように)
USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
az cosmosdb sql role assignment create \
  --account-name $COSMOS_NAME --resource-group $RG \
  --scope $(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query id -o tsv) \
  --principal-id $USER_OBJECT_ID \
  --role-definition-id 00000000-0000-0000-0000-000000000002

# 反映待ち
sleep 30

# 環境変数を読み込む (`.env` を export)
set -a; source .env; set +a

# seed 実行
pnpm --filter @gigflow/functions exec tsx scripts/seed-cosmos.ts
# → 出力例: { tenantId: 'demo-tenant-0001', orderId: 'xxxx-xxxx-...', workerId: 'demo-tenant-0001:sato-taro' }

# (任意) Power BI 用のダミーデータも投入
SEED_TENANT_ID=demo-tenant-0001 \
  pnpm --filter @gigflow/functions exec tsx scripts/seed-fabric-demo.ts
```

#### 確認

Azure Portal で Cosmos DB → データ エクスプローラー → gigflow → tenants / orders / accounts に1件ずつあることを確認。

---

## Step 4: JPYC 送金疎通 (30分)

### 4-1. 法人ウォレットの秘密鍵を生成 & Key Vault に保存

```bash
# 新規 EOA を viem で作成
node -e "
const { generatePrivateKey, privateKeyToAddress } = require('viem/accounts');
const pk = generatePrivateKey();
console.log('PRIVATE_KEY:', pk);
console.log('ADDRESS:', privateKeyToAddress(pk));
"
```

出力された `PRIVATE_KEY` (0x で始まる64文字) と `ADDRESS` をメモ。

```bash
# Key Vault に格納
az keyvault secret set --vault-name $KV_NAME --name wallet-pk --value "<上のPRIVATE_KEY>"

# Function App の Managed Identity が Key Vault Secrets User 権限を持っていることを確認
# (§5 で既に付与済み)
```

### 4-2. ウォレットに MATIC を入れる (送金ガス代)

オプション A: 自分の既存 Polygon ウォレット (MetaMask 等) から送金
オプション B: CEX (Binance, Bitbank 等) から MATIC を直接送金

最低 **0.5 MATIC** (約 100円) あれば数十回は送金できる。

### 4-3. ウォレットに JPYC を入れる

JPYC を購入: https://www.jpyc.jp/ (公式) または DEX で USDC ↔ JPYC スワップ。

最低 **10,000 JPYC (10,000円)** をデモ用ウォレットに送金。

**Polygonscan で残高確認**:
```
https://polygonscan.com/token/0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB?a=<上のADDRESS>
```

### 4-4. ローカルから送金疎通

```bash
# 自分自身に Key Vault Secrets User 権限を付与
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $USER_OBJECT_ID \
  --scope $(az keyvault show --name $KV_NAME --query id -o tsv)

sleep 30

# 自分の MetaMask アドレスなど受取先を用意して 100 JPYC 送金
pnpm --filter @gigflow/functions exec tsx scripts/test-transfer.ts \
  0xRECIPIENT_ADDRESS 100

# → txHash が出力される。Polygonscan で確認:
# https://polygonscan.com/tx/<txHash>
```

成功すれば Settlement の生命線である `viem.transferJpyc()` が動いている。

---

## Step 5: Copilot Studio Bot 構築 (90分)

### 5-1. Copilot Studio にアクセス

https://copilotstudio.microsoft.com/

ログインに使う Microsoft アカウントは **Step 2-1** で確保した M365 開発者プログラムのテナント、または会社のテナント。**個人 Outlook アカウントでは使えない** ので注意。

### 5-2. Agent (gigflow) を作成

1. **新規エージェント** → **空白から作成**
2. 名前: `gigflow`
3. 説明:
   ```
   業務委託の発注・状態確認・経理問合せを自動化するエージェント
   ```
4. インストラクション (`infra/copilot-studio/agent.yaml` の `instructions` 部分をコピペ):
   ```
   あなたは「gigflow」エージェント。中小企業の PM が業務委託発注を依頼してきたら、
   発注内容を構造化し、Adaptive Card で確認を取り、承認されたら gigflow Functions API
   に発注を送信する。発注状況や経理レポートの問合せにも応える。
   税務判断や送金可否の最終判断は必ずユーザーに確認する。
   ```

### 5-3. 認証設定

1. 設定 → セキュリティ → 認証
2. 認証方式: **手動**
3. **Microsoft Entra ID v2** を選択
4. 入力:
   - **クライアント ID**: `$BOT_APP_ID` (Step 2-3 で取得)
   - **クライアント シークレット**: Key Vault に保存した bot secret を引っぱり出す:
     ```bash
     az keyvault secret show --vault-name $KV_NAME --name bot-client-secret --query value -o tsv
     ```
   - **Authorization URL**: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
   - **Token URL**: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
   - **Scopes (スペース区切り)**:
     ```
     api://gigflow-functions/orders.write api://gigflow-mcp/mcp.read api://gigflow-fabric/data.read offline_access
     ```
   - **Token exchange URL**: 空欄

### 5-4. Topic: `OrderCreate` を作成

1. **トピック** → **新規** → **空白**
2. 名前: `OrderCreate`
3. **トリガー (フレーズ)**:
   - `@gigflow 発注`
   - `@gigflow さんに依頼`
   - `@gigflow お願い`
4. **エンティティ抽出 / 変数** (生成 AI が rawDescription から抽出):
   - `workerName` (string)
   - `workDescription` (string)
   - `amountJpyc` (number)
   - `deadline` (string、自然言語日付)
5. **メッセージステップ**: 「発注内容を確認させてください。」
6. **Adaptive Card ステップ**: `infra/copilot-studio/cards/order-confirmation.json` の内容をそのままコピペ → ノードに貼る (Copilot Studio は AdaptiveCard 1.5 をサポート)
   - 「ユーザーの応答を待つ」を ON にし、`cardResult` 変数に保存
7. **条件**: `cardResult.action == "approve"`
8. **HTTP request action** (条件 true 時):
   - URL: `https://<FUNC_NAME>.azurewebsites.net/api/copilot/webhook` (`.env` の `FUNCTIONS_BASE_URL`)
   - Method: POST
   - Headers:
     - `Authorization: Bearer ${user.accessToken}` (Topic context のトークン)
     - `Content-Type: application/json`
   - Body:
     ```json
     {
       "rawDescription": "${workerName} さんに「${workDescription}」を依頼。報酬 ${amountJpyc} JPYC、期日 ${deadline}。",
       "today": "${utcNow().slice(0,10)}"
     }
     ```
   - レスポンスを変数 `response` に保存
9. **Adaptive Card ステップ** (発注完了): `infra/copilot-studio/cards/order-completed.json` をコピペ
   - `${issueNumber}` → `${response.body.issueNumber}` 等に bind

### 5-5. Topic: `OrderStatus` を作成

`infra/copilot-studio/topics/order-status.yaml` を参考に同様の手順で構築。

### 5-6. Topic: `MonthlyReport` を作成

Step 6 (Fabric) で Data Agent を作ってから戻ってきて作成しても OK。

### 5-7. Teams にデプロイ

1. **チャネル** → **Microsoft Teams** を有効化
2. **公開** → アプリ ID とマニフェストが生成される
3. **Teams 管理センター** (https://admin.teams.microsoft.com) にアクセス (テナント管理者権限が必要)
4. アプリ → カスタムアプリの管理 → アップロード
5. Teams クライアントを開く → アプリ → `gigflow` を検索 → 追加

### 5-8. テスト

Teams で gigflow と会話:

```
@gigflow Sato さんに「ログイン機能の実装」を依頼。報酬5万JPYC、期日2週間。
```

Adaptive Card が出れば成功。承認すると Functions が叩かれ、GitHub Issue が作成される (Step 7 の demo repo を先に作っておく必要あり、または後述の seed データに対するテストで OK)。

---

## Step 6: Fabric / Power BI 構築 (120分)

### 6-1. Fabric Trial Capacity を有効化

1. https://app.fabric.microsoft.com/ にサインイン (Step 5 と同じ M365 アカウント)
2. 右上のプロフィール → **Microsoft Fabric の試用版を開始する** (60日無料)
3. 同意して有効化

### 6-2. ワークスペース作成

1. 左ペイン → **ワークスペース** → **新しいワークスペース**
2. 名前: `ws-gigflow`
3. 高度な設定 → ライセンス モード: **試用版**
4. 適用

### 6-3. Cosmos Mirror をセットアップ

1. ワークスペース `ws-gigflow` 内 → **+ 新規** → **Mirrored Azure Cosmos DB**
2. 接続情報:
   - サーバー: `cosmos-${PREFIX}-${SUFFIX}.documents.azure.com`
   - データベース: `gigflow`
   - 認証: 推奨は Managed Identity だが、初回はアカウントキーで OK
     ```bash
     # アカウントキーを取得 (一時的にデモ目的で使用)
     az cosmosdb keys list --name $COSMOS_NAME --resource-group $RG --query primaryMasterKey -o tsv
     ```
3. ミラー対象: `orders` / `events` / `tenants` をチェック (`accounts` は外す)
4. **同期開始** → 数分〜10分待つと初回ロードが完了

### 6-4. Semantic Model を構築

1. ミラー DB を開く → 上部の **新しい意味モデル** ボタン
2. テーブル `orders` を含めるをチェック → 作成
3. 作成された意味モデル `sm-gigflow` を開く
4. **モデル ビュー** で `infra/fabric/data-agent.yaml` の `measures:` セクションをそれぞれ DAX measure として追加:
   - `TotalPayments = SUM(orders[amountJpyc])`
   - `SettledPayments = CALCULATE([TotalPayments], orders[status] = "settled" || orders[status] = "bookkept")`
   - `AvgLeadTimeHours = AVERAGEX(orders, DATEDIFF(orders[createdAt], orders[settledAt], HOUR))`
   - `WithholdingTotal = CALCULATE([TotalPayments], orders[bookkeepingArtifacts.withholding.applies] = TRUE)`
5. Calculated column を追加:
   - `YearMonth = FORMAT(orders[createdAt], "yyyy-MM")`

### 6-5. Data Agent を作成

1. ワークスペース → **+ 新規** → **Data Agent** (プレビュー)
2. 名前: `da-gigflow`
3. **データ ソース** → 意味モデル `sm-gigflow` を選択
4. **AI の指示** に `infra/fabric/data-agent.yaml` の `description:` 部分をコピペ:
   ```
   The "orders" table contains business outsourcing contracts.
   Each row is a single contract from a Japanese SME (companyId) to a freelance worker.
   Amounts are in JPYC (Japanese Yen Coin), an integer where 1 JPYC = 1 JPY.
   "status" lifecycle: created → in_progress → pr_opened → review_passed → settled → bookkept.
   "settled" means JPYC has been transferred on Polygon.
   withholding.applies is whether Japanese withholding tax was deducted.
   ```
5. **例 (few-shot)** に `data-agent.yaml` の `fewShot:` を入力
6. **発行**

### 6-6. Power BI レポート

1. 意味モデルから **新規レポート**
2. `infra/power-bi/report-spec.md` の 4 ページ構成を作る:

**ページ 1 サマリ**:
- カード ビジュアル: `[TotalPayments]`, `[SettledPayments]`
- 折れ線: 軸 `YearMonth`, 値 `[SettledPayments]`

**ページ 2 受注者別**:
- テーブル: `workerGithubLogin`, `[TotalPayments]`
- 並び替え: 累計降順

**ページ 3 パイプライン**:
- ファネル: `status` カウント
- ヒストグラム: `[AvgLeadTimeHours]`

**ページ 4 経理サポート**:
- カード: `[WithholdingTotal]`
- テーブル: `id`, `description`, `bookkeepingArtifacts.needsHumanReview` フィルタ true

3. 保存 → 名前 `pbi-gigflow-monthly`
4. **発行** → ワークスペース `ws-gigflow`
5. レポートを開いて URL を取得 → `.env` の `POWER_BI_REPORT_URL` にセット

### 6-7. Functions の app settings を更新

```bash
az functionapp config appsettings set \
  --name $FUNC_NAME --resource-group $RG \
  --settings POWER_BI_REPORT_URL="$POWER_BI_REPORT_URL"
```

---

## Step 7: GitHub demo repo + Webhook + Functions デプロイ (30分)

### 7-1. デモ用リポジトリを作成

```bash
# GitHub CLI で作成
brew install gh   # 必要なら
gh auth login     # ブラウザでログイン

gh repo create gigflow-demo-workspace --public \
  --description "Demo workspace for Agentic Gig-Flow"

cd /tmp
gh repo clone Mameta29/gigflow-demo-workspace
cd gigflow-demo-workspace

# 最低限の README + CI を入れておく
cat > README.md <<'EOF'
# gigflow-demo-workspace

Demo workspace where freelance Worker submits PRs reviewed by Agentic Gig-Flow.
EOF

mkdir -p .github/workflows
cat > .github/workflows/ci.yml <<'EOF'
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "tests passed (placeholder)"
EOF

git add . && git commit -m "init demo workspace" && git push origin main
```

### 7-2. GitHub PAT を作成 → Key Vault に格納

1. https://github.com/settings/personal-access-tokens/new (fine-grained)
2. **Token name**: `gigflow-octokit`
3. **Expiration**: 90 days
4. **Repository access**: Only select repositories → `gigflow-demo-workspace`
5. **Repository permissions**:
   - Contents: Read and write
   - Issues: Read and write
   - Pull requests: Read and write
   - Metadata: Read-only (auto)
6. Generate → トークン (`github_pat_...`) をコピー
7. Key Vault に保存:
   ```bash
   az keyvault secret set --vault-name $KV_NAME --name github-pat --value "github_pat_..."
   ```

### 7-3. Functions / Container をデプロイ (CI/CD 推奨)

**推奨: GitHub Actions で自動デプロイ**。先に OIDC を一度だけセットアップする:

```bash
cd ~/dev/hackson/agentic-gig-flow
RG=$RG GH_REPO=Mameta29/agentic-gig-flow ./infra/entra/setup-github-oidc.sh
```

これが行うこと:

- `app-gigflow-github-actions` を作成し、main ブランチ + production environment の federated credential を登録
- リソースグループに Contributor ロールを割当
- `gh` CLI があればリポジトリ secret (`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` / `AZURE_RESOURCE_GROUP` / `AZURE_FUNCTIONAPP_NAME`) を自動登録

GitHub の **Settings > Environments** に `production` 環境を作成したら、以後は:

- `packages/functions/**` への push → `.github/workflows/deploy-functions.yml` が Functions を自動デプロイ
- `packages/dashboard/**` / `packages/mcp-server/**` への push → `deploy-containers.yml` が GHCR ビルド + Container Apps 更新
- 手動デプロイは GitHub Actions の **Run workflow** ボタン (`workflow_dispatch`) からも可能

**フォールバック: ローカルから手動デプロイ** (CI が使えない場合):

```bash
cd ~/dev/hackson/agentic-gig-flow
brew tap azure/functions && brew install azure-functions-core-tools@4   # 初回のみ
pnpm --filter @gigflow/functions build
cd packages/functions
func azure functionapp publish $FUNC_NAME --typescript
func azure functionapp list-functions $FUNC_NAME --show-keys
```

### 7-4. Webhook URL を取得

```bash
# Function key を取得
FUNCTION_KEY=$(az functionapp keys list \
  --name $FUNC_NAME --resource-group $RG \
  --query functionKeys.default -o tsv)

WEBHOOK_URL="https://${FUNC_NAME}.azurewebsites.net/api/webhook/github?code=${FUNCTION_KEY}"
echo "WEBHOOK_URL=$WEBHOOK_URL"
```

### 7-5. Webhook を GitHub に登録

1. https://github.com/Mameta29/gigflow-demo-workspace/settings/hooks → **Add webhook**
2. **Payload URL**: 上で取得した `WEBHOOK_URL`
3. **Content type**: `application/json`
4. **Secret**: Step 2-2 で生成した `WEBHOOK_SECRET` (= `az keyvault secret show --vault-name $KV_NAME --name github-webhook-secret --query value -o tsv` で再取得可)
5. **Which events?**: Let me select individual events
   - ☑ Pull requests
   - ☑ Pull request reviews
   - ☑ Check runs
6. **Active** ☑
7. **Add webhook**

8. **Recent Deliveries** タブの最新 ping を見て **Response 200** ならOK

---

## Step 8: E2E リハーサル → 動画撮影 → 提出 (多日)

### 8-1. E2E 一周

1. **Teams で `@gigflow` に発注**:
   ```
   @gigflow sato さんに「README に About セクションを追加」5万JPYC 1週間
   ```
2. Adaptive Card 確認 → 承認
3. GitHub Issue が作成される (本文末尾に `<!-- gigflow:orderId=... -->`)
4. **Worker 役** (副アカウント or 自分): demo repo に `feature/about` ブランチ → README を編集 → PR 作成 (PR 本文に `Closes #<issue-number>` を入れて Issue とリンク)
5. CI が成功
6. **Review Agent** が PR diff を解析 → コメント → approve → squash merge
7. **Settlement Agent** が起動 → JPYC が Sato のウォレットに送金される
8. **Bookkeeping Agent** が仕訳を生成 → Teams に Adaptive Card 通知
9. Dashboard (`https://$DASHBOARD_URL/orders`) で order が `bookkept` になることを確認
10. Claude Desktop の MCP 設定に `gigflow-mcp` を追加 (`docs/09-mcp-server.md` §7.1) → 「先月の sato さんへの支払いは?」と聞いて MCP tool 呼び出しが返ってくることを確認
11. Power BI を開いて経営者ビューを確認

### 8-2. App Insights Workbook をデプロイ + 動画撮影

**先に Workbook をデプロイ** (KQL を Portal で手貼りする必要はない):

```bash
cd ~/dev/hackson/agentic-gig-flow
RG=$RG APPI_NAME=$APPI_NAME ./infra/observability/deploy-workbook.sh
```

`infra/observability/gigflow-workbook.json` が **gigflow-business-dashboard** という Workbook として
Application Insights に配置される。中身:

- **最新の着金レイテンシ** (Merge → JPYC着金、秒) — デモのオーバーレイにそのまま使える大きな数字
- 着金レイテンシ分布 (p50 / p95 / max、直近30日)・推移チャート
- Settlement 成功率・MCP ツール呼び出し回数

この「Merge → 着金」秒数は `settlement_completed` イベントの `mergeToSettledMs` measurement
(PR マージ webhook の `mergedAt` 起点) から算出される。生 KQL は `infra/observability/workbook-queries.kql` 参照。

**動画撮影** (`docs/06-demo-script.md` を台本):

- **ソフト**: OBS Studio (録画) + DaVinci Resolve (編集) いずれも無料
- **機材**: USB マイク (千円〜) + 静かな部屋 / 仮想背景
- **解像度**: 1920x1080 / 60fps
- **Scene 5 の 3 秒着金**: 上の Workbook「最新の着金レイテンシ」タイルの実測値を字幕に焼き込む

### 8-3. 動画を YouTube にアップ (Unlisted)

1. https://studio.youtube.com → 動画をアップロード
2. 公開設定: **限定公開** (URL を知っている人だけ視聴可)
3. URL をコピー → Zenn 記事に埋め込み

### 8-4. Zenn 記事執筆

1. https://zenn.dev → サインイン (GitHub 連携推奨)
2. ダッシュボード → **本** ではなく **記事** を選ぶ → **新規作成**
3. `docs/07-zenn-outline.md` の章構成に従って執筆
4. 動画埋込は YouTube URL をそのまま貼ると自動展開
5. アーキテクチャ図は Mermaid 記法 (` ```mermaid ` ブロック) でそのまま動く
6. メタデータ:
   - type: tech
   - emoji: ⚡
   - topics: `["Agent", "Azure", "CopilotStudio", "MCP", "Fabric", "JPYC", "Hackathon", "TypeScript"]`
7. 公開設定: 提出直前まで **非公開**

### 8-5. 審査員向けゲストアクセス

1. Entra Portal → ユーザー → **ユーザーの招待** (B2B ゲスト)
2. メール: `azuregigflow.demo+judge@example.com` (審査員のアドレスは通常通知される)
3. 招待後、Teams 管理センターでゲストにアプリ利用許可
4. ゲストに **PM + Accountant + Executive** の全ロールを割当

### 8-6. 最終チェックリスト

```bash
# Function App / Container Apps が稼働中
az functionapp show --name $FUNC_NAME --resource-group $RG --query state -o tsv
az containerapp show --name ca-gigflow-dashboard --resource-group $RG --query properties.runningStatus -o tsv
az containerapp show --name ca-gigflow-mcp --resource-group $RG --query properties.runningStatus -o tsv

# Cosmos にデータがある
az cosmosdb sql container show --account-name $COSMOS_NAME --resource-group $RG --database-name gigflow --name orders --query resource.id -o tsv

# Dashboard URL が開く
curl -s -o /dev/null -w "%{http_code}\n" https://$DASHBOARD_URL/

# MCP healthz
curl https://$MCP_URL/healthz
```

### 8-7. 提出

1. https://zenn.dev で記事を **公開** に切替
2. GitHub repo `agentic-gig-flow` を **public** に変更:
   - https://github.com/Mameta29/agentic-gig-flow/settings → 一番下 **Change visibility** → Public
3. 提出タグ:
   ```bash
   cd ~/dev/hackson/agentic-gig-flow
   git tag v0.9-submission
   git push origin v0.9-submission
   ```
4. ハッカソン応募フォーム (https://zenn.dev/hackathons の本ハッカソンページ) で:
   - 記事 URL: https://zenn.dev/mameta29/articles/agentic-gig-flow
   - GitHub URL: https://github.com/Mameta29/agentic-gig-flow/tree/v0.9-submission
   - 動作 URL: `https://$DASHBOARD_URL` + Teams Bot 招待リンク
5. **2026-06-01 23:59 までに送信**

### 8-8. 審査期間中の運用 (6/2-6/18)

- リソースを止めない
- Function App / Container App / Cosmos / OpenAI を 24/7 で起動
- 月額コスト概算:
  - Functions Consumption: 数百円
  - Container Apps (min 1): ~3,000円/月 × 2 = 6,000円
  - Cosmos Serverless: ~1,000円
  - Azure OpenAI gpt-4o GlobalStandard: 使用分 (デモ程度なら数百円)
  - Fabric Trial: 無料
  - **合計 〜10,000円/月** ぐらいを覚悟

### 8-9. 提出後のクリーンアップ (6/19 以降)

```bash
# 全部消す (注意: 戻せない)
az group delete --name $RG --yes --no-wait
```

---

## 優先順位 (詰まったら)

1. **今すぐ**: Step 2 をターミナルにコピペして Azure 構築開始 (90分)
   - Azure OpenAI gpt-4o の **deployment 承認待ちが入る** 場合があるので、最初に `az cognitiveservices account deployment create` を流すのを優先
2. Step 3 Cosmos seed (5分) — Azure 構築直後に
3. Step 4 JPYC 送金疎通 (30分) — JPYC 購入が初めてなら 1〜2 日かかる場合あり
4. Step 7 Functions デプロイ
5. Step 5 Copilot Studio Bot (90分)
6. Step 6 Fabric / Power BI (120分)
7. Step 8 E2E 一周 → 動画 → Zenn → 提出

詰まったらドキュメントの該当章 (`docs/04-azure-setup.md` のトラブルシューティング、`docs/08-copilot-studio.md` のハマりどころ、等) を最初に当たること。
