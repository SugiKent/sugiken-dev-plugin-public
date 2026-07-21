---
name: 01-mini-sentry-setup
description: "個人開発の Web/モバイル + Node サーバプロジェクトに、Sentry SaaS の代替となる『最小限の自前エラートラッカー（mini-sentry）』を導入するスキル。Express + Prisma + PostgreSQL の server に ingest endpoint を生やし、mobile (Expo / React Native) と server から発生した未捕捉例外を Bearer 認証付き POST で受信・永続化し、新規 fingerprint のみ Discord / Slack webhook に通知する構成をゼロから構築する。「mini-sentry」「ミニセントリー」「自前エラートラッカー」「captureException」「error tracking」「Sentry 代替」「unhandled rejection を拾いたい」「グローバルエラーハンドラ」「Discord webhook でエラー通知」「Slack webhook でエラー通知」「ErrorUtils.setGlobalHandler」「Express の error middleware で Sentry もどき」等の発話・タスク要求時に使用。"
---

# mini-sentry セットアップスキル

個人開発のスケールで、商用 Sentry / Bugsnag を入れるほどではないが「本番のクラッシュを能動的に見に行かないと検知できない」状況を抜け出すための、**最小限の自前エラートラッカー** をゼロから構築するスキル。

server（Express + Prisma + PostgreSQL）に endpoint を 1 本生やすだけで、mobile / server / 将来の web 全部からの未捕捉例外を一元集約し、新規発生時のみ Discord / Slack webhook に通知できる。

---

## 0. 大原則

1. **既存サーバに同居させる**。別 service / 別 infra を増やさない。本体が落ちれば mobile も死ぬので相関は許容できる
2. **ingest 経路は fire-and-forget**。クライアントの応答時間を伸ばさない、サーバの本体機能の latency を増やさない
3. **新規依存は最小限**。server は Zod（既存想定）と Node 標準 `fetch` / `crypto` / `Buffer` のみ。mobile は AsyncStorage + 標準 `fetch` のみ
4. **payload schema を最初に固定**。後方互換は「unknown field は無視」で取る
5. **重複は fingerprint で潰す**。 dedupe window 内に同 fingerprint の通知済みイベントがあれば webhook 連投しない（Slack/Discord の rate limit 対策）
6. **PII は default deny**。`authorization` / `cookie` / `token` / `password` / `api_key` 系の key は自動でマスクし、free-form の文字列は byte 単位で truncate する
7. **環境変数 1 つで機能 off** にできる。ingest token 未設定なら server は 204 を返す、mobile は send 自体しない
8. **mobile はオフライン時に AsyncStorage に FIFO 50 件まで queue**。次回起動 / 復旧時に flush
9. **stack trace は生で保存**。source map による symbolicate / 高度な fingerprint クラスタリングは MVP では不要
10. **既存の SaaS Sentry が入っていても触らない**。並列に走らせて移行判断は別タイミングで

---

## 1. ゴール / 非ゴール

### Goals

- mobile / server で発生した **未捕捉例外** を、ユーザー操作なしで自動的に server に送信し永続化する
- 任意呼び出しの `captureException(error, ctx?)` も提供する（既存 try/catch で握り潰している箇所に追加する想定）
- 同一 fingerprint のイベントは集約し、新規発生時のみ Discord / Slack webhook で通知
- **既存の Postgres を共有** する。migration を 1 か所にまとめる
- **PII を意図せず送信しない**

### Non-Goals

- 閲覧用ダッシュボード（一覧 / 詳細 / 検索）— `psql` または別途
- source map による symbolicate / unminify — 生 stack 保存のみ
- 高度な fingerprint クラスタリング — 単純 hash で十分
- アラート routing / on-call スケジュール — webhook 1 本に流すだけ
- 自動 retention（古いデータ削除）— 別 change で cron を生やす想定

---

## 2. アーキテクチャ概観

