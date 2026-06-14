# 04. Azure 環境構築

az CLI のコピペで完結する手順。所要 60〜90分 (Entra App Registration / Fabric セットアップ含む)。

> **構築範囲**:
> - 基本リソース: Resource Group, Cosmos DB, Key Vault, Storage, Functions, Container Apps Environment, Application Insights, Azure OpenAI
> - Container Apps: Dashboard + MCP Server
> - Entra ID: 5 つの App Registration (multi-tenant)
> - Microsoft Fabric: Trial Capacity + ワークスペース + Mirror + Data Agent
> - 関連手順: `docs/10-entra-id.md` (Entra), `docs/11-fabric.md` (Fabric), `docs/08-copilot-studio.md` (Copilot Studio Bot)

## 前提

- Azure Subscription (Pay-As-You-Go、無料クレジット使用可)
- Azure CLI 2.60+ (`az --version`)
- ログイン済み (`az login`)
- ハッカソンの個人クレジット ($200) は自動付与済みのはず

---

## §0. 共通変数の設定

```bash
# 自分の値に書き換え
export RG=rg-gigflow-prod
export LOCATION=japaneast              # gpt-5.1 を提供しているリージョンを確認（無ければ eastus2 等）
export PREFIX=gigflow                  # リソース名のプレフィックス
export SUFFIX=$(openssl rand -hex 3)   # ランダム3バイト = グローバル一意性確保

echo "PREFIX=${PREFIX} SUFFIX=${SUFFIX}"
# → 例: PREFIX=gigflow SUFFIX=a1b2c3
# 以後すべて ${PREFIX}-${SUFFIX} 形式で命名
```

---

## §1. Resource Group

```bash
az group create \
  --name $RG \
  --location $LOCATION
```

---

## §2. Cosmos DB (NoSQL, Serverless, Free Tier)

```bash
COSMOS_NAME=cosmos-${PREFIX}-${SUFFIX}

az cosmosdb create \
  --name $COSMOS_NAME \
  --resource-group $RG \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --default-consistency-level Session \
  --enable-free-tier false  # serverless では free tier 不要

# Database
az cosmosdb sql database create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --name gigflow

# Containers
az cosmosdb sql container create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --database-name gigflow \
  --name orders \
  --partition-key-path "/companyId"

az cosmosdb sql container create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --database-name gigflow \
  --name events \
  --partition-key-path "/orderId"

az cosmosdb sql container create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --database-name gigflow \
  --name accounts \
  --partition-key-path "/id"

az cosmosdb sql container create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --database-name gigflow \
  --name tenants \
  --partition-key-path "/id"

# 接続情報を環境変数に取得
COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query documentEndpoint -o tsv)
echo "COSMOS_ENDPOINT=$COSMOS_ENDPOINT"
```

---

## §3. Key Vault

```bash
KV_NAME=kv-${PREFIX}-${SUFFIX}

az keyvault create \
  --name $KV_NAME \
  --resource-group $RG \
  --location $LOCATION \
  --enable-rbac-authorization true \
  --retention-days 7

# 自分のユーザーに RBAC 権限を付与
USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee $USER_OBJECT_ID \
  --scope $(az keyvault show --name $KV_NAME --query id -o tsv)

# 数十秒待ってから (RBAC 反映)
sleep 30

# Wallet 秘密鍵を格納 (Day 3 で実施)
# az keyvault secret set --vault-name $KV_NAME --name wallet-pk --value "0xYOUR_PRIVATE_KEY"

# GitHub PAT を格納 (Day 1 で生成済みのものを)
# az keyvault secret set --vault-name $KV_NAME --name github-pat --value "ghp_..."

# GitHub Webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)
az keyvault secret set --vault-name $KV_NAME --name github-webhook-secret --value "$WEBHOOK_SECRET"
echo "WEBHOOK_SECRET (この値を GitHub Webhook 設定で使う): $WEBHOOK_SECRET"
```

---

## §4. Storage Account (Functions の前提)

```bash
STORAGE_NAME=st${PREFIX}${SUFFIX}    # storage account はハイフン不可、24文字以内

az storage account create \
  --name $STORAGE_NAME \
  --resource-group $RG \
  --location $LOCATION \
  --sku Standard_LRS
```

