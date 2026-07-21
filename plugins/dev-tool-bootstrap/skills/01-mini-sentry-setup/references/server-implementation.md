# Server implementation (Express + Prisma + PostgreSQL)

`apps/server/src/error-tracking/` 配下の 7 ファイル。プロジェクトの import alias や logger を差し替えれば **そのまま動く** 状態。

このリファレンスは server スタックを **Express + Prisma + PostgreSQL + Zod** と想定する。他のフレームワーク（Fastify, Hono, NestJS）に移植する場合は §6 と §7 の入出力を読み替える。

---

## 1. `schema.ts` — Zod ingest payload schema

```ts
import { z } from "zod";

export const PLATFORMS = ["mobile", "server"] as const;
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
export type IngestContext = z.infer<typeof IngestContextSchema>;
```

---

## 2. `fingerprint.ts` — stack 正規化 + sha1

```ts
import { createHash } from "node:crypto";

const PATH_HASH_PATTERN = /[._-][a-f0-9]{8,}\b/gi;
const NUMERIC_RUN_PATTERN = /\d+/g;
const BUNDLE_HASH_QUERY = /\?[^):\s]*/g;

export function normalizeStackFrame(rawStack: string): string {
  const firstLine =
    rawStack
      .split("\n")
      .map((s) => s.trim())
      .find((l) => l.length > 0) ?? "";
  return firstLine
    .replace(BUNDLE_HASH_QUERY, "")
    .replace(PATH_HASH_PATTERN, "")
    .replace(NUMERIC_RUN_PATTERN, "0")
    .trim();
}

export function computeFingerprint(input: {
  platform: string;
  exceptionType: string;
  stack: string;
}): string {
  const normalized = normalizeStackFrame(input.stack);
  const material = `${input.platform}|${input.exceptionType}|${normalized}`;
  return createHash("sha1").update(material).digest("hex");
}
```

### 正規化の意図

- `BUNDLE_HASH_QUERY = /\?[^):\s]*/g` — Webpack / Metro が付ける `?hash=abc123` を消す
- `PATH_HASH_PATTERN = /[._-][a-f0-9]{8,}\b/gi` — `chunk-abc12345.js` のような **バンドルのハッシュ部分** を消す（リリース間で別のハッシュになるので、消さないと別 fingerprint になる）
- `NUMERIC_RUN_PATTERN = /\d+/g` — 行番号 `:42:10` を `:0:0` に。コード追加 / リファクタで行番号がずれても同 fingerprint になる

stack の **1 行目のみ** を使うのは「最も内側のフレーム = 最終的に throw された場所」を識別子にする方針。stack 全体を使うと、呼び出し元の差で別 fingerprint になりがち。

---

## 3. `pii.ts` — sensitive key mask + UTF-8 safe truncate

```ts
const REDACTED_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret|api[_-]?key)$/i;

const EXTRA_TRUNCATED_SENTINEL = "… [truncated]";

export const MAX_EXCEPTION_VALUE_BYTES = 8 * 1024;
export const MAX_MESSAGE_BYTES = 8 * 1024;

export function maskExtra(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_KEY_PATTERN.test(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = maskExtra(value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function truncateString(value: string, maxBytes: number): string {
  // Byte-aware truncation using Buffer to avoid splitting multi-byte characters mid-codepoint.
  const buf = Buffer.from(value, "utf-8");
  if (buf.byteLength <= maxBytes) return value;
  const sliceBytes = Math.max(
    0,
    maxBytes - Buffer.byteLength(EXTRA_TRUNCATED_SENTINEL, "utf-8"),
  );
  let end = sliceBytes;
  while (end > 0) {
    const candidate = buf.subarray(0, end).toString("utf-8");
    if (!candidate.endsWith("�")) {
      return `${candidate}${EXTRA_TRUNCATED_SENTINEL}`;
    }
    end -= 1;
  }
  return EXTRA_TRUNCATED_SENTINEL;
}
```

