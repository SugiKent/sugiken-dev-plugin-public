---
name: 01-fastify-dev-error-logging
description: "個人開発プロジェクトで Fastify + pino サーバを書くときに、dev 環境で 4xx / 5xx の原因（リクエスト body / 失敗 field / スタック）を 1 行ログで追えるようにするためのスキル。「Fastify」「pino」「error logging」「validation error」「safeParse」「reply.code(400)」「dev_error_response」「validationDetails」「oRPC」「devErrorLog」「観測性」「observability」等の発話・タスク要求時に使用。基盤（pino redact / dev フック / oRPC 連携）と、ルート側の書き方規約（throw する設計）の両輪を提供する。"
---

# Fastify dev エラーログ基盤スキル

個人開発で Fastify + pino サーバを書くときに、 **dev で 4xx / 5xx が出た原因を 1 行ログで即座に追える** 基盤を作るためのスキル。

そもそも素の Fastify は 4xx を返してもログに `statusCode` と `url` ぐらいしか出ない。`safeParse` で zod に弾かれても、ログ層からは「何 field が何で落ちたか」が見えない。1 度仕掛けを入れておけば、以降のデバッグループが激減する。

このスキルは:
- **基盤**（pino redact / dev 専用フック / oRPC 連携）の作り方
- **ルート側の書き方規約**（throw する設計に揃える）

の両方をカバーする。片方だけ入れても効かない（基盤だけ入れて `reply.code(400)` を使い続けると、ログは空のまま）ことを最初に理解する。

---

## 0. 大原則

1. **dev では 4xx / 5xx ごとに 1 行 JSON ログを吐く**（200 系は本機能では何も追加しない）
2. ログには `requestId / method / url / statusCode / responseTime / query / requestBody / errorMessage / errorStack / validationDetails` を載せる
3. **production では何も追加しない**（ログ量・PII リスクを増やさない。Sentry に任せる）
4. **redact paths は宣言で書く**。各ハンドラで個別 sanitize しない（漏れの元）
5. **ルート側は zod 失敗時に必ず throw する**。`reply.code(400).send(...)` で握りつぶさない

---

## 1. 基盤側: `lib/logger.ts` に redact + LOG_FILE を入れる

pino の `redact` オプションで sensitive field を宣言的にマスクする。`LOG_FILE` で stdout + file の両方に流す導線も用意。

```ts
// apps/server/src/lib/logger.ts
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { type DestinationStream, destination, multistream, pino } from "pino";

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.token",
  "req.body.code",
  "req.body.verificationCode",
  "req.body.email",
  "requestBody.password",
  "requestBody.token",
  "requestBody.code",
  "requestBody.verificationCode",
  "requestBody.email",
  "*.password",
  "*.token",
  "*.verificationCode",
];

const REDACT_CONFIG = { paths: REDACT_PATHS, censor: "[REDACTED]" };

const cache = new Map<string, FastifyBaseLogger>();
let cachedRoot: FastifyBaseLogger | null = null;
let fileWarnEmitted = false;

function buildDestination(): DestinationStream | undefined {
  const logFile = process.env.LOG_FILE;
  if (!logFile || logFile.trim().length === 0) return undefined;
  try {
    const dir = dirname(logFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fileDest = destination({ dest: logFile, sync: false, mkdir: true });
    const stdoutDest = destination({ dest: 1, sync: false });
    return multistream([{ stream: stdoutDest }, { stream: fileDest }]);
  } catch (e) {
    if (!fileWarnEmitted) {
      fileWarnEmitted = true;
      console.warn(`[logger] LOG_FILE=${logFile} 書き込み失敗、stdout のみで継続`, e);
    }
    return undefined;
  }
}

function getRootLogger(): FastifyBaseLogger {
  if (cachedRoot) return cachedRoot;
  const base = { redact: REDACT_CONFIG } as const;
  const dest = buildDestination();
  if (dest) {
    cachedRoot = pino(base, dest);
  } else if (process.env.NODE_ENV === "production") {
    cachedRoot = pino(base);
  } else {
    cachedRoot = pino({
      ...base,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
      },
    });
  }
  return cachedRoot;
}

export function getLogger(name: string): FastifyBaseLogger {
  const c = cache.get(name);
  if (c) return c;
  const child = getRootLogger().child({ name });
  cache.set(name, child);
  return child;
}
```

