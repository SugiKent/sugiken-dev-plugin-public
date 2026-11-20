# Mobile implementation (Expo / React Native)

`apps/mobile/src/error-tracking/index.ts` の 1 ファイルで完結する。

依存:
- `@react-native-async-storage/async-storage` （オフライン queue 用）
- 標準 `fetch`
- RN グローバルの `ErrorUtils`
- プロジェクト側 logger（任意。`console.warn` でも可）

`@sentry/react-native` 等の SDK は **入れない**。

---

## 完全な実装コード

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { logger } from "../lib/logger";   // プロジェクトの logger or console

const QUEUE_STORAGE_KEY = "error_tracking:queue";
const QUEUE_MAX_LENGTH = 50;
const EXTRA_MAX_BYTES = 4 * 1024;

const REDACTED_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret|api[_-]?key)$/i;

type Level = "error" | "fatal" | "warning";

export interface CaptureContext {
  userId?: string | null;
  route?: string | null;
  extra?: Record<string, unknown> | null;
}

interface IngestPayload {
  platform: "mobile";
  environment: "production" | "staging" | "development";
  release: string | null;
  level: Level;
  message: string;
  exception: { type: string; value: string; stack: string };
  context: {
    userId: string | null;
    route: string | null;
    extra: Record<string, unknown> | null;
  } | null;
  occurredAt: string;
  sentAt: string;
}

let initialized = false;

function maskExtraValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskExtraValue);
  if (value && typeof value === "object") {
    return maskExtra(value as Record<string, unknown>);
  }
  return value;
}

function maskExtra(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = maskExtraValue(value);
  }
  return out;
}

function byteLengthUtf8(s: string): number {
  // Simple UTF-8 byte length without depending on TextEncoder / Buffer types,
  // both of which are inconsistently available across RN engines.
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // surrogate pair → 4 bytes in UTF-8; skip the low surrogate.
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function clampExtra(
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!extra) return null;
  const masked = maskExtra(extra);
  const serialized = JSON.stringify(masked);
  if (serialized && byteLengthUtf8(serialized) > EXTRA_MAX_BYTES) {
    return { truncated: true };
  }
  return masked;
}

// Use bracket-notation reads so babel-preset-expo's static-inline transform doesn't
// hard-bake values into the bundle. This keeps env reads truly dynamic, which the
// test suite relies on to assert no-op behavior when env is cleared.
const ENV_ENDPOINT = "EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT";
const ENV_TOKEN = "EXPO_PUBLIC_ERROR_TRACKING_TOKEN";

function getEndpoint(): string | null {
  const raw = (process.env as Record<string, string | undefined>)[ENV_ENDPOINT];
  return raw && raw.length > 0 ? raw : null;
}

function getToken(): string | null {
  const raw = (process.env as Record<string, string | undefined>)[ENV_TOKEN];
  return raw && raw.length > 0 ? raw : null;
}

function isEnabled(): boolean {
  return Boolean(getEndpoint() && getToken());
}

function getEnvironment(): IngestPayload["environment"] {
  if (__DEV__) return "development";
  // EAS の release channel が staging のとき staging を返す判定は将来追加。
  return "production";
}

function getRelease(): string | null {
  return (process.env.EXPO_PUBLIC_APP_VERSION as string | undefined) ?? null;
}

function toExceptionLike(input: unknown): { type: string; value: string; stack: string } {
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

function buildPayload(
  error: unknown,
  ctx?: CaptureContext,
  level: Level = "error",
): IngestPayload {
  const exception = toExceptionLike(error);
  return {
    platform: "mobile",
    environment: getEnvironment(),
    release: getRelease(),
    level,
    message: exception.value,
    exception,
    context: ctx
      ? {
          userId: ctx.userId ?? null,
          route: ctx.route ?? `${Platform.OS}`,
          extra: clampExtra(ctx.extra ?? null),
        }
      : null,
    occurredAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
  };
}

interface QueueEntry { id: number; payload: IngestPayload }
let queueTail: Promise<unknown> = Promise.resolve();
let nextQueueId = 0;
let flushInFlight: Promise<void> | null = null;

// 同一 JS runtime 内の storage 更新だけを直列化する。通信待ちはここに入れない。
function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueTail.then(operation);
  queueTail = result.catch(() => undefined);
  return result;
}

