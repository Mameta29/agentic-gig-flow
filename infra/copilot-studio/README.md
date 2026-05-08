# Copilot Studio assets

Copilot Studio は GUI で構築するため、ここにあるのは「GUI で再現するための仕様」+ Adaptive Card テンプレ + Topic 構成図です。実装手順は `docs/08-copilot-studio.md` を参照。

## ファイル

- `agent.yaml` — Agent (gigflow) のメタ情報
- `topics/order-create.yaml` — `OrderCreate` Topic の構成
- `topics/order-status.yaml` — `OrderStatus` Topic の構成
- `topics/monthly-report.yaml` — `MonthlyReport` Topic の構成
- `cards/order-confirmation.json` — 発注確認 Adaptive Card
- `cards/order-completed.json` — 発注完了 Adaptive Card
- `cards/bookkeeping-completion.json` — 経理完了 Adaptive Card

## 利用方法

Copilot Studio に手動で打ち込む際にこれらの YAML/JSON をコピペ参照する。`packages/functions/src/lib/cards.ts` のテンプレと同じ構造を保つこと。
