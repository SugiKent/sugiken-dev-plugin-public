# Unit tests

server は **vitest**, mobile は **jest** を想定したテスト。各テストは「実装の挙動」を独立に検証する。E2E（webhook の本物の送信）は書かない — 手動 smoke で十分。

import パスは `apps/server/tests/error-tracking/*` と `apps/mobile/__tests__/error-tracking/*` を想定。プロジェクトの test path に合わせて読み替える。

---

## 1. `fingerprint.test.ts` (vitest)

```ts
import { describe, expect, it } from "vitest";
import { computeFingerprint, normalizeStackFrame } from "../../src/error-tracking/fingerprint.js";

describe("normalizeStackFrame", () => {
  it("returns the first non-empty line", () => {
    const result = normalizeStackFrame("\n   at Foo (a.js:1:2)\n   at Bar (b.js:3:4)");
    expect(result).toContain("Foo");
    expect(result).not.toContain("Bar");
  });

  it("removes file bundle hashes and numeric runs", () => {
    const a = normalizeStackFrame("at handler (file_abcdef1234.js:42:10)");
    const b = normalizeStackFrame("at handler (file_99887766aa.js:99:1)");
    expect(a).toBe(b);
  });
});

describe("computeFingerprint", () => {
  it("returns the same fingerprint for identical platform/type/normalized stack", () => {
    const a = computeFingerprint({
      platform: "mobile",
      exceptionType: "TypeError",
      stack: "at handler (file_abcdef1234.js:42:10)\n  at next (b.js:1:1)",
    });
    const b = computeFingerprint({
      platform: "mobile",
      exceptionType: "TypeError",
      stack: "at handler (file_99887766aa.js:99:1)\n  at next (b.js:1:1)",
    });
    expect(a).toBe(b);
  });

  it("differs across platform/type", () => {
    const base = { stack: "at handler (a.js:1:1)" };
    const a = computeFingerprint({ platform: "mobile", exceptionType: "TypeError", ...base });
    const b = computeFingerprint({ platform: "server", exceptionType: "TypeError", ...base });
    const c = computeFingerprint({ platform: "mobile", exceptionType: "RangeError", ...base });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("returns 40-char hex (sha1)", () => {
    const fp = computeFingerprint({
      platform: "mobile",
      exceptionType: "Error",
      stack: "at f (a.js:1:1)",
    });
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
  });
});
```

---

## 2. `pii.test.ts` (vitest)

```ts
import { describe, expect, it } from "vitest";
import {
  maskExtra,
  truncateString,
  MAX_EXCEPTION_VALUE_BYTES,
} from "../../src/error-tracking/pii.js";

describe("maskExtra", () => {
  it("redacts known sensitive keys", () => {
    const input = {
      Authorization: "Bearer abc",
      cookie: "sid=xxx",
      password: "p@ss",
      token: "tok",
      API_KEY: "k",
      benign: "ok",
    };
    const out = maskExtra(input)!;
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.API_KEY).toBe("[REDACTED]");
    expect(out.benign).toBe("ok");
  });

  it("recurses into nested objects", () => {
    const out = maskExtra({ nested: { token: "x", keep: 1 } })!;
    expect((out.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).keep).toBe(1);
  });

  it("returns null for nullish input", () => {
    expect(maskExtra(null)).toBeNull();
    expect(maskExtra(undefined)).toBeNull();
  });

  it("is case-insensitive on sensitive keys", () => {
    const out = maskExtra({ AUTHORIZATION: "x", cOoKiE: "y" })!;
    expect(out.AUTHORIZATION).toBe("[REDACTED]");
    expect(out.cOoKiE).toBe("[REDACTED]");
  });
});

describe("truncateString", () => {
  it("returns input unchanged when under limit", () => {
    expect(truncateString("hello", 100)).toBe("hello");
  });

  it("truncates and appends sentinel when over limit", () => {
    const long = "a".repeat(MAX_EXCEPTION_VALUE_BYTES * 2);
    const out = truncateString(long, MAX_EXCEPTION_VALUE_BYTES);
    expect(Buffer.byteLength(out, "utf-8")).toBeLessThanOrEqual(MAX_EXCEPTION_VALUE_BYTES);
    expect(out.endsWith("… [truncated]")).toBe(true);
  });

  it("handles multi-byte characters without breaking codepoints", () => {
    const jp = "日本語".repeat(2000);
    const out = truncateString(jp, MAX_EXCEPTION_VALUE_BYTES);
    expect(Buffer.byteLength(out, "utf-8")).toBeLessThanOrEqual(MAX_EXCEPTION_VALUE_BYTES);
    expect(out).not.toMatch(/�/);
  });
});
```