**ポイント**:

- **戻り型を `FastifyBaseLogger` で明示する**。これを怠ると `Fastify({ loggerInstance: getLogger(...) })` が pino の `Logger` 型を推論して、既存の `registerXxx(app: FastifyInstance)` 群（`FastifyBaseLogger` 期待）と型衝突する（後述）
- `pino-pretty` transport は `multistream` と併用できない。`LOG_FILE` 指定時は dev でも JSON 出力にフォールバックする
- `LOG_FILE` の書き込み失敗は warn 1 度出して stdout のみで継続（起動を妨げない）

---

## 2. 基盤側: `plugins/devErrorLog.ts` で 4xx/5xx 専用フックを足す

dev 限定の 5 つのフック (`onRequest` / `preHandler` / `onError` / `onSend` / `onResponse`) で詳細ログを組み立てる。

```ts
// apps/server/src/plugins/devErrorLog.ts
import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";

export type DevErrorStore = {
  errorMessage?: string;
  errorStack?: string;
  validationDetails?: unknown;
};

declare module "fastify" {
  interface FastifyRequest {
    _devErrorStore?: DevErrorStore;
    _devCapturedBody?: unknown;
  }
}

const SENSITIVE_KEYS = new Set([
  "password", "token", "code", "verificationCode", "email", "authorization", "cookie",
]);
const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

export function registerDevErrorLog(app: FastifyInstance): void {
  if (process.env.NODE_ENV === "production") return;

  app.addHook("onRequest", async (req) => {
    req._devErrorStore = {};
  });

  // oRPC は contentTypeParser で body を JSON.parse せず string で受ける。
  // preHandler 時点で sanitize して保持しておけば、後段で redact 済みの object として読める。
  app.addHook("preHandler", async (req) => {
    if (req.body !== undefined && req._devCapturedBody === undefined) {
      req._devCapturedBody = sanitizeBody(req.body);
    }
  });

  // setErrorHandler は Sentry の setupFastifyErrorHandler が使うので、
  // 上書きしないよう onError で読み取りのみ行う。
  app.addHook("onError", async (req, _reply, error) => {
    captureError(req, error);
  });

  // oRPC のエラー応答は errorHandler を発火させずに reply.send で完結する。
  // onSend なら payload を覗けるので、ここで JSON からエラー情報を抽出する。
  app.addHook("onSend", async (req, reply, payload) => {
    if (reply.statusCode < 400) return payload;
    if (!req.url.startsWith("/api/rpc/")) return payload;
    extractOrpcErrorIntoStore(req, payload);
    return payload;
  });

  app.addHook("onResponse", async (req, reply) => {
    const status = reply.statusCode;
    if (status < 400) return;
    const store = req._devErrorStore ?? {};
    const payload = {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: status,
      responseTime: reply.elapsedTime,
      query: req.query,
      requestBody: req._devCapturedBody ?? sanitizeBody(req.body),
      ...(store.errorMessage ? { errorMessage: store.errorMessage } : {}),
      ...(store.errorStack ? { errorStack: store.errorStack } : {}),
      ...(store.validationDetails !== undefined
        ? { validationDetails: store.validationDetails }
        : {}),
    };
    const level = status >= 500 ? "error" : "warn";
    req.log[level](payload, "dev_error_response");
  });
}

function captureError(req: FastifyRequest, error: FastifyError | Error): void {
  const store: DevErrorStore = req._devErrorStore ?? {};
  store.errorMessage = error.message;
  if (error.stack !== undefined) store.errorStack = error.stack;
  const fe = error as FastifyError & { validation?: unknown };
  if (fe.validation) store.validationDetails = fe.validation;
  const issues = (error as { issues?: unknown }).issues;
  if (issues !== undefined) store.validationDetails = issues;
  req._devErrorStore = store;
}

function extractOrpcErrorIntoStore(req: FastifyRequest, payload: unknown): void {
  let text: string | null = null;
  if (typeof payload === "string") text = payload;
  else if (Buffer.isBuffer(payload)) text = payload.toString("utf8");
  if (text === null) return;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return; }
  if (typeof parsed !== "object" || parsed === null) return;
  const root = parsed as Record<string, unknown>;
  const obj = (root.json as Record<string, unknown> | undefined) ?? root;
  const store: DevErrorStore = req._devErrorStore ?? {};
  if (typeof obj.message === "string" && !store.errorMessage) {
    store.errorMessage = obj.message;
  }
  if (store.validationDetails === undefined) {
    if ((obj.data as { issues?: unknown } | undefined)?.issues !== undefined) {
      store.validationDetails = (obj.data as { issues: unknown }).issues;
    } else if (obj.data !== undefined) {
      store.validationDetails = obj.data;
    }
  }
  req._devErrorStore = store;
}

// pino redact paths の wildcard は 1 階層分しか効かない。
// deep clone + 再帰 redact で 2 階層以上にも対応する。
function sanitizeBody(body: unknown): unknown {
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return sanitizeBody(JSON.parse(trimmed)); } catch { return body; }
    }
    return body;
  }
  return sanitize(body, 0);
}

function sanitize(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : sanitize(v, depth + 1);
  }
  return out;
}
```

