# pbi-gigflow-monthly — Power BI report specification

Build this in Power BI Desktop, then publish to Fabric workspace `ws-gigflow`.

## Pages

### Page 1: サマリ
- KPI card: 累計 JPYC 支払 (`TotalPayments`)
- KPI card: 当月支払 (`SettledPayments` filtered by current month)
- Bar: 当月 vs 前月
- Line: 月次推移 (last 12 months)

### Page 2: 受注者別
- Top-10 ranking table (by `TotalPayments` per `workerGithubLogin`)
- Map (when `accounts.worker.countryCode` is mirrored separately, optional for v1)

### Page 3: パイプライン
- Funnel: counts by status (created → settled → bookkept)
- Histogram: AvgLeadTimeHours per worker
- Table: orders with lead time > 14 days (anomaly)

### Page 4: 経理サポート
- Card: WithholdingTotal
- Table: orders where `bookkeepingArtifacts.needsHumanReview = TRUE`
- Button: download CSV (Power BI export)

## Theme

- Accent: Microsoft blue + JPYC pink (`#FF3D8A`)
- All pages display "最終更新: <last refresh ts>"

## Sharing

- Publish as App: `gigflow-executive-app`
- Audience: tenant users with role `Executive`
- RLS role: `TenantIsolation` (see `../fabric/rls.dax`)
