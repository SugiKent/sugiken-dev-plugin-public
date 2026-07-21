# ORM / DB アクセス層の差し替え

`queries.ts` のデフォルトは **Prisma** 想定。 他の ORM / 生 SQL に乗せ替える場合のテンプレート。

## どの ORM でも変えてはいけないこと

1. **READ-only**: 書き込み API (create / update / delete / executeRaw) を一切呼ばない
2. **必要列のみ select**: secret column (`passwordHash`, `apiToken`, `oauthRefreshToken` 等) を引かない
3. **必ず `limit` を付ける**: 「最新 200 件」「上位 20 件」など。 unbounded list を返さない
4. **時系列 bucket は server 側で計算**: DB に `date_trunc` を投げて round-trip 数を増やすより、 limit 内の row を取り JS で再分配する方が速いことが多い

## (1) Prisma (default)

```ts
import { prisma } from "../db.js";

export async function listUsers(limit = 200): Promise<UserRow[]> {
  return prisma.user.findMany({
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
```

groupBy:

```ts
const grouped = await prisma.errorEvent.groupBy({
  by: ["fingerprint"],
  where: { receivedAt: { gte: since } },
  _count: { fingerprint: true },
  orderBy: { _count: { fingerprint: "desc" } },
  take: 20,
});
```

## (2) Drizzle

```ts
import { db } from "../db.js";
import { users } from "../schema.js";
import { desc } from "drizzle-orm";

export async function listUsers(limit = 200): Promise<UserRow[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}
```

groupBy:

```ts
import { sql, count } from "drizzle-orm";

const grouped = await db
  .select({
    fingerprint: errorEvent.fingerprint,
    cnt: count(errorEvent.fingerprint),
  })
  .from(errorEvent)
  .where(sql`${errorEvent.receivedAt} >= ${since}`)
  .groupBy(errorEvent.fingerprint)
  .orderBy(sql`count(*) DESC`)
  .limit(20);
```

## (3) Kysely

```ts
import { db } from "../db.js";

export async function listUsers(limit = 200): Promise<UserRow[]> {
  return db
    .selectFrom("users")
    .select(["id", "email", "createdAt"])
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
}
```

## (4) 生 SQL (pg / postgres.js / mysql2)

```ts
import { sql } from "../db.js";

export async function listUsers(limit = 200): Promise<UserRow[]> {
  // ID 列・限定列のみ。 SELECT * は禁止。
  const rows = await sql<UserRow[]>`
    SELECT id, email, created_at AS "createdAt"
    FROM users
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows;
}
```

**規約**:
- `SELECT *` は絶対書かない (新規 column の漏洩を防ぐ)
- パラメタライズドクエリ以外で文字列結合しない (`${rawString}` を直接 SQL に埋めない)
- 関数の戻り型 (`UserRow[]`) を必ず明示する (row shape の drift を防ぐ)

## (5) 非リレーショナル (Mongo / Firestore)

```ts
import { mongo } from "../db.js";

export async function listUsers(limit = 200): Promise<UserRow[]> {
  return mongo
    .collection<UserRow>("users")
    .find({}, { projection: { id: 1, email: 1, createdAt: 1, _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
```

`projection` は **opt-in (= 必要列だけ 1)** で書く。 `{ password: 0 }` のような exclude 形は新規 secret column が漏れるので NG。