```
[mobile RN app]               [server (Express)]
   │                              │
   │  ErrorUtils.setGlobalHandler │  app.use(errorHandler) ← Express error middleware
   │  + AsyncStorage queue         │  + process.on("unhandledRejection")
   │                              │  + process.on("uncaughtException")
   │                              │
   ▼ Bearer token + JSON POST     ▼ 内部呼び出し (captureException)
       POST /v1/errors/ingest ───→ ingestErrorEvent(payload)
                                     │
                                     ├─ Zod schema 検証
                                     ├─ fingerprint = sha1(platform + type + 正規化 stack)
                                     ├─ PII mask + truncate
                                     ├─ INSERT error_events
                                     └─ fire-and-forget: notifyIfNew()
                                                            │
                                                            ├─ 同 fingerprint の notified=true が
                                                            │   dedupe window 内に無ければ
                                                            ├─ Discord / Slack webhook に POST
                                                            └─ notified=true に update
```

---

## 3. データモデル（PostgreSQL / Prisma）

`error_events` テーブル 1 つだけ追加する。`prisma/schema.prisma` に以下を追加:

```prisma
model ErrorEvent {
  id             String   @id
  fingerprint    String
  platform       String   // "mobile" | "server" | "web"
  environment    String   // "production" | "staging" | "development"
  release        String?  // app version or git sha
  level          String   // "error" | "fatal" | "warning"
  message        String
  exceptionType  String   @map("exception_type")
  exceptionValue String   @map("exception_value")
  exceptionStack String   @map("exception_stack")
  context        Json?
  occurredAt     DateTime @map("occurred_at")
  receivedAt     DateTime @default(now()) @map("received_at")
  notified       Boolean  @default(false)
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([fingerprint, receivedAt(sort: Desc)])
  @@index([fingerprint, notified, receivedAt(sort: Desc)])
  @@map("error_events")
}
```

migration を発行:

```bash
pnpm --filter <server-pkg> exec prisma migrate dev --name add_error_events
```

> Prisma は partial index 未対応のため通常 composite index として作成する。dedupe query は十分な性能が出る。

---

## 4. ingest payload schema（client / server の契約）

`apps/server/src/error-tracking/schema.ts` (Zod):

```ts
import { z } from "zod";

export const PLATFORMS = ["mobile", "server"] as const;       // 必要なら "web" 追加
export const ENVIRONMENTS = ["production", "staging", "development"] as const;
export const LEVELS = ["error", "fatal", "warning"] as const;

export const IngestExceptionSchema = z.object({
  type: z.string().min(1).max(256),
  value: z.string().max(64 * 1024),
  stack: z.string().max(64 * 1024),
});

export const IngestContextSchema = z
  .object({
    userId: z.string().max(256).nullable().optional(),
    route: z.string().max(1024).nullable().optional(),
    extra: z.record(z.unknown()).nullable().optional(),
  })
  .partial();

export const IngestPayloadSchema = z.object({
  platform: z.enum(PLATFORMS),
  environment: z.enum(ENVIRONMENTS),
  release: z.string().max(256).nullable().optional(),
  level: z.enum(LEVELS),
  message: z.string().max(8 * 1024),
  exception: IngestExceptionSchema,
  context: IngestContextSchema.nullable().optional(),
  occurredAt: z.string().datetime(),
  sentAt: z.string().datetime().optional(),
});

export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
```

Sentry の event envelope は冗長すぎる。**最小限の field のみ**にとどめ、後方互換は「unknown field は無視」で取る。

---

## 5. fingerprint アルゴリズム（重複判定の核）

`apps/server/src/error-tracking/fingerprint.ts`:

```
fingerprint = sha1(platform | exceptionType | 正規化(stack 1 行目))
```

「正規化」とは:

1. 改行で split し、最初の **空でない行**（最も内側のフレーム）を取る
2. `?...` 形式の query string を除去（bundle hash query 対策）
3. `_[a-f0-9]{8,}` のような **バンドルのハッシュ部分** を除去
4. 数字列を全部 `0` に正規化（行番号 / 列番号の揺れ吸収）
5. trim

これで「同じ場所で起きた同じ型のエラー」が同一 group になる。

詳細実装は `references/server-implementation.md` を見る。

---

## 6. server 実装の構成

`apps/server/src/error-tracking/` 配下に 7 ファイル:

