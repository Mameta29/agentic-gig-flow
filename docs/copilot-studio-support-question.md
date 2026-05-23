# Copilot Studio サポート質問（2026-05-23 送信）

ハッカソンの Microsoft エンジニア窓口に送った質問と、こちらで確認済みの事実の記録。
回答が来たらこのファイルに追記する。

## 症状

`https://copilotstudio.microsoft.com/` にログインするとホーム画面が永続的にローディングのまま進まない。
トライアルのサインアップ自体は完了し「作業の開始」ボタンまで到達するが、押下後もローディングのまま。

## ブラウザコンソールの主要エラー（本質）

```
GET https://powervamg.jp-il101.gateway.prod.island.powerapps.com/api/botmanagement/v2/environments/Default-3894eada-7a32-44e1-9c8b-6098a6a92a2d/viral-signup/create/status
→ 404 (Not Found)
```

CSP の unsafe-eval 違反は report-only のため無害と判断。

## 確認済みの事実（すべて正常）

- テナント: `3894eada-7a32-44e1-9c8b-6098a6a92a2d`（MAMETAZK.onmicrosoft.com）
- ライセンス: `mameta@MAMETAZK.onmicrosoft.com`（GA）に `CCIBOTS_PRIVPREV_VIRAL` 割当済み。
  テナントの subscribedSkus でも `CCIBOTS_PRIVPREV_VIRAL` が 10000 席 Enabled。
- Power Platform 既定環境: `MAMETA (default)` / provisioningState=Succeeded / region=japaneast / sku=Default
- ログインは上記 GA（ゲストではない）。

## 試したこと（すべて同症状）

- シークレット（プライベート）ウィンドウ
- ブラウザキャッシュクリア
- 数分待っての再読込

## 聞いたこと

1. viral-signup/create/status の 404 の意味と解消法。
2. 既定環境が japaneast であることが影響するか。別リージョンの環境を作るべきか。
3. このトライアルライセンスでホームを開くためにテナント側で追加で有効化すべき設定はあるか。

## 回答（来たら追記）

（待ち）