async function readQueue(): Promise<QueueEntry[]> {
  const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("invalid error queue");
  // 旧形式（payload 配列）も読める。flush は送信前に ID 付きで保存する。
  const used = new Set<number>();
  for (const item of parsed) {
    if (item && typeof item === "object" && "id" in item) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0 || used.has(item.id)) throw new Error("invalid queue id");
      used.add(item.id);
      nextQueueId = Math.max(nextQueueId, item.id);
    }
  }
  return parsed.map((item) => {
    const payload = item && typeof item === "object" && "id" in item ? item.payload : item;
    if (!payload || payload.platform !== "mobile" || typeof payload.message !== "string") throw new Error("invalid queue payload");
    const id = item && typeof item === "object" && "id" in item ? item.id : allocateQueueId();
    return { id, payload: payload as IngestPayload };
  });
}

function allocateQueueId(): number {
  if (!Number.isSafeInteger(nextQueueId + 1)) throw new Error("queue id exhausted");
  return ++nextQueueId;
}

async function writeQueue(items: QueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
}

async function enqueue(payload: IngestPayload): Promise<void> {
  await withQueueLock(async () => {
    const items = await readQueue();
    items.push({ id: allocateQueueId(), payload });
    await writeQueue(items.slice(-QUEUE_MAX_LENGTH));
  });
}