**ポイント**:

- pino の `redact.paths` の wildcard (`*.password`) は **1 階層分しか効かない**。`{ user: { credentials: { password } } }` 等の 2 階層以上は素通り。**deep clone + 再帰 redact** で補う
- oRPC の body は `addContentTypeParser({ parseAs: "string" })` で **string** になるので、`sanitizeBody` 内で `JSON.parse` を試みる
- `setErrorHandler` を呼ばない（Sentry の `setupFastifyErrorHandler` と衝突するため）。読み取りは `onError` だけで十分
- `reply.payload` は public API ではないので使わない。oRPC エラーは `onSend` の `payload` 引数から取る

---

## 3. 基盤側: `plugins/orpc.ts` で body を保持する

oRPC は handler 内で `reply.send` を完結させるので、ハンドラ呼び出し前に body を保持しておかないと `onResponse` 時点で参照できない。

```ts
// apps/server/src/plugins/orpc.ts
import { RPCHandler } from "@orpc/server/fastify";
import type { FastifyInstance } from "fastify";
import { router } from "../orpc/router";

const handler = new RPCHandler(router);

export async function registerOrpc(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  app.all("/api/rpc/*", async (req, reply) => {
    // preHandler フックで sanitizeBody が走るので追加で何もしなくてよい。
    const { matched } = await handler.handle(req, reply, { prefix: "/api/rpc", context: {} });
    if (!matched) reply.status(404).send({ error: "Not Found" });
  });
}
```

**注意**: `addContentTypeParser` は **グローバル適用** される。oRPC plugin を register したあと、Fastify ルートで `req.body` を読むと object ではなく **string** になる。プロジェクト規約として oRPC は `/api/rpc/*` の prefix で完全分離する前提にし、他の Fastify ルートではこの contentTypeParser の影響を念頭に置く（必要なら scoped に register する）。

---

## 4. 基盤側: `app.ts` で組み立てる