---

## §5. Function App (Consumption Plan, Node.js 20)

```bash
FUNC_NAME=func-${PREFIX}-${SUFFIX}

az functionapp create \
  --name $FUNC_NAME \
  --resource-group $RG \
  --storage-account $STORAGE_NAME \
  --consumption-plan-location $LOCATION \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --os-type Linux \
  --assign-identity '[system]'

# Managed Identity の Object ID を取得
FUNC_PRINCIPAL_ID=$(az functionapp identity show --name $FUNC_NAME --resource-group $RG --query principalId -o tsv)
echo "FUNC_PRINCIPAL_ID=$FUNC_PRINCIPAL_ID"

# Key Vault への読み取り権限
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $FUNC_PRINCIPAL_ID \
  --scope $(az keyvault show --name $KV_NAME --query id -o tsv)

# Cosmos DB の Data Contributor (custom role を割り当て)
COSMOS_RG_SCOPE=$(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query id -o tsv)

az cosmosdb sql role assignment create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --scope $COSMOS_RG_SCOPE \
  --principal-id $FUNC_PRINCIPAL_ID \
  --role-definition-id 00000000-0000-0000-0000-000000000002  # Cosmos DB Built-in Data Contributor
```

---

## §6. Application Insights

```bash
APPI_NAME=ai-${PREFIX}-${SUFFIX}

# Log Analytics Workspace を先に作成
LAW_NAME=log-${PREFIX}-${SUFFIX}
az monitor log-analytics workspace create \
  --resource-group $RG \
  --workspace-name $LAW_NAME \
  --location $LOCATION

LAW_ID=$(az monitor log-analytics workspace show --resource-group $RG --workspace-name $LAW_NAME --query id -o tsv)

# Application Insights
az monitor app-insights component create \
  --app $APPI_NAME \
  --location $LOCATION \
  --resource-group $RG \
  --workspace $LAW_ID

APPI_CONNSTR=$(az monitor app-insights component show --app $APPI_NAME --resource-group $RG --query connectionString -o tsv)

# Function App に紐付け
az functionapp config appsettings set \
  --name $FUNC_NAME \
  --resource-group $RG \
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING="$APPI_CONNSTR"
```

---

## §7. Azure OpenAI (Foundry)

> **注意**: Azure OpenAI は申請制リージョンの場合あり。個人サブスクで使えない場合は **East US 2** か **Sweden Central** にフォールバック。

```bash
AOAI_NAME=aoai-${PREFIX}-${SUFFIX}
AOAI_LOCATION=$LOCATION   # 失敗したら eastus2 に変更

az cognitiveservices account create \
  --name $AOAI_NAME \
  --resource-group $RG \
  --location $AOAI_LOCATION \
  --kind OpenAI \
  --sku S0 \
  --custom-domain $AOAI_NAME

# gpt-5.1 デプロイ（gpt-4o の Microsoft 公式推奨置換。モデル非依存設計なので gpt-4o に戻すなら
#  --deployment-name/--model-name を gpt-4o・--model-version 2024-11-20 にするだけ）
# ⚠️ --model-version は Foundry のモデルカタログで現行 GA 版を確認してから指定すること
#    (`az cognitiveservices model list -l $LOCATION` で gpt-5.1 の version を確認)
az cognitiveservices account deployment create \
  --resource-group $RG \
  --name $AOAI_NAME \
  --deployment-name gpt-5.1 \
  --model-name gpt-5.1 \
  --model-version <カタログで確認した現行版> \
  --model-format OpenAI \
  --sku-name "GlobalStandard" \
  --sku-capacity 50

# ⚠️ デプロイ後の必須疎通確認: gpt-5.1 は Chat Completions ではなく Responses API が
#    既定になり 404 になる報告がある。デプロイ直後に実コールで Chat Completions が
#    通ることを1回確認する（通らなければ AZURE_OPENAI_DEPLOYMENT=gpt-4o に即戻せる）。

# Function App から Managed Identity でアクセスする権限
AOAI_RESOURCE_ID=$(az cognitiveservices account show --name $AOAI_NAME --resource-group $RG --query id -o tsv)
az role assignment create \
  --role "Cognitive Services OpenAI User" \
  --assignee $FUNC_PRINCIPAL_ID \
  --scope $AOAI_RESOURCE_ID

# Endpoint を環境変数に追加
AOAI_ENDPOINT=$(az cognitiveservices account show --name $AOAI_NAME --resource-group $RG --query properties.endpoint -o tsv)
echo "AOAI_ENDPOINT=$AOAI_ENDPOINT"
```

