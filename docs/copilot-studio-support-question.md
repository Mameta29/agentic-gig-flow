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

## 回答（2026-05-27・解決済み）

Microsoft の Geek Fujiwara 氏より回答。**真因は「既定環境(default)で Copilot Studio を使おうとしていた」こと**。
viral-signup（トライアル自動サインアップ）は既定環境では正しくプロビジョニングされず 404 になる。
→ **専用の「開発者環境」を作ればよい**（既定環境での Copilot Studio 利用は非推奨）。

参考: https://learn.microsoft.com/ja-jp/microsoft-copilot-studio/environments-first-run-experience

### 解決手順（実証済み）
1. https://aka.ms/ppac （Power Platform 管理センター）で**開発者環境を新規作成**。
   - Add Dataverse = **Yes**（必須。これが無いとエージェント作成に進めない）
   - Deploy sample apps and data = No、Language/Currency は任意（日本語/JPY 推奨）
2. https://make.powerapps.com/ で作成した開発者環境を選択。
3. 詳細 > エージェント > 新しいエージェント作成（または Copilot Studio 直接でもこの環境なら可）。

### 結果
**開発者環境 `dev-jpn-a523bcd3` で Copilot Studio のホーム画面（"What would you like to build?"）が正常に開いた。**
viral-signup 404 は完全に消滅。これで Agent（発注 UI）の構築に進める。
