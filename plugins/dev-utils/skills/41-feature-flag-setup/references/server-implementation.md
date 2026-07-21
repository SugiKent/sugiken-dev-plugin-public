# サーバ実装テンプレ

TypeScript + Fastify + oRPC + Prisma 前提のコード例。 手続き層・フレームワークは `stack-variants.md` で差し替え。

## store.ts — シングルトン + 遅延 TTL + 値解釈（決定3 / 決定1）

```ts
// apps/server/src/featureFlag/store.ts
import { listAllFlags } from "./repository";

const TTL_MS = process.env.NODE_ENV === "production" ? 60_000 : 0; // dev: 常に最新

let cache: Map<string, string> = new Map();
let lastLoaded = 0;

async function refresh(): Promise<void> {
  const rows = await listAllFlags();
  cache = new Map(rows.map((r) => [r.name, r.value]));
  lastLoaded = Date.now();
}

/** 参照時に TTL を見て古ければ取り直す（setInterval は使わない） */
async function ensureFresh(): Promise<void> {
  if (Date.now() - lastLoaded > TTL_MS || cache.size === 0) {
    await refresh();
  }
}

/** 書き込み成功時に dev で即時反映させるため明示 reload */
export async function reloadFlags(): Promise<void> {
  await refresh();
}

export async function getRawFlag(name: string): Promise<string | undefined> {
  await ensureFresh();
  return cache.get(name);
}

export async function getAllRawFlags(): Promise<Record<string, string>> {
  await ensureFresh();
  return Object.fromEntries(cache);
}

// --- 値解釈ヘルパ（決定1: 未知・未定義は安全側へ） ---
export async function getBoolFlag(name: string, fallback = false): Promise<boolean> {
  const raw = await getRawFlag(name);
  if (raw === undefined) return fallback;
  return raw === "true"; // "true" のときだけ true。それ以外は false
}

export async function getNumberFlag(name: string, fallback: number): Promise<number> {
  const raw = await getRawFlag(name);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
```

- 本番 TTL=60s / dev TTL=0。 `Date.now() - lastLoaded > TTL` の遅延判定が肝。
- `setInterval` を絶対に置かない（決定3 の理由）。

## repository.ts — READ + 限定 WRITE

```ts
// apps/server/src/featureFlag/repository.ts
export async function listAllFlags() {
  return prisma.featureFlag.findMany({ orderBy: { name: "asc" } });
}

export async function updateFlagValue(name: string, value: string) {
  return prisma.featureFlag.update({ where: { name }, data: { value } });
}
```

## service.ts — 更新成功時に dev は reload（決定3）

```ts
// apps/server/src/featureFlag/service.ts
import { listAllFlags, updateFlagValue } from "./repository";
import { reloadFlags } from "./store";

export async function listFeatureFlags() {
  return listAllFlags();
}

export async function setFeatureFlag(name: string, value: string) {
  const updated = await updateFlagValue(name, value);
  if (process.env.NODE_ENV !== "production") {
    await reloadFlags(); // dev: 即時反映。本番は次リクエストの TTL 更新に委ねる
  }
  return updated;
}
```

## procedures.ts — 一覧 / 更新（更新は admin ゲート。 決定5）

```ts
// apps/server/src/featureFlag/procedures.ts
import { z } from "zod";
import { adminProcedure } from "../orpc/base"; // requireRole("system_admin") 済みの base

export const listFeatureFlagsProcedure = adminProcedure
  .handler(async () => listFeatureFlags());

export const setFeatureFlagProcedure = adminProcedure
  .input(z.object({ name: z.string().min(1), value: z.string() }))
  .handler(async ({ input }) => {
    // 入力検証失敗は zod が throw（握り潰さない）
    return setFeatureFlag(input.name, input.value);
  });
```

- `adminProcedure` は既存の `requireRole("system_admin")` ゲートを噛ませた base 手続き。 プロジェクトの認可機構を再利用する。
- tRPC / REST の場合は `stack-variants.md`。

## bootstrapRoute.ts — GET /api/feature-flags.js（決定4）

```ts
// apps/server/src/featureFlag/bootstrapRoute.ts
import type { FastifyInstance } from "fastify";
import { getAllRawFlags } from "./store";

export function registerFeatureFlagBootstrap(app: FastifyInstance) {
  app.get("/api/feature-flags.js", async (_req, reply) => {
    const flags = await getAllRawFlags();
    // JSON.stringify で JS リテラルとして安全に出力（</script> ブレイクアウト不可）
    const body = `window.__FEATURE_FLAGS__ = ${JSON.stringify(flags)};`;
    reply
      .header("Content-Type", "application/javascript; charset=utf-8")
      // 任意: CDN に短時間キャッシュさせるなら（決定3/4 の TTL と一致）
      .header("Cache-Control", "public, max-age=60")
      .send(body);
  });
}
```

- **必ず独立 JS ファイルとして返す**（HTML インライン埋め込みにしない）。
- 値はシングルトン（遅延 TTL）の現在値を使う。
- `Cache-Control` は任意。 CDN を挟むなら 60s 程度でサーバ負荷を抑制できる。