`truncateString` は UTF-8 を **byte 単位で切る** が、multi-byte 文字を codepoint 途中で切ると末尾に `�` (= `�`) が現れる。これが消えるまで 1 byte ずつ縮める。

---

## 4. `service.ts` — `ingestErrorEvent(payload)`

```ts
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";       // プロジェクトの Prisma client export
import { logger } from "../logger.js";   // プロジェクトの logger
import { computeFingerprint } from "./fingerprint.js";
import {
  MAX_EXCEPTION_VALUE_BYTES,
  MAX_MESSAGE_BYTES,
  maskExtra,
  truncateString,
} from "./pii.js";
import type { IngestPayload } from "./schema.js";
import { notifyIfNew } from "./notifier.js";

export async function ingestErrorEvent(
  payload: IngestPayload,
): Promise<{ id: string; fingerprint: string }> {
  const fingerprint = computeFingerprint({
    platform: payload.platform,
    exceptionType: payload.exception.type,
    stack: payload.exception.stack,
  });

  const maskedExtra = payload.context?.extra ? maskExtra(payload.context.extra) : null;

  const contextInput: Prisma.InputJsonValue | typeof Prisma.JsonNull = payload.context
    ? ({
        userId: payload.context.userId ?? null,
        route: payload.context.route ?? null,
        extra: maskedExtra,
      } as Prisma.InputJsonValue)
    : Prisma.JsonNull;

  const id = randomUUID();
  const created = await prisma.errorEvent.create({
    data: {
      id,
      fingerprint,
      platform: payload.platform,
      environment: payload.environment,
      release: payload.release ?? null,
      level: payload.level,
      message: truncateString(payload.message, MAX_MESSAGE_BYTES),
      exceptionType: payload.exception.type,
      exceptionValue: truncateString(payload.exception.value, MAX_EXCEPTION_VALUE_BYTES),
      exceptionStack: payload.exception.stack,
      context: contextInput,
      occurredAt: new Date(payload.occurredAt),
    },
  });

  // fire-and-forget; failures must not affect the ingest response.
  void notifyIfNew(created).catch((error: unknown) => {
    logger.warn(
      {
        event: "error_tracking.notify_failed",
        err: error instanceof Error ? error.message : String(error),
      },
      "notifyIfNew failed",
    );
  });

  return { id: created.id, fingerprint };
}
```

`notifyIfNew` は **必ず** `.catch()` で握る。`captureException` 自身が SDK 内部で例外を出すと無限ループになるため。

---

## 5. `routes.ts` — `POST /v1/errors/ingest`

```ts
import { Router, type Request, type Response, type NextFunction } from "express";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../logger.js";
import { IngestPayloadSchema } from "./schema.js";
import { ingestErrorEvent } from "./service.js";

const MAX_BODY_BYTES = 64 * 1024;

function getIngestToken(): string | null {
  const raw = process.env.ERROR_TRACKING_INGEST_TOKEN;
  return raw && raw.length > 0 ? raw : null;
}

function isAuthorized(req: Request): boolean {
  const token = getIngestToken();
  if (!token) return false;
  const header = req.headers.authorization;
  if (typeof header !== "string") return false;
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match || !match[1]) return false;
  // Use timingSafeEqual to avoid leaking the token byte-by-byte through compare timing.
  const provided = Buffer.from(match[1], "utf-8");
  const expected = Buffer.from(token, "utf-8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

const router = Router();

// 64KB raw body limit; verify can be used to set a strict cap before JSON parse.
router.post(
  "/ingest",
  express.json({
    limit: MAX_BODY_BYTES,
    verify: (_req, _res, buf) => {
      if (buf.length > MAX_BODY_BYTES) {
        const err = new Error("payload too large") as Error & { statusCode?: number };
        err.statusCode = 413;
        throw err;
      }
    },
  }),
  async (req: Request, res: Response, _next: NextFunction) => {
    // Feature off: no-op 204 so the client does not retry-storm.
    if (!getIngestToken()) {
      res.status(204).end();
      return;
    }

    if (!isAuthorized(req)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const parsed = IngestPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join("."));
      res.status(400).json({ ok: false, error: "invalid_payload", fields });
      return;
    }

    try {
      const result = await ingestErrorEvent(parsed.data);
      res.status(202).json({ ok: true, id: result.id, fingerprint: result.fingerprint });
    } catch (error: unknown) {
      logger.error(
        {
          event: "error_tracking.ingest_failed",
          err: error instanceof Error ? error.message : String(error),
        },
        "ingestErrorEvent threw",
      );
      res.status(500).json({ ok: false, error: "internal" });
    }
  },
);

// Express body-parser raises PayloadTooLargeError; convert to 413.
router.use(
  (
    err: Error & { statusCode?: number; type?: string },
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (err.statusCode === 413 || err.type === "entity.too.large") {
      res.status(413).json({ ok: false, error: "payload_too_large" });
      return;
    }
    next(err);
  },
);

export const errorTrackingRouter = router;
```

