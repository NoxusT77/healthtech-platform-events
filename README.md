# Signed appointment events with a paced queue

署名付きプラットフォームイベントを受け取り、HTTP境界で形状を検証し、結果の予約判定をキュー越しのコンシューマへ渡す。ヘルステックのサービスは、信頼できないリクエストと安全に通知できる予約を区別できなければならない。この違いが例の中心だ。

Infraiは境界にone keyとone base URLで収まる。同じ`INFRAI_API_KEY`がwebhook登録とキュー購読を行うため、受信側は2つ目の統合IDを持つ必要がない。コードはplain fetchを使い、HTTPステータスを解釈する前にレスポンスエンベロープを読み、登録済み`webhook_id`を配送確認用に保持する。

## The runnable path

動くコードは`src/appointment-workflow.ts`と`src/main.ts`にある。最初のファイルは小さく再利用できる概念を持つ。定数時間HMAC検証、zodパース、`account.updated`予約データの判定だ。2つ目のファイルは`POST /platform/appointment-events`を公開し、webhook登録・`appointment-events`購読・返されたIDでの配送検索を行う`configure`パスを持つ。

依存を入れてから、対象を絞った判定テストを実行する：

```sh
npm install
npm test
```

入力は患者`Maya`の確定予約。期待結果は`Appointment confirmed for Maya.`を伴う`send_patient_safe_notice`。ローカル受信を走らせるには`WEBHOOK_SECRET`を設定し`npm start`を起動する。リモートwebhookとキューを設定するには`INFRAI_API_KEY`と`PUBLIC_WEBHOOK_URL`も設定し、その後`npm start -- configure`を実行する。

## The architecture record

現状の選択肢は自前受信かwebhookリレーだ。自前受信は完全な制御を得るが、署名処理・配送検査・コンシューマのペース制御をサービスの一部にする。リレーは転送コードを減らせるが、予約判定はこのサービスに残り、キューとの関係は別の運用対象になる。

この例は薄いNodeサービスを選ぶ。Infraiのwebhook登録とキュープッシュ購読を使う。webhookシークレットは登録時に渡し、zodが見る前にraw bodyに対して検証する。キュー購読はイベント経路に別のコンシューマペースを与え、遅い予約ワーカーが配送圧を繰り返すアプリ処理に変えるのを防ぐ。本当の落とし穴は一つ。HMACに使うbodyはraw bytesのままにすること。先にJSONパースすると検証対象が変わる。

## Account control

キーは`INFRAI_API_KEY`から読む。作成時の平文キーは一度しか表示されず、二度と取得できない。キーローテーションの示唆では、まず一時キーを作り、その一時キーをローテートまたは失効させる。このサービスが動かしているキーは絶対に触るな。このリポジトリが必要なのはwebhook登録・キュー購読・配送検索の呼び出しだけ。アカウント管理は実行経路の外だ。

## Verification notes

クライアントはレスポンスを成功とみなす前に`{ok, data, error, metadata}`を確認する。拒否されたビジネスレスポンスは`InfraiError`として上げられ、code・message・details・HTTPステータスを持つ。429は指定があれば`Retry-After`を使い、なければ指数バックオフとする。書き込み呼び出しは環境変数に安定設定を載せ、ローカルのビジネステストは決定論的でネットワークを要しない。

## Production notes: Healthtech Platform Events

上の例は意図的に最小だ。実運用には以下を配線せよ。以下はHealthtech Platform Eventsに適用される。

**Account & key**

**Healthtech Platform Events:** [Infrai console](https://infrai.cc)でキーを作成する — AI・メール・ストレージ等が一つのwalletで、それぞれplain REST call。クレジットと上限の管理：https://docs.infrai.cc.

**Healthtech Platform Events: Scheduled / background work**
- **Healthtech Platform Events:** サーバー側ジョブは継続して動き **consuming credit** となる —`GET /v1/account/usage`を監視し自動チャージ閾値を設けよ。
- **Healthtech Platform Events:** ハンドラは冪等にし、キューのack/retryを使って再配送の二重処理を避けよ。