### Function App に環境変数を設定

```bash
az functionapp config appsettings set \
  --name $FUNC_NAME \
  --resource-group $RG \
  --settings \
    AZURE_OPENAI_ENDPOINT="$AOAI_ENDPOINT" \
    AZURE_OPENAI_DEPLOYMENT="gpt-5.1" \
    AZURE_OPENAI_API_VERSION="2025-04-01-preview" \
    COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_DATABASE="gigflow" \
    KEY_VAULT_NAME="$KV_NAME" \
    POLYGON_RPC="https://polygon-rpc.com" \
    JPYC_ADDRESS="0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB"  # 公式 JPYC on Polygon
```

> **JPYC アドレス確認**: 公式ドキュメントで最新を確認。本リスト時点では `0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB` だが、念のため [JPYC公式](https://jpyc.jp/) で照合。

---

## §8. Container Apps Environment + Dashboard + MCP Server

```bash
CAE_NAME=cae-${PREFIX}-${SUFFIX}

# Container Apps Environment
az containerapp env create \
  --name $CAE_NAME \
  --resource-group $RG \
  --location $LOCATION \
  --logs-workspace-id $(az monitor log-analytics workspace show --resource-group $RG --workspace-name $LAW_NAME --query customerId -o tsv) \
  --logs-workspace-key $(az monitor log-analytics workspace get-shared-keys --resource-group $RG --workspace-name $LAW_NAME --query primarySharedKey -o tsv)
```

### §8.1 Dashboard (M10 で実施)

> **注意**: Container Apps の FQDN は `<app-name>.<random-suffix>.<region>.azurecontainerapps.io` の形式で、デプロイ後に確定する。MCP の URL は MCP App デプロイ後に取得して Dashboard に注入する流れにする (= MCP を先にデプロイ → URL 取得 → Dashboard デプロイ)。

```bash
# 先に MCP をデプロイ (§8.2) して MCP_URL を取得しておくこと
# MCP_URL=$(az containerapp show --name ca-gigflow-mcp --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)

az containerapp create \
  --name ca-gigflow-dashboard \
  --resource-group $RG \
  --environment $CAE_NAME \
  --image ghcr.io/$GITHUB_USER/gigflow-dashboard:latest \
  --target-port 3000 \
  --ingress external \
  --registry-server ghcr.io \
  --registry-username $GITHUB_USER \
  --registry-password $GHCR_TOKEN \
  --system-assigned \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    AUTH_ENTRA_CLIENT_ID="$DASHBOARD_APP_ID" \
    AUTH_ENTRA_CLIENT_SECRET="secretref:auth-entra-secret" \
    FUNCTIONS_BASE_URL="https://${FUNC_NAME}.azurewebsites.net" \
    MCP_BASE_URL="https://${MCP_URL}" \
    FUNCTIONS_APP_ID="$FUNCTIONS_APP_ID" \
    MCP_APP_ID="$MCP_APP_ID" \
  --secrets auth-entra-secret="$DASHBOARD_CLIENT_SECRET"

DASHBOARD_URL=$(az containerapp show --name ca-gigflow-dashboard --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
echo "Dashboard URL: https://$DASHBOARD_URL"

# 取得した DASHBOARD_URL を Dashboard App Registration の redirect URI に追加
az ad app update --id $DASHBOARD_APP_ID --web-redirect-uris \
  "https://$DASHBOARD_URL/api/auth/callback/microsoft-entra-id" \
  "https://localhost:3000/api/auth/callback/microsoft-entra-id"
```

### §8.2 MCP Server (M12 で実施)

```bash
az containerapp create \
  --name ca-gigflow-mcp \
  --resource-group $RG \
  --environment $CAE_NAME \
  --image ghcr.io/$GITHUB_USER/gigflow-mcp:latest \
  --target-port 3333 \
  --ingress external \
  --registry-server ghcr.io \
  --registry-username $GITHUB_USER \
  --registry-password $GHCR_TOKEN \
  --system-assigned \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_DATABASE="gigflow" \
    MCP_APP_AUDIENCE="api://gigflow-mcp"

# Cosmos に Reader 権限 (read-only)
MCP_PRINCIPAL_ID=$(az containerapp identity show --name ca-gigflow-mcp --resource-group $RG --query principalId -o tsv)
az cosmosdb sql role assignment create \
  --account-name $COSMOS_NAME \
  --resource-group $RG \
  --scope $(az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query id -o tsv) \
  --principal-id $MCP_PRINCIPAL_ID \
  --role-definition-id 00000000-0000-0000-0000-000000000001  # Built-in Data Reader

MCP_URL=$(az containerapp show --name ca-gigflow-mcp --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv)
echo "MCP URL: https://$MCP_URL/mcp"
```

---

## §9. Functions のローカル開発設定

`packages/functions/local.settings.json` (gitignore に入れる):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FUNCTIONS_NODE_VERSION": "~20",
    "AZURE_OPENAI_ENDPOINT": "<上の AOAI_ENDPOINT>",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-5.1",
    "AZURE_OPENAI_API_VERSION": "2025-04-01-preview",
    "COSMOS_ENDPOINT": "<上の COSMOS_ENDPOINT>",
    "COSMOS_DATABASE": "gigflow",
    "KEY_VAULT_NAME": "<KV_NAME>",
    "POLYGON_RPC": "https://polygon-rpc.com",
    "JPYC_ADDRESS": "0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB",
    "FUNCTIONS_APP_AUDIENCE": "api://gigflow-functions",
    "MCP_APP_AUDIENCE": "api://gigflow-mcp",
    "BOT_APP_ID": "<BOT_APP_ID>",
    "BOT_CLIENT_SECRET_NAME": "bot-client-secret",
    "DASHBOARD_URL": "https://<DASHBOARD_URL>",
    "POWER_BI_REPORT_URL": "https://app.powerbi.com/groups/.../reports/..."
  }
}
```

ローカル開発時の認証は `az login` の credential が `DefaultAzureCredential` で拾われる。

---

## §10. デプロイ確認用スクリプト

```bash
# packages/functions/scripts/check-azure.sh
echo "Resource Group:"; az group show --name $RG --query name -o tsv
echo "Cosmos:"; az cosmosdb show --name $COSMOS_NAME --resource-group $RG --query documentEndpoint -o tsv
echo "Function App:"; az functionapp show --name $FUNC_NAME --resource-group $RG --query defaultHostName -o tsv
echo "OpenAI:"; az cognitiveservices account show --name $AOAI_NAME --resource-group $RG --query properties.endpoint -o tsv
echo "Key Vault:"; az keyvault show --name $KV_NAME --query properties.vaultUri -o tsv
echo "App Insights:"; az monitor app-insights component show --app $APPI_NAME --resource-group $RG --query connectionString -o tsv
```

---

## §11. Entra ID App Registrations (M9 で実施)

詳細は `docs/10-entra-id.md`。最小コマンド集:

```bash
# Functions (Web API)
FUNCTIONS_APP_ID=$(az ad app create \
  --display-name "app-gigflow-functions" \
  --sign-in-audience AzureADMultipleOrgs \
  --identifier-uris "api://gigflow-functions" \
  --query appId -o tsv)