---

## 3. `routes.test.ts` (vitest, supertest 不要)

実 server を `app.listen(0)` で起動して `fetch` で叩く。

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

const { ingestMock } = vi.hoisted(() => ({ ingestMock: vi.fn() }));

vi.mock("../../src/error-tracking/service.js", () => ({
  ingestErrorEvent: ingestMock,
}));

vi.mock("../../src/db.js", () => ({ prisma: {} }));

import { errorTrackingRouter } from "../../src/error-tracking/routes.js";

let server: http.Server;
let baseUrl: string;
const originalEnv = { ...process.env };

beforeAll(async () => {
  const app = express();
  app.use("/v1/errors", errorTrackingRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  process.env = originalEnv;
});

beforeEach(() => {
  ingestMock.mockReset();
  process.env.ERROR_TRACKING_INGEST_TOKEN = "test-token";
});

afterEach(() => {
  vi.clearAllMocks();
});

function validPayload(): Record<string, unknown> {
  return {
    platform: "mobile",
    environment: "production",
    level: "error",
    message: "boom",
    exception: { type: "TypeError", value: "boom", stack: "at f (a.js:1:1)" },
    occurredAt: "2026-05-22T12:00:00.000Z",
    sentAt: "2026-05-22T12:00:00.500Z",
  };
}

describe("POST /v1/errors/ingest", () => {
  it("returns 202 for a valid payload with correct token", async () => {
    ingestMock.mockResolvedValue({ id: "evt-1", fingerprint: "f" });
    const res = await fetch(`${baseUrl}/v1/errors/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(202);
    expect(ingestMock).toHaveBeenCalledOnce();
  });

  it("returns 401 when token is missing or wrong", async () => {
    const missing = await fetch(`${baseUrl}/v1/errors/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload()),
    });
    expect(missing.status).toBe(401);

    const wrong = await fetch(`${baseUrl}/v1/errors/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body: JSON.stringify(validPayload()),
    });
    expect(wrong.status).toBe(401);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("returns 400 when payload is missing required fields", async () => {
    const res = await fetch(`${baseUrl}/v1/errors/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ platform: "mobile" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; fields: string[] };
    expect(body.ok).toBe(false);
    expect(body.fields.length).toBeGreaterThan(0);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("returns 413 when payload exceeds 64KB", async () => {
    const huge = validPayload();
    huge.exception = {
      type: "Error",
      value: "x",
      stack: "at f (a.js:1:1)\n" + "padding".repeat(70_000),
    };
    const res = await fetch(`${baseUrl}/v1/errors/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify(huge),
    });
    expect(res.status).toBe(413);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("returns 204 when feature is off (token unset)", async () => {
    delete process.env.ERROR_TRACKING_INGEST_TOKEN;
    const res = await fetch(`${baseUrl}/v1/errors/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(204);
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
```

---

## 4. `notifier.test.ts` (vitest)

Prisma を **手動 mock** する。`$transaction(fn)` を `fn(inner)` でそのまま実行する fake で十分。

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@prisma/client";

const { findFirstMock, updateMock, executeRawUnsafeMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  updateMock: vi.fn().mockResolvedValue({}),
  executeRawUnsafeMock: vi.fn().mockResolvedValue(1),
}));

vi.mock("../../src/db.js", () => {
  const inner = {
    errorEvent: { findFirst: findFirstMock, update: updateMock },
    $executeRawUnsafe: executeRawUnsafeMock,
  };
  return {
    prisma: {
      ...inner,
      $transaction: (
        fn: (tx: typeof inner) => unknown,
        _opts?: { timeout?: number },
      ): Promise<unknown> => Promise.resolve(fn(inner)),
    },
  };
});

import {
  notifyIfNew,
  formatDiscordPayload,
  formatSlackPayload,
} from "../../src/error-tracking/notifier.js";

const originalEnv = { ...process.env };
const fetchSpy = vi.fn();

beforeEach(() => {
  findFirstMock.mockReset();
  updateMock.mockReset().mockResolvedValue({});
  executeRawUnsafeMock.mockReset().mockResolvedValue(1);
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  process.env.ERROR_TRACKING_WEBHOOK_URL = "https://hooks.example/abc";
  process.env.ERROR_TRACKING_WEBHOOK_KIND = "discord";
  process.env.ERROR_TRACKING_DEDUPE_WINDOW_MIN = "15";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  const base: ErrorEvent = {
    id: "evt-1",
    fingerprint: "f-1",
    platform: "server",
    environment: "production",
    release: "1.0.0",
    level: "error",
    message: "boom",
    exceptionType: "TypeError",
    exceptionValue: "boom",
    exceptionStack:
      "at handler (a.js:1:1)\nat next (b.js:2:2)\nat last (c.js:3:3)\nat extra (d.js:4:4)",
    context: null,
    occurredAt: new Date("2026-05-22T12:00:00.000Z"),
    receivedAt: new Date("2026-05-22T12:00:00.000Z"),
    notified: false,
    createdAt: new Date("2026-05-22T12:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

describe("notifyIfNew", () => {
  it("posts to the webhook and marks notified for a first-time fingerprint", async () => {
    findFirstMock.mockResolvedValue(null);
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
    const ok = await notifyIfNew(makeEvent());
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { notified: true },
    });
  });

  it("does not notify within dedupe window if a prior notified event exists", async () => {
    findFirstMock.mockResolvedValue({ id: "prev" });
    const ok = await notifyIfNew(makeEvent());
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not mark notified when webhook returns 5xx", async () => {
    findFirstMock.mockResolvedValue(null);
    fetchSpy.mockResolvedValue({ ok: false, status: 500 });
    const ok = await notifyIfNew(makeEvent());
    expect(ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("swallows fetch exceptions and returns false", async () => {
    findFirstMock.mockResolvedValue(null);
    fetchSpy.mockRejectedValue(new Error("network down"));
    const ok = await notifyIfNew(makeEvent());
    expect(ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when webhook URL or kind is missing", async () => {
    delete process.env.ERROR_TRACKING_WEBHOOK_URL;
    expect(await notifyIfNew(makeEvent())).toBe(false);
    process.env.ERROR_TRACKING_WEBHOOK_URL = "https://hooks.example/abc";
    process.env.ERROR_TRACKING_WEBHOOK_KIND = "unknown";
    expect(await notifyIfNew(makeEvent())).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("payload formatters", () => {
  it("Discord payload includes username, content, and a stack-bearing embed", () => {
    const out = formatDiscordPayload(makeEvent());
    expect(out.username).toBe("mini-sentry");
    expect(String(out.content)).toContain("TypeError");
    const embeds = out.embeds as Array<{ description: string }>;
    const first = embeds[0];
    if (!first) throw new Error("missing embed");
    expect(first.description).toContain("handler");
    expect(first.description).toContain("… (truncated)");
  });

  it("Slack payload includes text and blocks", () => {
    const out = formatSlackPayload(makeEvent());
    expect(String(out.text)).toContain("TypeError");
    expect(Array.isArray(out.blocks)).toBe(true);
  });
});
```

---

## 5. `service.test.ts` (vitest)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, notifyMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  notifyMock: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../src/db.js", () => ({
  prisma: { errorEvent: { create: createMock } },
}));

vi.mock("../../src/error-tracking/notifier.js", () => ({
  notifyIfNew: notifyMock,
}));

import { ingestErrorEvent } from "../../src/error-tracking/service.js";

describe("ingestErrorEvent", () => {
  beforeEach(() => {
    createMock.mockReset();
    notifyMock.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("masks sensitive context.extra, truncates message, computes fingerprint, then inserts", async () => {
    createMock.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: args.data.id, ...args.data, receivedAt: new Date() }),
    );

    const longMessage = "x".repeat(20_000);
    await ingestErrorEvent({
      platform: "mobile",
      environment: "production",
      release: "1.0.0",
      level: "error",
      message: longMessage,
      exception: { type: "TypeError", value: "boom", stack: "at f (a.js:1:1)" },
      context: {
        userId: "u1",
        route: "/page",
        extra: { Authorization: "Bearer secret", keep: 1 },
      },
      occurredAt: "2026-05-22T12:00:00.000Z",
    });

    expect(createMock).toHaveBeenCalledOnce();
    const call = createMock.mock.calls[0];
    if (!call) throw new Error("create not called");
    const args = call[0] as { data: Record<string, unknown> };
    expect(args.data.platform).toBe("mobile");
    expect(args.data.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(args.data.exceptionType).toBe("TypeError");
    expect((args.data.message as string).length).toBeLessThan(longMessage.length);
    const context = args.data.context as { extra: Record<string, unknown> };
    expect(context.extra.Authorization).toBe("[REDACTED]");
    expect(context.extra.keep).toBe(1);
  });

  it("calls notifyIfNew after insert (fire-and-forget)", async () => {
    createMock.mockResolvedValue({ id: "id-1", fingerprint: "f", notified: false });
    await ingestErrorEvent({
      platform: "server",
      environment: "production",
      level: "error",
      message: "m",
      exception: { type: "Error", value: "v", stack: "s" },
      occurredAt: "2026-05-22T12:00:00.000Z",
    });
    await new Promise((r) => setImmediate(r));
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it("does not throw when notifier rejects", async () => {
    createMock.mockResolvedValue({ id: "id-1", fingerprint: "f", notified: false });
    notifyMock.mockRejectedValue(new Error("webhook down"));
    await expect(
      ingestErrorEvent({
        platform: "server",
        environment: "production",
        level: "error",
        message: "m",
        exception: { type: "Error", value: "v", stack: "s" },
        occurredAt: "2026-05-22T12:00:00.000Z",
      }),
    ).resolves.toBeTruthy();
  });
});
```

---

## 6. `captureException.test.ts` (mobile / jest)

```ts
/* eslint-disable @typescript-eslint/no-require-imports */
const mockAsyncStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockAsyncStore.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockAsyncStore.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockAsyncStore.delete(key);
      return Promise.resolve();
    }),
  },
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

describe("mobile captureException", () => {
  const QUEUE_KEY = "error_tracking:queue";
  // Bracket-notation env access bypasses babel-preset-expo's static inline of EXPO_PUBLIC_*.
  const ENDPOINT_KEY = "EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT";
  const TOKEN_KEY = "EXPO_PUBLIC_ERROR_TRACKING_TOKEN";
  const env = (): Record<string, string | undefined> => process.env;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockAsyncStore.clear();
    fetchSpy = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    env()[ENDPOINT_KEY] = "https://api.example/v1/errors/ingest";
    env()[TOKEN_KEY] = "tok";
  });

  afterEach(() => {
    delete env()[ENDPOINT_KEY];
    delete env()[TOKEN_KEY];
  });

  it("posts an Error to the configured endpoint", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 202 });
    const { captureException } = require("../../src/error-tracking");
    await captureException(new Error("boom"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.example/v1/errors/ingest");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.platform).toBe("mobile");
    expect(body.exception.type).toBe("Error");
    expect(body.exception.value).toBe("boom");
  });

  it("wraps non-Error throws without crashing", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 202 });
    const { captureException } = require("../../src/error-tracking");
    await expect(captureException("plain string")).resolves.toBeUndefined();
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.exception.value).toBe("plain string");
  });

  it("queues to AsyncStorage when fetch fails", async () => {
    fetchSpy.mockRejectedValue(new Error("offline"));
    const { captureException } = require("../../src/error-tracking");
    await captureException(new Error("boom"));
    const raw = mockAsyncStore.get(QUEUE_KEY);
    expect(raw).toBeTruthy();
    const items = JSON.parse(raw as string);
    expect(items).toHaveLength(1);
    expect(items[0].exception.value).toBe("boom");
  });

  it("flushes queued items on init", async () => {
    mockAsyncStore.set(
      QUEUE_KEY,
      JSON.stringify([
        {
          platform: "mobile",
          environment: "production",
          release: null,
          level: "error",
          message: "queued",
          exception: { type: "Error", value: "queued", stack: "s" },
          context: null,
          occurredAt: "2026-05-22T12:00:00.000Z",
          sentAt: "2026-05-22T12:00:00.000Z",
        },
      ]),
    );
    fetchSpy.mockResolvedValue({ ok: true, status: 202 });
    const { initErrorTracker, __internal } = require("../../src/error-tracking");
    __internal.resetForTests();
    initErrorTracker();
    await new Promise<void>((r) => setImmediate(() => r()));
    await new Promise<void>((r) => setImmediate(() => r()));
    expect(fetchSpy).toHaveBeenCalled();
    expect(mockAsyncStore.has(QUEUE_KEY)).toBe(false);
  });

  it("is a no-op when endpoint or token is missing", async () => {
    delete env()[ENDPOINT_KEY];
    const { captureException } = require("../../src/error-tracking");
    await captureException(new Error("boom"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("redacts sensitive extra keys", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 202 });
    const { captureException } = require("../../src/error-tracking");
    await captureException(new Error("boom"), {
      extra: { authorization: "Bearer secret", keep: 1 },
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.context.extra.authorization).toBe("[REDACTED]");
    expect(body.context.extra.keep).toBe(1);
  });
});
```

---

## テスト戦略の要点

### 1. Prisma は in-memory mock で十分

`$transaction(fn)` を `fn(inner)` で同期実行する fake は、本機能が advisory lock を取った後にやることが「findFirst → fetch → update」だけなので realistic に表現できる。実 DB を立てる必要がない。

### 2. env は `beforeEach` で set し `afterEach` で復元

複数テストが同 process で走るとき env を踏み合うと flaky になる。**必ず `originalEnv = { ...process.env }` を保存 → `afterEach` で `process.env = { ...originalEnv }`**。

### 3. mobile では `jest.resetModules()` で module キャッシュをクリア

`initialized` 等の module-level state が前テストから漏れないようにする。`__internal.resetForTests()` も合わせて呼ぶ。

### 4. webhook の本物の送信は手動 smoke で確認

local で server を起動 → `ERROR_TRACKING_WEBHOOK_URL` を Discord の test webhook URL に設定 → `curl` で test event を 1 件 ingest → Discord に通知が来るかを目視。

```bash
curl -X POST http://localhost:3000/v1/errors/ingest \
  -H "Authorization: Bearer $ERROR_TRACKING_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "server",
    "environment": "development",
    "level": "error",
    "message": "smoke test",
    "exception": { "type": "Error", "value": "smoke test", "stack": "at smoke (a.js:1:1)" },
    "occurredAt": "2026-05-22T12:00:00.000Z"
  }'
```

dedupe 確認は同じ payload を 2 回送って 2 通目に通知が来ないことを確認する。
