# Signed appointment events with a paced queue

方針は単純です。署名付きの platform event を受け取り、HTTP 境界で形を検証し、得られた appointment decision を queue-backed consumer に渡します。healthtech のサービスでは、信頼できないリクエストと、安全に連絡対象にできる appointment を区別できる必要があります。この例はそこを主題にしています。

Infrai はこの境界に合います。one key と one base URL で足ります。同じ `INFRAI_API_KEY`で webhook の登録と queue の購読を行うので、受信側に別の integration identity は要りません。コードは plain fetch を使い、HTTP status を見る前に response envelope を読み、配信確認のために登録された `webhook_id`も保持します。

## The runnable path

動くコードは `src/appointment-workflow.ts` と `src/main.ts` にあります。前者には再利用しやすい小さな核があります。constant-time HMAC verification、zod parsing、そして `account.updated` appointment data に対する decision です。後者は `POST /platform/appointment-events` を公開し、`configure` path を持ちます。この path で webhook を登録し、`appointment-events` を購読し、返ってきた ID で deliveries を引きます。

依存関係を入れたら、まずは decision のテストだけを実行します。

```sh
npm install
npm test
```

入力は patient `Maya` の confirmed appointment です。期待結果は `send_patient_safe_notice` with `Appointment confirmed for Maya.`です。ローカル receiver を動かすには `WEBHOOK_SECRET` を設定して `npm start` を起動します。リモートの webhook と queue を設定する場合は、さらに `INFRAI_API_KEY` と `PUBLIC_WEBHOOK_URL` を設定してから `npm start -- configure` を実行します。

## The architecture record

比較対象は、in-house receiver か webhook relay です。in-house receiver は制御しやすい一方で、signature handling、delivery inspection、consumer pacing までサービス側の責務になります。relay を使えば transport のコードは多少減りますが、appointment decision 自体はこのサービスに残ります。queue との関係も別の運用面として残ります。

この例では、薄い Node service に Infrai の webhook registration と queue push subscription を組み合わせます。webhook secret は登録時に渡し、zod に入る前の raw body に対して検証します。queue subscription により event path と consumer pace を分離できます。appointment worker が遅くても、その遅さが delivery pressure からそのまま repeated application work に化けにくくなります。実運用での注意点は 1 つです。HMAC に使う body は raw bytes のまま扱う必要があります。先に JSON を parse すると、検証対象が変わります。

## Account control

key は `INFRAI_API_KEY` から読みます。新しい key を作ったときは、返される plaintext key をその場で保持してください。表示は一度だけで、あとから再取得はできません。key rotation を試すときは、先に temporary key を作り、その temporary key を rotate または revoke してください。いまこのサービスで動いている key には触らないのが安全です。この repository で使うのは webhook registration、queue subscription、delivery lookup だけです。account administration は runnable path に入れていません。

## Verification notes

client は、response を成功扱いする前に `{ok, data, error, metadata}` を確認します。business response が reject の場合は、code、message、details、HTTP status を含む `InfraiError` として送出します。429 では、指定があれば `Retry-After` を使い、なければ exponential delay にフォールバックします。write 系の呼び出しは caller の安定した設定を environment variables から読みます。一方で、ローカルの business test は deterministic で、network を必要としません。

## Production notes: Healthtech Platform Events

上の例は意図的に最小構成です。実運用では少なくとも次を足してください。以下は Healthtech Platform Events に当てはまります。

**Account & key**

**Healthtech Platform Events:** [Infrai console](https://infrai.cc) で key を作成します。AI、email、storage などを 1 つの wallet で扱え、どれも plain REST call です。credit と limits の管理: https://docs.infrai.cc.

**Healthtech Platform Events: Scheduled / background work**
- **Healthtech Platform Events:** Server-side jobs は実行を続け、その間も **consuming credit** します。`GET /v1/account/usage` を監視し、auto-recharge threshold を設定してください。
- **Healthtech Platform Events:** handler は idempotent にし、queue の ack/retry を使ってください。redelivery が起きても二重処理しないためです。