# MCP Server (Web API)
MCP_APP_ID=$(az ad app create \
  --display-name "app-gigflow-mcp" \
  --sign-in-audience AzureADMultipleOrgs \
  --identifier-uris "api://gigflow-mcp" \
  --query appId -o tsv)

# Dashboard (SPA)
DASHBOARD_APP_ID=$(az ad app create \
  --display-name "app-gigflow-dashboard" \
  --sign-in-audience AzureADMultipleOrgs \
  --web-redirect-uris "https://localhost:3000/api/auth/callback/microsoft-entra-id" \
  --query appId -o tsv)

# Dashboard secret
DASHBOARD_CLIENT_SECRET=$(az ad app credential reset \
  --id $DASHBOARD_APP_ID \
  --display-name "default" \
  --years 1 \
  --query password -o tsv)
az keyvault secret set --vault-name $KV_NAME --name dashboard-client-secret --value "$DASHBOARD_CLIENT_SECRET"

# Bot (Copilot Studio 用)
# Copilot Studio が Microsoft 365 Copilot Connector として動作する場合、Bot Channel Registration は不要。
# proactive message を Bot Framework REST API で送る場合のみ Azure Bot resource が必要。
# 詳細は docs/08-copilot-studio.md §4.2 参照。
BOT_APP_ID=$(az ad app create \
  --display-name "app-gigflow-copilot" \
  --sign-in-audience AzureADMultipleOrgs \
  --query appId -o tsv)