| ファイル | 責務 | 概算行数 |
|---|---|---|
| `schema.ts` | Zod ingest payload schema | 35 |
| `fingerprint.ts` | stack 正規化 + sha1 fingerprint | 25 |
| `pii.ts` | sensitive key mask + UTF-8 safe truncate | 40 |
| `service.ts` | `ingestErrorEvent(payload)` 本体（fingerprint → mask → INSERT → fire-and-forget notify） | 65 |
| `routes.ts` | `POST /v1/errors/ingest` Express router（Bearer 認証 + 64KB cap + feature off 時 204） | 95 |
| `notifier.ts` | `notifyIfNew(event)` + Discord/Slack formatter + Postgres advisory lock | 150 |
| `server-sdk.ts` | `captureException(err, ctx?)` + `attachErrorTracker(app)` + process handlers | 115 |

完全な実装コードは **`references/server-implementation.md`** を参照（**そのまま貼って動く** 状態）。

---

## 7. server を起動コードに統合する

`apps/server/src/index.ts`（Express 起動コード）に以下を追加:

```ts
import { errorTrackingRouter } from "./error-tracking/routes.js";
import { attachErrorTracker } from "./error-tracking/server-sdk.js";

// /v1/errors/* は独自の 64KB 制限付き JSON parser をルート側で持つため、
// グローバル express.json() より前にマウントする
app.use("/v1/errors", errorTrackingRouter);

app.use(express.json());

// ... 他の router ...

// 全 route の後ろに error-handling middleware として装着する
attachErrorTracker(app);
```

**順序が大事**:

1. `errorTrackingRouter` は **`express.json()` より前** にマウント（独自の 64KB cap 付き parser を内包しているため二重に走らせない）
2. `attachErrorTracker(app)` は **全 route 登録後**（Express の error-handling middleware は最後尾でないと前段の throw を拾えない）
3. すでに SaaS Sentry の `Sentry.setupExpressErrorHandler(app)` を使っているなら、**その前** に `attachErrorTracker` を挿入する（Sentry 側にも従来通り渡るように `next(err)` で chain する）

---

## 8. mobile (Expo / React Native) 実装

`apps/mobile/src/error-tracking/index.ts` 1 ファイル、約 280 行。

**コア API**:

```ts
export function initErrorTracker(): void;
export async function captureException(error: unknown, ctx?: CaptureContext): Promise<void>;
```

**実装の要点**:

- 依存は `@react-native-async-storage/async-storage` + 標準 `fetch` のみ。`@sentry/react-native` を入れない
- `ErrorUtils.setGlobalHandler` を装着し、既存 handler を呼んだ後に `captureException` を呼ぶ（チェーン）
- unhandled promise rejection の自動捕捉は **MVP では未実装**（RN の rejection tracking API は Hermes/internals 依存で不安定。catch + 明示 `captureException` で代替）
- オフライン時 / fetch 失敗時は AsyncStorage の `error_tracking:queue` に FIFO 50 件まで保管
- 起動時に queue を flush（fire-and-forget）
- PII masking（sensitive key 自動マスク）と extra 4KB cap
- env 読み取りは **bracket-notation**（`process.env["EXPO_PUBLIC_..."]`）にする。babel-preset-expo の static-inline 変換でハードコードされるのを防ぐ → テストで env を切り替えて no-op 検証ができる

完全な実装コードは **`references/mobile-implementation.md`** を参照。

---

## 9. mobile を `App.tsx` に統合する

```ts
// App.tsx
import { initErrorTracker } from "./src/error-tracking";

initErrorTracker();
```

`App` コンポーネントの宣言より外側 / モジュール top-level で呼ぶ。初期化は idempotent（2 度目以降は no-op）。

---

## 10. 環境変数

### server

| 変数 | 用途 | 未設定時の挙動 |
|---|---|---|
| `ERROR_TRACKING_INGEST_TOKEN` | Bearer 認証用の秘密文字列（推奨: 64 文字以上） | ingest endpoint が 204 を返し、SDK 側も全部 no-op |
| `ERROR_TRACKING_WEBHOOK_URL` | Discord/Slack incoming webhook の URL | 通知が走らない（DB 永続化は走る） |
| `ERROR_TRACKING_WEBHOOK_KIND` | `discord` または `slack` | 通知が走らない |
| `ERROR_TRACKING_DEDUPE_WINDOW_MIN` | 同一 fingerprint の通知抑制窓（分） | 15 分 |