```ts
// apps/server/src/app.ts
import Fastify, { type FastifyInstance } from "fastify";
import { getLogger } from "./lib/logger";
import { registerDevErrorLog } from "./plugins/devErrorLog";
import { registerOrpc } from "./plugins/orpc";
import { setupSentry } from "./plugins/sentry";

export async function buildApp(): Promise<FastifyInstance> {
  // getLogger は FastifyBaseLogger を返すので、loggerInstance に渡しても
  // FastifyInstance のデフォルト型と齟齬が出ない。
  const app: FastifyInstance = Fastify({
    loggerInstance: getLogger("server"),
  });
  setupSentry(app); // Sentry の errorHandler を先に登録
  registerDevErrorLog(app); // dev フックを後から追加（共存可能）
  // ... 他の register
  await registerOrpc(app);
  return app;
}
```

**ポイント**:

- **Sentry を先、devErrorLog を後**。`setupFastifyErrorHandler` は `setErrorHandler` で error を捕捉するが、devErrorLog は `onError` フックなので両者は共存できる
- `loggerInstance` に pino 由来のオブジェクトを渡すと、`getLogger` の戻り型が `pino.Logger` のままだと **Fastify が pino の Logger 型を推論してしまい、`FastifyBaseLogger` 期待の register 関数群と型衝突する**。`getLogger` の戻り型を `FastifyBaseLogger` で明示することで回避する。`as unknown as FastifyInstance` のような二段キャストは型穴になるので避ける

---

## 5. ルート側規約: zod 失敗は throw する（必須）

ここが最重要。基盤を入れても **ルート側がこの書き方をしないと `validationDetails` は永遠に出ない**。

### ❌ NG パターン（dev ログが空になる）

```ts
scoped.post("/api/auth/request", async (req, reply) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: "invalid_input" });
    return;
  }
  // ...
});
```

問題:

1. `parsed.error.issues` を捨てている
2. `throw` していないので `onError` フックが発火しない
3. dev ログには `statusCode: 400` と `requestBody` しか出ない。「どの field が何で落ちたか」が永遠に分からない

### ✅ OK パターン: 共通ヘルパー `parseBodyOrThrow`

```ts
// apps/server/src/lib/validate.ts
import type { ZodSchema } from "zod";

export function parseBodyOrThrow<T>(schema: ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const err = new Error("invalid_input") as Error & {
      statusCode: number;
      validation: unknown;
    };
    err.statusCode = 400;
    err.validation = parsed.error.issues;
    throw err;
  }
  return parsed.data;
}
```

呼び出し側:

```ts
scoped.post("/api/auth/request", async (req, reply) => {
  const { email, inviteCode } = parseBodyOrThrow(requestSchema, req.body);
  // ...
});
```

throw すると:

- Fastify が `err.statusCode` を読んで自動で 400 を返す
- `devErrorLog` の `onError` が `err.validation` を `validationDetails` として積む
- `onResponse` で `errorMessage` / `validationDetails` 入りの 1 行 JSON が出る

### 業務的 400 は warn を 1 行残す

「validation は通ったが業務ロジック上 400」（exclusivity 違反 / rate limit など）は `reply.code(400)` でも OK だが、 **何で落としたかをハンドラ側で 1 行 warn する** こと:

```ts
if (hasInvite === hasAdmission) {
  req.log.warn(
    { reason: "exclusivity_violation", hasInvite, hasAdmission },
    "validation_fail",
  );
  reply.code(400).send({ error: "invalid_input" });
  return;
}
```

---

## 6. テストで検証する観点

ユニットテストで以下を最低限カバーする（vitest + `app.inject` で書ける）:

| シナリオ | 期待 |
|---|---|
| dev で `safeParse + throw` 経路に不正 body を送る | `level: 40`, `statusCode: 400`, `requestBody`, `errorMessage`, `validationDetails` が出る |
| dev で 500 を返すルート（`throw new Error("boom")`） | `level: 50`, `errorMessage: "boom"`, `errorStack` が出る |
| dev で `GET /api/health` で 200 を返す | `dev_error_response` 行が **出ない** |
| `NODE_ENV=production` で 400 を出す | `dev_error_response` 行が **出ない** |
| oRPC ルートに zod 失敗ペイロード | `requestBody` が **object** で sensitive field が `[REDACTED]`、`validationDetails` 入り |
| ネストした sensitive field（`{ user: { credentials: { password } } }`） | 全 sensitive 値が JSON 全体に出現しない |
| `LOG_FILE` 指定 → file に書き込まれる | ファイル内容に同じ JSON 行 |
| `LOG_FILE` 無効パス → fallback | 起動が継続、例外で落ちない |