async function sendOnce(payload: IngestPayload): Promise<boolean> {
  const endpoint = getEndpoint();
  const token = getToken();
  if (!endpoint || !token) return false;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok && res.status !== 204) {
      logger.warn({ event: "error_tracking.send_non_ok", status: res.status });
      return false;
    }
    return true;
  } catch (err: unknown) {
    logger.warn({
      event: "error_tracking.send_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function captureException(
  error: unknown,
  ctx?: CaptureContext,
): Promise<void> {
  if (!isEnabled()) return;
  try {
    const payload = buildPayload(error, ctx);
    const ok = await sendOnce(payload);
    if (!ok) await enqueue(payload);
  } catch (err: unknown) {
    logger.warn({
      event: "error_tracking.capture_threw",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function flushQueue(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  if (!isEnabled()) return Promise.resolve();
  flushInFlight = (async () => {
    const items = await withQueueLock(async () => {
      const snapshot = await readQueue();
      if (snapshot.length > 0) await writeQueue(snapshot);
      return snapshot;
    });
    const sent = new Set<number>();
    for (const item of items) {
      if (await sendOnce(item.payload)) sent.add(item.id);
    }
    if (sent.size > 0) {
      await withQueueLock(async () => {
        const current = await readQueue();
        await writeQueue(current.filter((item) => !sent.has(item.id)));
      });
    }
  })().catch((err: unknown) => {
    logger.warn({
      event: "error_tracking.queue_flush_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }).finally(() => { flushInFlight = null; });
  return flushInFlight;
}

// Exposed for tests.
export const __internal = {
  readQueue,
  enqueue,
  flushQueue,
  buildPayload,
  clampExtra,
  resetForTests: (): void => {
    initialized = false;
  },
};

function attachGlobalHandlers(): void {
  // ErrorUtils is a React Native global; type it loosely to avoid pulling RN internals.
  type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
  const RNErrorUtils = (
    globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler: () => GlobalErrorHandler;
        setGlobalHandler: (handler: GlobalErrorHandler) => void;
      };
    }
  ).ErrorUtils;
  if (!RNErrorUtils) return;

  const prev = RNErrorUtils.getGlobalHandler();
  RNErrorUtils.setGlobalHandler((error, isFatal) => {
    void captureException(error, {
      route: "globalHandler",
      extra: { isFatal: isFatal ?? false },
    });
    prev(error, isFatal);
  });
}

export function initErrorTracker(): void {
  if (initialized) return;
  initialized = true;
  if (!isEnabled()) return;
  attachGlobalHandlers();
  // Flush queued events from previous sessions, fire-and-forget.
  void flushQueue();
}
```

---

## 設計のポイント

### 1. bracket-notation env access

```ts
const ENV_ENDPOINT = "EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT";
const raw = (process.env as Record<string, string | undefined>)[ENV_ENDPOINT];
```

`process.env.EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT` と書くと babel-preset-expo の `babel-plugin-transform-inline-environment-variables` 相当の transform で **ビルド時に値が固定** されてしまう。テストで env を動的に切り替えたいので bracket-notation で動的アクセスを強制する。

### 2. ErrorUtils.setGlobalHandler を chain する

```ts
const prev = RNErrorUtils.getGlobalHandler();
RNErrorUtils.setGlobalHandler((error, isFatal) => {
  void captureException(error, { route: "globalHandler", extra: { isFatal } });
  prev(error, isFatal);  // ← 既存 handler（RedBox 表示 / log）を必ず呼ぶ
});
```

`prev(error, isFatal)` を呼ばないと RedBox が出ない、log が消える、など既存挙動が壊れる。

### 3. unhandled promise rejection は MVP では拾わない

`require("promise/setimmediate/rejection-tracking")` を使えば拾えるが:

- Hermes の bundle に含まれているとは限らない
- internals 依存で RN version 跨ぎで壊れる

→ catch + 明示 `captureException` で代替。本当に必要なら **動作確認できた RN version を pinning した上で** 別 change で対応。

### 4. byteLengthUtf8 は手書き

`Buffer` は RN にない。`TextEncoder` は Hermes version によっては未実装。`encodeURIComponent(s).length` でも近似できるが、surrogate pair を 4 byte でカウントする手書きが最も安全。

### 5. fire-and-forget の queue flush

`initErrorTracker` 内で `void flushQueue()` を呼ぶ。`await` しないことでアプリの起動を遅らせない。flush の失敗は次回起動でリトライされる。

### 6. AsyncStorage が失敗してもアプリは生きる

storage の読取・解析失敗を空配列扱いして上書きしない。書込失敗も呼出元へ伝え、`captureException` / `flushQueue` の外側で警告してアプリを継続する。保存できなかった新着は永続化済みと扱わない。送信後の削除保存に失敗した既存項目は残り、次回再送され得る。

queue は内部 ID と payload を保存し、API には payload だけを送る。同一 JS runtime の storage 更新を直列化し、flush 中の新着（同一内容も含む）を成功 snapshot と区別する。容量超過時の古い項目破棄は既存の上限方針に従う。複数 runtime/process から同じ storage を書く構成には、このメモリ内排他を流用しない。

### 7. `__DEV__` で environment 判定

```ts
function getEnvironment() {
  if (__DEV__) return "development";
  return "production";
}
```

`__DEV__` は RN ビルド時の global。EAS の release channel で staging を分けたいなら `Constants.expoConfig?.releaseChannel` を見るロジックを追加できるが、MVP では不要。

### 8. `__internal` export はテスト専用

production code から `__internal.flushQueue()` を呼ばないこと。テストで queue の挙動を直接検証するための後ろ口。

---

## App.tsx への組み込み

```ts
// apps/mobile/App.tsx
import { initErrorTracker } from "./src/error-tracking";

initErrorTracker();  // module top-level で呼ぶ（idempotent）

export default function App() {
  // ...
}
```

`useEffect` 内で呼ぶと最初の render が走るまで `setGlobalHandler` が装着されない。**module top-level で同期的に呼ぶ** こと。

---

## 環境変数

`.env.example` / `.env`:

```
EXPO_PUBLIC_ERROR_TRACKING_ENDPOINT=http://localhost:3000/v1/errors/ingest
EXPO_PUBLIC_ERROR_TRACKING_TOKEN=dev-dummy-token
EXPO_PUBLIC_APP_VERSION=0.0.1
```

`EXPO_PUBLIC_*` prefix の env は **クライアントバンドルに焼き込まれる** ため、token を入れても完全な秘密にはならない。「価値の低い秘密」として扱う方針。本格的に守りたくなったら署名 / nonce を追加した別 endpoint に切る。

EAS Build では `eas.json` の `env` または EAS Secrets 経由で設定する。