BOT_CLIENT_SECRET=$(az ad app credential reset \
  --id $BOT_APP_ID \
  --display-name "default" \
  --years 1 \
  --query password -o tsv)
az keyvault secret set --vault-name $KV_NAME --name bot-client-secret --value "$BOT_CLIENT_SECRET"

# Azure Bot resource (proactive message 送信に必要)
az bot create \
  --resource-group $RG \
  --name bot-gigflow-${SUFFIX} \
  --app-type MultiTenant \
  --appid $BOT_APP_ID \
  --location global \
  --sku F0

# Fabric (Web API、データアクセス用 audience)
FABRIC_APP_ID=$(az ad app create \
  --display-name "app-gigflow-fabric" \
  --sign-in-audience AzureADMultipleOrgs \
  --identifier-uris "api://gigflow-fabric" \
  --query appId -o tsv)
```

**App roles (PM / Accountant / Executive)** の追加方法 (どちらか):

**(A) Azure Portal で GUI 操作 (推奨)**
1. Entra Portal → App registrations → `app-gigflow-functions`
2. Manage → App roles → Create app role
3. PM / Accountant / Executive をそれぞれ作成 (define: `docs/10-entra-id.md` §2.1)
4. `app-gigflow-mcp` でも同じ 3 ロールを作成

**(B) Microsoft Graph API で PATCH (CLI 派向け)**
```bash
# approles.json を作成 (docs/10-entra-id.md §2.1 のサンプルを使用)
TOKEN=$(az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv)

# Functions App
APP_OBJECT_ID=$(az ad app show --id $FUNCTIONS_APP_ID --query id -o tsv)
curl -X PATCH "https://graph.microsoft.com/v1.0/applications/$APP_OBJECT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"appRoles\": $(cat approles.json)}"

# MCP App でも同様
```

> `az ad app update --app-roles` は CLI バージョンで挙動差があるため、確実な方法として GUI または Graph PATCH を推奨。

---

## §12. Microsoft Fabric (M13 で実施)

詳細は `docs/11-fabric.md`。

```
1. https://app.fabric.microsoft.com/ にサインイン (個人アカウント or Demo Tenant)
2. 設定 > 容量 > Trial 開始 (60日無料)
3. ワークスペース ws-gigflow を作成し Trial 容量に紐付け
4. Mirrored Database (Azure Cosmos DB) を作成、cosmos-${PREFIX}-${SUFFIX} に接続
5. orders / events のミラーリングを有効化
6. Cosmos の Reader role を Fabric Managed Identity に付与:
   az cosmosdb sql role assignment create ... (Reader)
7. Semantic Model を構築 (DAX measures は docs/11-fabric.md §3 参照)
8. Data Agent を作成、AI スキーマ説明と few-shot 例を投入
9. Power BI レポート pbi-gigflow-monthly を作成・発行
```

CLI で完結しない部分が多いので、上記は手順書として手作業実行。

---

## §13. クリーンアップ (提出後の運用終了時)

```bash
# 6/18 以降の審査終了後に
az group delete --name $RG --yes --no-wait
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `az functionapp create` で "the storage account ... is not allowed" | リージョン制限 | Storage と Function App を同一リージョンに |
| OpenAI で 401 Unauthorized | Managed Identity の権限がまだ伝播していない | 数分待つ。または App Setting に `AZURE_OPENAI_API_KEY` を一時的に設定 |
| Cosmos DB が "Forbidden" | Cosmos の RBAC がローカル `az login` ユーザーに無い | 自分のユーザーにも `Cosmos DB Built-in Data Contributor` を割り当てる |
| Container App が起動しない | image pull 失敗 | GHCR token / ACR のlogin が正しいか確認 |