### mobile

| 変数 | 用途 |
|---|---|
| `EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT` | server の `/v1/errors/ingest` の絶対 URL |
| `EXPO_PUBLIC_ERROR_TRACKING_TOKEN` | server の `ERROR_TRACKING_INGEST_TOKEN` と **同じ値** |
| `EXPO_PUBLIC_APP_VERSION` | release 識別子 (optional) |

`.env.example` にも同じ key（dummy 値）を追加し、`.env` から読めるようにする。

---

## 11. webhook 通知の詳細

`notifyIfNew(event)` 内で以下の順:

1. `ERROR_TRACKING_WEBHOOK_URL` / `ERROR_TRACKING_WEBHOOK_KIND` のどちらかが無ければ即 `false` を返す（DB 永続化は走るので機能 off に近い挙動）
2. Postgres の **advisory lock** `pg_advisory_xact_lock(hashtext(fingerprint))` を transaction 内で取る — 同時 ingest 2 本で webhook 2 連発を防ぐ
3. 同 fingerprint で `notified = true` かつ `receivedAt >= now() - dedupe_window` の行が **他に存在するか** チェック
4. 存在すれば `false` を返す（dedupe）
5. 存在しなければ webhook を fetch（3 秒 timeout、`User-Agent: <app-name>/mini-sentry`）
6. 2xx であれば本行を `notified = true` に update
7. webhook 失敗時は `notified` を立てない → 次回の同 fingerprint event がリトライする

### Discord payload

```js
{
  username: "mini-sentry",
  content: `🚨 ${type}: ${message}`,
  embeds: [{
    title: `${platform} / ${environment}`,
    description: "```\n<stack head 3 lines>\n```",
    fields: [
      { name: "release", value: release ?? "(none)", inline: true },
      { name: "fingerprint", value: fingerprint.slice(0, 12), inline: true },
    ],
    timestamp: occurredAt.toISOString(),
  }],
}
```

### Slack payload

```js
{
  text: `🚨 *${type}*: ${message}`,
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: "..." } },
    { type: "section", text: { type: "mrkdwn", text: "```\n<stack>\n```" } },
  ],
}
```

実装の完全版は `references/server-implementation.md` の `notifier.ts` を参照。

---

## 12. PII 保護の方針（default deny）

### 自動 mask する key（case-insensitive）

```
authorization, cookie, set-cookie, token, access_token, refresh_token,
id_token, password, secret, api_key
```

`context.extra` を walk して、これらの key にマッチする値を `"[REDACTED]"` に置換。**ネストした object も再帰**する。

### Truncate

- `message`: 8KB cap
- `exception.value`: 8KB cap
- mobile の `extra` 全体: JSON 化したサイズが 4KB 超えたら `{ truncated: true }` に置換

UTF-8 を **byte 単位で切る** ことで、multi-byte 文字（日本語など）を codepoint 途中で切らないようにする。実装は `Buffer.from(s, "utf-8")` で byte 列にした後、末尾から 1 byte ずつ縮めて `toString("utf-8")` の末尾が `�` でなくなるまで戻すロジック（`references/server-implementation.md` の `pii.ts` 参照）。

### 入れてはいけないもの（client SDK の利用者規約）

`captureException(err, { extra: { ... } })` の extra に以下を入れない:

- 会話履歴 / メッセージ本文
- Y.Doc などの編集中本文
- メールアドレス / 電話番号
- 認証 token / cookie

→ `extra` には **必要最小限のメタ情報のみ**（route 名、操作種別、ID など）を渡す。

---

## 13. 既存 catch 句への `captureException` 注入

mini-sentry は **未捕捉例外** は自動で拾うが、`try/catch + logger.error` で握り潰されている箇所は拾えない。導入後、**意図的に握っている箇所** を grep して `captureException` を 1 行追加する:

```ts
try {
  await flaky();
} catch (error: unknown) {
  logger.error({ event: "..." , err }, "...");
  void captureException(error, { route: "feature.flaky", extra: { ... } });
  // 必要なら再 throw
}
```

**除外する箇所**:

