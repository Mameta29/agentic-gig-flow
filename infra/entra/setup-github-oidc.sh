#!/usr/bin/env bash
#
# setup-github-oidc.sh — GitHub Actions が Azure へ OIDC でログインするための
# App Registration + federated credential + ロール割当を構築する。
# .github/workflows/deploy-functions.yml / deploy-containers.yml が依存する。
#
# 前提:
#   - az login 済み (デプロイ先サブスクリプションの Owner 権限)
#   - gh CLI ログイン済み (リポジトリ secret を自動登録する場合)
#
# 使い方:
#   RG=rg-gigflow-prod GH_REPO=Mameta29/agentic-gig-flow ./infra/entra/setup-github-oidc.sh

set -euo pipefail

RG="${RG:-rg-gigflow-prod}"
GH_REPO="${GH_REPO:-Mameta29/agentic-gig-flow}"
APP_NAME="${APP_NAME:-app-gigflow-github-actions}"

log() { printf '\033[1;34m[oidc]\033[0m %s\n' "$*"; }

SUB_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
log "Subscription=$SUB_ID  Tenant=$TENANT_ID  Repo=$GH_REPO"

# --- App Registration (なければ作成) ------------------------------------------
APP_ID="$(az ad app list --filter "displayName eq '${APP_NAME}'" --query '[0].appId' -o tsv)"
if [ -z "$APP_ID" ] || [ "$APP_ID" = "None" ]; then
  log "App Registration を作成: ${APP_NAME}"
  APP_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
fi
log "APP_ID=$APP_ID"

# Service Principal (なければ作成)
SP_ID="$(az ad sp list --filter "appId eq '${APP_ID}'" --query '[0].id' -o tsv)"
if [ -z "$SP_ID" ] || [ "$SP_ID" = "None" ]; then
  az ad sp create --id "$APP_ID" >/dev/null
fi

# --- Federated credentials (main ブランチ + production environment) -----------
add_fic() {
  local name="$1" subject="$2"
  if az ad app federated-credential list --id "$APP_ID" \
       --query "[?name=='${name}'] | [0].name" -o tsv | grep -q "$name"; then
    log "federated credential 既存: ${name}"
    return
  fi
  log "federated credential を作成: ${name}"
  az ad app federated-credential create --id "$APP_ID" --parameters "$(cat <<JSON
{
  "name": "${name}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "${subject}",
  "audiences": ["api://AzureADTokenExchange"]
}
JSON
)"
}

add_fic "github-main"        "repo:${GH_REPO}:ref:refs/heads/main"
add_fic "github-production"  "repo:${GH_REPO}:environment:production"

# --- ロール割当: リソースグループ全体に Contributor --------------------------
RG_SCOPE="/subscriptions/${SUB_ID}/resourceGroups/${RG}"
log "ロール割当: Contributor on ${RG}"
az role assignment create \
  --assignee "$APP_ID" \
  --role "Contributor" \
  --scope "$RG_SCOPE" >/dev/null 2>&1 \
  && log "Contributor を付与" \
  || log "Contributor 割当スキップ (割当済み)"

# --- GitHub リポジトリ secret を登録 (gh CLI があれば) ------------------------
FUNC_NAME="$(az functionapp list --resource-group "$RG" \
  --query '[0].name' -o tsv 2>/dev/null || true)"

if command -v gh >/dev/null 2>&1; then
  log "GitHub リポジトリ secret を登録: ${GH_REPO}"
  gh secret set AZURE_CLIENT_ID       --repo "$GH_REPO" --body "$APP_ID"
  gh secret set AZURE_TENANT_ID       --repo "$GH_REPO" --body "$TENANT_ID"
  gh secret set AZURE_SUBSCRIPTION_ID --repo "$GH_REPO" --body "$SUB_ID"
  gh secret set AZURE_RESOURCE_GROUP  --repo "$GH_REPO" --body "$RG"
  [ -n "$FUNC_NAME" ] && gh secret set AZURE_FUNCTIONAPP_NAME --repo "$GH_REPO" --body "$FUNC_NAME"
  log "secret 登録完了"
else
  cat <<EOF

gh CLI が無いため、以下を GitHub リポジトリ Settings > Secrets に手動登録すること:
  AZURE_CLIENT_ID         = ${APP_ID}
  AZURE_TENANT_ID         = ${TENANT_ID}
  AZURE_SUBSCRIPTION_ID   = ${SUB_ID}
  AZURE_RESOURCE_GROUP    = ${RG}
  AZURE_FUNCTIONAPP_NAME  = ${FUNC_NAME:-<func-gigflow-xxxxxx>}

また production environment を Settings > Environments に作成すること
(deploy ワークフローが environment: production を参照する)。
EOF
fi

log "完了。"
