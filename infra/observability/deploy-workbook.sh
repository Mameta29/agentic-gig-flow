#!/usr/bin/env bash
#
# deploy-workbook.sh — gigflow-workbook.json を Azure Monitor Workbook として配置する。
# docs/12-deployment-guide.md Step 8-2 の「KQL を Application Insights に貼る」を置き換える。
#
# 前提: az login 済み / Step 2-6 で Application Insights (ai-gigflow-xxxxxx) 作成済み
#
# 使い方:
#   RG=rg-gigflow-prod APPI_NAME=ai-gigflow-xxxxxx ./infra/observability/deploy-workbook.sh

set -euo pipefail

RG="${RG:-rg-gigflow-prod}"
LOCATION="${LOCATION:-japaneast}"
WORKBOOK_NAME="${WORKBOOK_NAME:-gigflow-business-dashboard}"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\033[1;34m[workbook]\033[0m %s\n' "$*"; }

# Application Insights を解決 (未指定なら RG 内の最初の1件)
if [ -z "${APPI_NAME:-}" ]; then
  APPI_NAME="$(az monitor app-insights component show \
    --resource-group "$RG" --query '[0].name' -o tsv)"
fi
APPI_ID="$(az monitor app-insights component show \
  --app "$APPI_NAME" --resource-group "$RG" --query id -o tsv)"
log "Application Insights: ${APPI_NAME}"

# Workbook は名前が GUID 必須。名前を deterministic な GUID にして冪等化する。
WORKBOOK_GUID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
EXISTING="$(az resource list \
  --resource-group "$RG" \
  --resource-type microsoft.insights/workbooks \
  --query "[?tags.gigflow=='dashboard'].name" -o tsv 2>/dev/null || true)"
if [ -n "$EXISTING" ]; then
  WORKBOOK_GUID="$EXISTING"
  log "既存 Workbook を更新: ${WORKBOOK_GUID}"
else
  log "新規 Workbook を作成: ${WORKBOOK_GUID}"
fi

SERIALIZED="$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read()))' \
  "${HERE}/gigflow-workbook.json")"

az resource create \
  --resource-group "$RG" \
  --resource-type microsoft.insights/workbooks \
  --name "$WORKBOOK_GUID" \
  --location "$LOCATION" \
  --properties "$(cat <<JSON
{
  "displayName": "${WORKBOOK_NAME}",
  "serializedData": ${SERIALIZED},
  "category": "workbook",
  "sourceId": "${APPI_ID}",
  "version": "Notebook/1.0"
}
JSON
)" \
  --tags gigflow=dashboard

log "完了。Azure Portal > Application Insights > Workbooks で確認すること。"