- healthcheck（503 が正常応答）
- 想定内エラー（invalid input, expected race など）
- 既に re-throw して上位 error middleware に届く箇所（二重通知）
- 既に他の analytics（Amplitude `trackClientError` 等）で取れている箇所

**典型的な対象**:

- cron / scheduler 全体 catch
- background job の失敗
- 永続化失敗（DB write, file write）
- 外部 API 連携失敗（mail, webhook, payment）
- WebSocket message handler の例外

---

## 14. テスト戦略（ユニットテスト）

server 5 ファイル、mobile 1 ファイル。**E2E は書かない**（webhook の本物の送信は手動 smoke で確認）。

| テストファイル | 検証内容 |
|---|---|
| `fingerprint.test.ts` | 同一 platform/type/正規化 stack で同 fingerprint、bundle hash / 行番号差は無視 |
| `pii.test.ts` | sensitive key mask、ネスト再帰、UTF-8 safe truncate |
| `routes.test.ts` | 認証 OK/NG、schema 違反 400、64KB 超え 413、token 未設定 204 |
| `notifier.test.ts` | 初出通知 / dedupe / webhook 5xx / fetch 例外 / kind 未設定 |
| `service.test.ts` | mask → fingerprint → INSERT → fire-and-forget notify |
| `captureException.test.ts` (mobile) | Error / 非 Error / 失敗時 queue 追加 / 起動時 flush / endpoint 未設定 no-op / sensitive key redact |

完全なテストコードは **`references/tests.md`** に集約。vitest（server）と jest（mobile）の両方を含む。

---

## 15. ゼロから構築する手順

clean state から導入するときの順序:

1. **Prisma schema に `ErrorEvent` モデルを追加 → migration 発行**（§3 / `references/db-schema.md`）
2. **server 7 ファイルを `apps/server/src/error-tracking/` 配下に配置**（§6 / `references/server-implementation.md`）
3. **`apps/server/src/index.ts` に `app.use("/v1/errors", errorTrackingRouter)` と `attachErrorTracker(app)` を挿入**（§7）
4. **server `.env.example` / `.env` に環境変数 4 つを追加**（§10）
5. **mobile 1 ファイルを `apps/mobile/src/error-tracking/index.ts` に配置**（§8 / `references/mobile-implementation.md`）
6. **`apps/mobile/App.tsx` で `initErrorTracker()` を呼ぶ**（§9）
7. **mobile `.env.example` / `.env` に環境変数 2 つを追加**（§10）
8. **ユニットテスト 6 ファイルを追加して green を確認**（§14 / `references/tests.md`）
9. **既存 catch 句の grep & `captureException` 注入**（§13）
10. **本番環境変数を実値で設定**（server: Railway dashboard、mobile: EAS Secrets / `app.config.ts`）
11. **本番 deploy 後、test event を 1 件発行して webhook が来ることを確認**

最低限の動作確認:

```bash
# server を起動した状態で
curl -X POST http://localhost:3000/v1/errors/ingest \
  -H "Authorization: Bearer $ERROR_TRACKING_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "server",
    "environment": "development",
    "level": "error",
    "message": "smoke",
    "exception": { "type": "Error", "value": "smoke", "stack": "at smoke (a.js:1:1)" },
    "occurredAt": "2026-05-22T12:00:00.000Z"
  }'
# → 202 + { ok: true, id, fingerprint }
# Postgres を見ると error_events に 1 行入っている
# webhook URL 設定済みなら Discord/Slack に通知が来る
```

---

## 16. よくある落とし穴

### 1. `app.use("/v1/errors", router)` を `express.json()` より後に置くと 413 が出ない

`/v1/errors/ingest` の router は **64KB cap 付きの独自 parser** を `router.post("/ingest", express.json({ limit: 64*1024, verify: ... }), ...)` で内包する。グローバル `express.json()` が先に走ると raw body が消費されてしまい、cap が効かない。**必ずグローバル `express.json()` より前**。

### 2. `attachErrorTracker(app)` を route 登録より前に置くと captureException が呼ばれない

Express の error-handling middleware は **`(err, req, res, next) => ...`** の 4 引数で、登録順が後の route での throw / `next(err)` のみを拾える。`attachErrorTracker` は **必ず全 route 登録後** に呼ぶ。