**重要**: ルートを `reply.code(400).send(...)` の握りつぶしパターンと throw パターンの **両方** でテストする。`safeParse + reply.code(400)` を使うルートでは `validationDetails` が出ないことを **わざと確認する** テストを 1 件入れておくと、誰かが基盤に不要な改修を入れたときに気付ける。

---

## 7. ドキュメント

`docs/howToDevelopment/logging.md` に以下を必ず書く:

1. 出力フィールドの一覧（`requestId / method / url / statusCode / requestBody / errorMessage / errorStack / validationDetails`）
2. redact paths の一覧と「新規 sensitive field は `REDACT_PATHS` に追加（ハンドラで個別 sanitize しない）」
3. `LOG_FILE` の使い方（`tail -f` 用途、`.gitignore` 注意）
4. **ルート実装側の前提**: `parseBodyOrThrow` パターンと NG パターンを並べて、`safeParse + reply.code(400)` が validationDetails を消すことを明示
5. oRPC ルートは throw 不要（onSend 経由で別 path）

---

## 8. アンチパターン集（書く前に思い出す）

- ❌ `reply.code(400).send({ error: "..." })` で zod issues を捨てる
- ❌ ハンドラごとに `sanitizeForLog(body)` を呼ぶ運用（漏れの元。`REDACT_PATHS` 一元化で対処）
- ❌ `app.setErrorHandler` を `devErrorLog` で使う（Sentry と衝突）
- ❌ `reply.payload` を読む（public API ではない。`onSend` の引数で取る）
- ❌ `Fastify({ loggerInstance })` の戻り値を `as unknown as FastifyInstance` でキャスト
- ❌ `pino-pretty` transport と `multistream` の併用（動かない。`LOG_FILE` 指定時は JSON にフォールバック）
- ❌ pino redact の wildcard `*.password` だけで深いネストを期待する（1 階層しか効かない）
- ❌ `addContentTypeParser` を意識せず oRPC plugin を register したあとに Fastify ルートで `req.body` を object として扱う（string になっている）
- ❌ 「テストパスしたから動く」と判断して dev での実環境動作確認をスキップする（throw していないルートでフックが空振りしているのに気付けない）

---

## 9. 適用順序のチェックリスト

新規 Fastify プロジェクトで本スキルを適用する順序:

1. `pino` を依存に追加（既にあれば skip）
2. `lib/logger.ts` を §1 の形で書く（`REDACT_PATHS` / `LOG_FILE` / `getLogger`）
3. `plugins/devErrorLog.ts` を §2 の形で新規作成
4. `plugins/orpc.ts`（oRPC を使う場合）に `addContentTypeParser` だけ追加。詳細ログは devErrorLog 側が拾う
5. `app.ts` で `getLogger` → `Fastify({ loggerInstance })` → `setupSentry` → `registerDevErrorLog` の順で組み立て
6. `lib/validate.ts` に `parseBodyOrThrow` を新規作成
7. **既存ルートを `parseBodyOrThrow` で書き換える**（基盤だけ入れても効かないことを忘れない）
8. テスト 8 項目（§6）を vitest で書く
9. `docs/howToDevelopment/logging.md` を §7 で書く
10. `pnpm dev` 起動 → `curl -X POST .../some-route -d '{"email": 123}'` で実環境動作確認（**ここを必ずやる**）

10 番のステップを省くと、テスト 100% パスでも実環境で「ログがスカスカで何も読めない」状態に陥る。実体験。