### 設計のポイント

- **Bearer token 比較は `timingSafeEqual`**: 普通の `===` だと文字列の先頭から match byte 数で時間が変わり、token を 1 byte ずつ推測されるリスクがある（timing attack）
- **`express.json({ limit, verify })` で 64KB cap**: グローバル `express.json()` より先に router を mount するので、ここでだけ 64KB を効かせる
- **token 未設定で 204**: 503 にすると client がリトライ嵐になる。204 No Content にすることで「正常に飲んだ風」を返し、機能 off にできる
- **413 ハンドラを router 内で持つ**: body-parser が throw する `PayloadTooLargeError` は default だと 500 になりがち。router 内の error middleware で `413` に変換

---

## 6. `notifier.ts` — webhook 通知 + dedupe + advisory lock

```ts
import type { ErrorEvent } from "@prisma/client";
import { prisma } from "../db.js";
import { logger } from "../logger.js";

export type WebhookKind = "discord" | "slack";

const DEFAULT_DEDUPE_WINDOW_MIN = 15;

function getDedupeWindowMs(): number {
  const raw = process.env.ERROR_TRACKING_DEDUPE_WINDOW_MIN;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEDUPE_WINDOW_MIN;
  return minutes * 60 * 1000;
}

function getWebhookKind(): WebhookKind | null {
  const raw = (process.env.ERROR_TRACKING_WEBHOOK_KIND ?? "").toLowerCase();
  if (raw === "discord" || raw === "slack") return raw;
  return null;
}

function getStackHead(stack: string, limit: number): string {
  return stack.split("\n").slice(0, limit).join("\n");
}

export function formatDiscordPayload(event: ErrorEvent): Record<string, unknown> {
  const stack = getStackHead(event.exceptionStack, 3);
  const suffix = event.exceptionStack.split("\n").length > 3 ? "\n… (truncated)" : "";
  return {
    username: "mini-sentry",
    content: `🚨 ${event.exceptionType}: ${event.message}`,
    embeds: [
      {
        title: `${event.platform} / ${event.environment}`,
        description: `\`\`\`\n${stack}${suffix}\n\`\`\``,
        fields: [
          { name: "release", value: event.release ?? "(none)", inline: true },
          { name: "fingerprint", value: event.fingerprint.slice(0, 12), inline: true },
        ],
        timestamp: event.occurredAt.toISOString(),
      },
    ],
  };
}

export function formatSlackPayload(event: ErrorEvent): Record<string, unknown> {
  const stack = getStackHead(event.exceptionStack, 3);
  const suffix = event.exceptionStack.split("\n").length > 3 ? "\n… (truncated)" : "";
  return {
    text: `🚨 *${event.exceptionType}*: ${event.message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${event.exceptionType}*: ${event.message}\n\`${event.platform}\` / \`${event.environment}\` / release: \`${event.release ?? "(none)"}\``,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`\n${stack}${suffix}\n\`\`\`` },
      },
    ],
  };
}

