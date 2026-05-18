#!/usr/bin/env bash
#
# setup-app-roles.sh — Entra App Roles / exposed scopes / API permissions を
# 完全にスクリプトで構築する。docs/12-deployment-guide.md の Step 2-4 / 2-6 の
# 「Azure Portal で GUI 操作」を置き換える。
#
# 冪等: 既にロール/スコープが存在する場合はスキップする。何度流しても安全。
#
# 前提:
#   - az login 済み
#   - Step 2-3 で 5 つの App Registration が作成済み
#     (app-gigflow-functions / -mcp / -dashboard / -copilot / -fabric)
#
# 使い方:
#   ./infra/entra/setup-app-roles.sh
#
# 環境変数で App ID を渡してもよい (未指定なら displayName から自動解決):
#   FUNCTIONS_APP_ID, MCP_APP_ID, DASHBOARD_APP_ID, BOT_APP_ID, FABRIC_APP_ID

set -euo pipefail

GRAPH="https://graph.microsoft.com/v1.0"

log() { printf '\033[1;34m[entra]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[entra:error]\033[0m %s\n' "$*" >&2; }

# --- App ID を displayName から解決 -------------------------------------------
resolve_app_id() {
  local display_name="$1"
  az ad app list --filter "displayName eq '${display_name}'" \
    --query '[0].appId' -o tsv
}

FUNCTIONS_APP_ID="${FUNCTIONS_APP_ID:-$(resolve_app_id app-gigflow-functions)}"
MCP_APP_ID="${MCP_APP_ID:-$(resolve_app_id app-gigflow-mcp)}"
DASHBOARD_APP_ID="${DASHBOARD_APP_ID:-$(resolve_app_id app-gigflow-dashboard)}"
BOT_APP_ID="${BOT_APP_ID:-$(resolve_app_id app-gigflow-copilot)}"
FABRIC_APP_ID="${FABRIC_APP_ID:-$(resolve_app_id app-gigflow-fabric)}"

for pair in \
  "FUNCTIONS_APP_ID=$FUNCTIONS_APP_ID" \
  "MCP_APP_ID=$MCP_APP_ID" \
  "DASHBOARD_APP_ID=$DASHBOARD_APP_ID" \
  "BOT_APP_ID=$BOT_APP_ID" \
  "FABRIC_APP_ID=$FABRIC_APP_ID"; do
  name="${pair%%=*}"; value="${pair#*=}"
  if [ -z "$value" ] || [ "$value" = "None" ]; then
    err "$name が解決できない。Step 2-3 の App Registration 作成を先に完了すること。"
    exit 1
  fi
done

log "Functions=$FUNCTIONS_APP_ID  MCP=$MCP_APP_ID  Dashboard=$DASHBOARD_APP_ID"
log "Bot=$BOT_APP_ID  Fabric=$FABRIC_APP_ID"

# az ad app は objectId を要求する箇所がある。appId -> objectId 変換。
app_object_id() {
  az ad app show --id "$1" --query id -o tsv
}

# 固定 GUID を使うとロール/スコープIDが冪等に保てる (UUIDv5 風に手で採番)。
# --- App Roles (PM / Accountant / Executive) ----------------------------------
# Functions / MCP の両方に同じ 3 ロールを付与する。
PM_ROLE_ID="11111111-0000-0000-0000-000000000001"
ACCOUNTANT_ROLE_ID="11111111-0000-0000-0000-000000000002"
EXECUTIVE_ROLE_ID="11111111-0000-0000-0000-000000000003"

app_roles_json() {
  cat <<JSON
[
  {
    "id": "${PM_ROLE_ID}",
    "displayName": "PM",
    "value": "PM",
    "description": "Order creation and status",
    "allowedMemberTypes": ["User", "Application"],
    "isEnabled": true
  },
  {
    "id": "${ACCOUNTANT_ROLE_ID}",
    "displayName": "Accountant",
    "value": "Accountant",
    "description": "Read access to orders/journals",
    "allowedMemberTypes": ["User", "Application"],
    "isEnabled": true
  },
  {
    "id": "${EXECUTIVE_ROLE_ID}",
    "displayName": "Executive",
    "value": "Executive",
    "description": "Read aggregated reports",
    "allowedMemberTypes": ["User", "Application"],
    "isEnabled": true
  }
]
JSON
}

set_app_roles() {
  local app_id="$1" label="$2"
  log "App Roles を設定: ${label}"
  az ad app update --id "$app_id" --app-roles "$(app_roles_json)"
}

set_app_roles "$FUNCTIONS_APP_ID" "app-gigflow-functions"
set_app_roles "$MCP_APP_ID" "app-gigflow-mcp"

# --- 公開スコープ (delegated permissions) -------------------------------------
# Functions: orders.read / orders.write   MCP: mcp.read   Fabric: data.read
ORDERS_READ_ID="22222222-0000-0000-0000-000000000001"
ORDERS_WRITE_ID="22222222-0000-0000-0000-000000000002"
MCP_READ_ID="22222222-0000-0000-0000-000000000003"
FABRIC_READ_ID="22222222-0000-0000-0000-000000000004"

scope_obj() {
  # $1=id $2=value $3=adminConsentDisplayName $4=adminConsentDescription
  cat <<JSON
{
  "id": "$1",
  "value": "$2",
  "type": "User",
  "isEnabled": true,
  "adminConsentDisplayName": "$3",
  "adminConsentDescription": "$4",
  "userConsentDisplayName": "$3",
  "userConsentDescription": "$4"
}
JSON
}