### 3. SaaS Sentry と並列で動かすとき `next(err)` を忘れない

`attachErrorTracker` の error middleware 内で `next(err)` を呼ばないと、後続の Sentry middleware にエラーが届かない。一方で `next(err)` を呼んだ後にレスポンスを書き出すと「headers already sent」が出る。本 SDK の実装は **レスポンスを書き出さず `next(err)` のみ**（Sentry や Express default handler に最終レスポンスを任せる）。

### 4. 401/403 を captureException で拾うと通知が荒れる

API の `unauthorized` / `forbidden` は **クライアントの正常な失敗** であって本番障害ではない。`server-sdk.ts` の error middleware で `status === 401 || status === 403` を skip する。

### 5. mobile の `process.env.EXPO_PUBLIC_*` を直接読むと babel-preset-expo が静的展開してしまう

```ts
// NG: ビルド時に値が固定され、テストで env を差し替えても効かない
const ep = process.env.EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT;

// OK: bracket-notation で動的アクセスを強制
const ep = (process.env as Record<string, string | undefined>)["EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT"];
```

### 6. AsyncStorage の queue が肥大化する

`captureException` が連発する場面（loop 内で例外発生など）で AsyncStorage が肥大化しないよう、**FIFO 50 件 cap** を守る。`items.length > 50` なら古い側を slice で捨てる。

### 7. fingerprint が雑すぎて別エラーが同 group 化される

`add_error_events` 後に webhook を見ながら「異なる原因が同 group になっている」と感じたら、`normalizeStackFrame` の正規化ロジック（パスのハッシュ部分のみ消すか、行番号も消すか）を 1 段階弱める。MVP では「単純さ > 完璧さ」優先。

### 8. webhook 失敗時に `notified = true` を立てない

`postWebhook` が false を返したら **必ず** `notified` を立てない。立ててしまうと次の同 fingerprint event でリトライされず、永久に通知が来ない可能性がある。

### 9. `fire-and-forget` の例外が unhandledRejection になり SDK 自身を再帰呼び出しする

`service.ts` で `void notifyIfNew(...).catch(...)` で必ず catch して `pino` だけに出す。`captureException` 自身もエラーになる可能性があるので、SDK 内部の例外は **絶対に再帰させない**（無限ループ防止）。

### 10. test 内で `process.env` を変更したら afterEach で必ず元に戻す

複数テストが env を踏み合うと flaky になる。`beforeEach` で `originalEnv = { ...process.env }` を保存し、`afterEach` で `process.env = { ...originalEnv }` に戻す（vitest）か、明示的に `delete` する（jest）。

---

## 17. 規模感

server 約 525 行 / mobile 約 280 行 / テスト約 585 行 = **合計 1400 行程度** で機能完結する。Sentry SDK を入れても同等の bundle 増加になるので、「ライブラリ依存を減らす投資」として割が合う。

---

## 18. 参考ディレクトリ

- `references/db-schema.md` — Prisma schema + migration SQL
- `references/server-implementation.md` — server 7 ファイルの完全実装コード
- `references/mobile-implementation.md` — mobile 1 ファイルの完全実装コード
- `references/tests.md` — vitest（server）+ jest（mobile）の完全テストコード

これらをそのままコピーすれば動作する状態にしてある。プロジェクトの命名規約（パッケージ名、import alias、logger の API）に合わせて微調整する。

---

## 19. 将来の拡張ポイント

MVP のスコープを超えるが、後続 change で扱える項目:

- **閲覧ダッシュボード**（`/admin/errors` ルートで一覧 / 詳細 / fingerprint group / search）
- **retention 自動化**（30 日 cron で古い event を delete）
- **source map による symbolicate**（mobile の minified stack を本来の関数名に戻す）
- **fingerprint クラスタリングの高度化**（stack pattern マッチング / 機械学習）
- **rejection tracking の自動化**（mobile の unhandled promise rejection を Hermes 安定後に自動捕捉）
- **alert routing**（特定 fingerprint だけ別 webhook、特定 environment だけ通知など）

これらは全部「load-bearing な MVP の使用感を確かめた後」に判断する。先に作り込まない。