const WEBHOOK_FETCH_TIMEOUT_MS = 3_000;

async function postWebhook(url: string, body: Record<string, unknown>): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "mini-sentry/1.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn(
        { event: "error_tracking.webhook_failed", status: res.status },
        "webhook returned non-2xx",
      );
      return false;
    }
    return true;
  } catch (error: unknown) {
    logger.warn(
      {
        event: "error_tracking.webhook_exception",
        err: error instanceof Error ? error.message : String(error),
      },
      "webhook fetch threw",
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function notifyIfNew(event: ErrorEvent): Promise<boolean> {
  const webhookUrl = process.env.ERROR_TRACKING_WEBHOOK_URL;
  const kind = getWebhookKind();
  if (!webhookUrl || !kind) return false;

  const windowStart = new Date(Date.now() - getDedupeWindowMs());
  const payload = kind === "discord" ? formatDiscordPayload(event) : formatSlackPayload(event);

  // Serialize same-fingerprint contests via a Postgres advisory lock held for the
  // transaction's duration. The lock prevents two concurrent ingests from both passing
  // the "no prior notified" check and double-firing the webhook.
  return await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        event.fingerprint,
      );
      const existing = await tx.errorEvent.findFirst({
        where: {
          fingerprint: event.fingerprint,
          notified: true,
          receivedAt: { gte: windowStart },
          id: { not: event.id },
        },
        select: { id: true },
      });
      if (existing) return false;

      const ok = await postWebhook(webhookUrl, payload);
      if (!ok) return false; // notified stays false; another event can retry next time.

      await tx.errorEvent.update({
        where: { id: event.id },
        data: { notified: true },
      });
      return true;
    },
    { timeout: WEBHOOK_FETCH_TIMEOUT_MS + 2_000 },
  );
}
```

### `pg_advisory_xact_lock` の使い方

Postgres の **transaction-scoped advisory lock** を `hashtext(fingerprint)` で取る。同じ fingerprint で同時 ingest 2 本が走ると、両方が「他に notified=true なし」を通過し、webhook が 2 連発する race condition がある。advisory lock を取ることで同 fingerprint の判定処理を直列化する。

`hashtext` は Postgres 標準関数で text → int4。advisory lock は `(bigint)` または `(int, int)` 形式しか取れないため `hashtext` で int4 に変換する。

transaction の timeout を `WEBHOOK_FETCH_TIMEOUT_MS + 2_000` に設定して、webhook が固まっても lock を 5 秒以上保持しないようにする。

### webhook 失敗時の挙動

- `postWebhook` が false（network 例外 / 5xx）→ `notified` を立てず return false
- 次回同 fingerprint で再ingest が来たら、また `notifyIfNew` 走る → 再試行できる
- 立ててしまうと「失敗を成功扱いして永久に通知されない」事故になる

---

## 7. `server-sdk.ts` — `captureException` + `attachErrorTracker`

```ts
import type { Express, NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";
import { ingestErrorEvent } from "./service.js";
import { maskExtra } from "./pii.js";
import type { IngestPayload } from "./schema.js";

export interface CaptureContext {
  userId?: string | null;
  route?: string | null;
  extra?: Record<string, unknown> | null;
}

function isEnabled(): boolean {
  const token = process.env.ERROR_TRACKING_INGEST_TOKEN;
  return Boolean(token && token.length > 0);
}

function getEnvironment(): IngestPayload["environment"] {
  const env = (process.env.NODE_ENV ?? "development").toLowerCase();
  if (env === "production") return "production";
  if (env === "staging") return "staging";
  return "development";
}

function getRelease(): string | null {
  // Railway / Render / Heroku に応じて優先順を変える。
  return (
    process.env.SENTRY_RELEASE ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GIT_SHA ??
    null
  );
}

function toErrorLike(input: unknown): { type: string; value: string; stack: string } {
  if (input instanceof Error) {
    return {
      type: input.name || "Error",
      value: input.message || String(input),
      stack: input.stack ?? "",
    };
  }
  const wrapped = new Error(
    typeof input === "string" ? input : `Non-error thrown: ${String(input)}`,
  );
  return {
    type: wrapped.name || "Error",
    value: wrapped.message,
    stack: wrapped.stack ?? "",
  };
}

export async function captureException(
  error: unknown,
  ctx?: CaptureContext,
): Promise<void> {
  if (!isEnabled()) return;
  try {
    const exception = toErrorLike(error);
    const payload: IngestPayload = {
      platform: "server",
      environment: getEnvironment(),
      release: getRelease(),
      level: "error",
      message: exception.value,
      exception,
      context: ctx
        ? {
            userId: ctx.userId ?? null,
            route: ctx.route ?? null,
            extra: ctx.extra ? maskExtra(ctx.extra) : null,
          }
        : null,
      occurredAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    };
    await ingestErrorEvent(payload);
  } catch (err: unknown) {
    logger.warn(
      {
        event: "error_tracking.capture_failed",
        err: err instanceof Error ? err.message : String(err),
      },
      "captureException failed",
    );
  }
}

let processHandlersAttached = false;

function attachProcessHandlers(): void {
  if (processHandlersAttached) return;
  processHandlersAttached = true;

  process.on("unhandledRejection", (reason: unknown) => {
    void captureException(reason, { route: "process:unhandledRejection" });
  });
  process.on("uncaughtException", (err: Error) => {
    void captureException(err, { route: "process:uncaughtException" });
  });
}

export function attachErrorTracker(app: Express): void {
  attachProcessHandlers();

  app.use(
    (
      err: Error & { statusCode?: number },
      req: Request,
      _res: Response,
      next: NextFunction,
    ) => {
      const status = err.statusCode ?? 500;
      // 401/403 はクライアント側の正常な失敗。通知しない。
      if (status === 401 || status === 403) {
        next(err);
        return;
      }
      void captureException(err, {
        route: `${req.method} ${req.path}`,
        extra: {
          requestId: (req as Request & { id?: string }).id ?? null,
          statusCode: status,
        },
      });
      next(err);
    },
  );
}
```

### Express の error-handling middleware の制約

4 引数 `(err, req, res, next)` で書かないと Express が error handler として認識しない。引数を 1 つでも減らすと **普通の middleware として動いてしまい、throw された err を受け取れない**。

`next(err)` を呼ぶことで:

1. 後続の error handler（例: SaaS Sentry の `Sentry.setupExpressErrorHandler`）に chain できる
2. Express default error handler が最終 response を書き出す

このため `attachErrorTracker` 内では **レスポンスを書き出さない**（headers already sent を防ぐ）。

### `process.on` の重複登録防止

`attachProcessHandlers` は module-level の `processHandlersAttached` flag で 2 度目以降を no-op にする。テストで `attachErrorTracker(app)` を何度も呼んでも handler が増殖しない。

### `getRelease` の優先順

```
SENTRY_RELEASE > RAILWAY_GIT_COMMIT_SHA > GIT_SHA > null
```

deploy platform に応じて自動で git sha を拾える。手動で `SENTRY_RELEASE` を設定すれば override 可能。

---

## 8. 起動コードへの統合

`apps/server/src/index.ts` （または equivalent）:

```ts
import express from "express";
import { errorTrackingRouter } from "./error-tracking/routes.js";
import { attachErrorTracker } from "./error-tracking/server-sdk.js";

const app = express();

// CORS / helmet 等の共通 middleware ...

// 重要: 独自 64KB cap parser を内包しているので express.json() より前にマウント
app.use("/v1/errors", errorTrackingRouter);

app.use(express.json());

// アプリの routes
app.use("/api/users", usersRouter);
app.use("/api/posts", postsRouter);
// ...

// 全 route 登録後、最後に error handler として装着
attachErrorTracker(app);

const server = app.listen(port, () => {
  logger.info({ port }, "server listening");
});
```

順序の理由は SKILL.md §16 「よくある落とし穴」1, 2 を参照。