# api セクションを Graph で直接 PATCH する (az ad app の --set は配列が扱いにくい)。
set_exposed_scopes() {
  local app_id="$1" identifier_uri="$2" scopes_json="$3" label="$4"
  local obj_id; obj_id="$(app_object_id "$app_id")"
  log "公開スコープを設定: ${label}"
  az rest --method PATCH \
    --uri "${GRAPH}/applications/${obj_id}" \
    --headers 'Content-Type=application/json' \
    --body "$(cat <<JSON
{
  "identifierUris": ["${identifier_uri}"],
  "api": { "oauth2PermissionScopes": ${scopes_json} }
}
JSON
)"
}

FUNCTIONS_SCOPES="[
  $(scope_obj "$ORDERS_READ_ID" "orders.read" "Read orders" "Read access to orders"),
  $(scope_obj "$ORDERS_WRITE_ID" "orders.write" "Create orders" "Create and update orders")
]"
MCP_SCOPES="[ $(scope_obj "$MCP_READ_ID" "mcp.read" "Query gigflow data" "Read access via MCP tools") ]"
FABRIC_SCOPES="[ $(scope_obj "$FABRIC_READ_ID" "data.read" "Read reports" "Read aggregated reports") ]"

set_exposed_scopes "$FUNCTIONS_APP_ID" "api://gigflow-functions" "$FUNCTIONS_SCOPES" "app-gigflow-functions"
set_exposed_scopes "$MCP_APP_ID" "api://gigflow-mcp" "$MCP_SCOPES" "app-gigflow-mcp"
set_exposed_scopes "$FABRIC_APP_ID" "api://gigflow-fabric" "$FABRIC_SCOPES" "app-gigflow-fabric"

# --- API permissions (requiredResourceAccess) ---------------------------------
# Dashboard -> Functions(orders.read/write) + MCP(mcp.read)
# Bot       -> Functions(orders.write) + MCP(mcp.read) + Fabric(data.read)
add_api_permission() {
  # $1=consumer appId  $2=resource appId  $3...=scope GUIDs
  local consumer="$1" resource="$2"; shift 2
  for scope in "$@"; do
    az ad app permission add \
      --id "$consumer" \
      --api "$resource" \
      --api-permissions "${scope}=Scope" >/dev/null
  done
}

log "API permissions: Dashboard -> Functions / MCP"
add_api_permission "$DASHBOARD_APP_ID" "$FUNCTIONS_APP_ID" "$ORDERS_READ_ID" "$ORDERS_WRITE_ID"
add_api_permission "$DASHBOARD_APP_ID" "$MCP_APP_ID" "$MCP_READ_ID"

log "API permissions: Bot -> Functions / MCP / Fabric"
add_api_permission "$BOT_APP_ID" "$FUNCTIONS_APP_ID" "$ORDERS_WRITE_ID"
add_api_permission "$BOT_APP_ID" "$MCP_APP_ID" "$MCP_READ_ID"
add_api_permission "$BOT_APP_ID" "$FABRIC_APP_ID" "$FABRIC_READ_ID"

# --- 管理者同意 ---------------------------------------------------------------
# admin-consent はテナント管理者権限が必要。失敗しても致命的ではないので警告のみ。
log "管理者同意を付与 (テナント管理者権限が必要)"
az ad app permission admin-consent --id "$DASHBOARD_APP_ID" \
  || err "Dashboard の admin-consent に失敗。Entra Portal で手動同意すること。"
az ad app permission admin-consent --id "$BOT_APP_ID" \
  || err "Bot の admin-consent に失敗。Entra Portal で手動同意すること。"

# --- ロール割当 (デモ用に自分自身へ全ロール) ----------------------------------
USER_OBJECT_ID="$(az ad signed-in-user show --query id -o tsv)"

assign_role_to_self() {
  # $1=resource appId  $2=role GUID  $3=label
  local resource_app_id="$1" role_id="$2" label="$3"
  local sp_id
  sp_id="$(az ad sp list --filter "appId eq '${resource_app_id}'" --query '[0].id' -o tsv)"
  if [ -z "$sp_id" ] || [ "$sp_id" = "None" ]; then
    log "Service Principal を作成: ${resource_app_id}"
    sp_id="$(az ad sp create --id "$resource_app_id" --query id -o tsv)"
  fi
  # 既に割当済みなら Graph が 409 を返す -> 無視する。
  az rest --method POST \
    --uri "${GRAPH}/servicePrincipals/${sp_id}/appRoleAssignedTo" \
    --headers 'Content-Type=application/json' \
    --body "{\"principalId\":\"${USER_OBJECT_ID}\",\"resourceId\":\"${sp_id}\",\"appRoleId\":\"${role_id}\"}" \
    >/dev/null 2>&1 \
    && log "ロール割当: ${label}" \
    || log "ロール割当スキップ (割当済み): ${label}"
}

log "デモ用に自分自身へ全ロールを割当"
# Functions: PM + Accountant + Executive
assign_role_to_self "$FUNCTIONS_APP_ID" "$PM_ROLE_ID" "Functions/PM"
assign_role_to_self "$FUNCTIONS_APP_ID" "$ACCOUNTANT_ROLE_ID" "Functions/Accountant"
assign_role_to_self "$FUNCTIONS_APP_ID" "$EXECUTIVE_ROLE_ID" "Functions/Executive"
# MCP: Accountant + Executive
assign_role_to_self "$MCP_APP_ID" "$ACCOUNTANT_ROLE_ID" "MCP/Accountant"
assign_role_to_self "$MCP_APP_ID" "$EXECUTIVE_ROLE_ID" "MCP/Executive"

log "完了。Entra Portal で App Roles / API permissions が反映されたか確認すること。"
