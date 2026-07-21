// READ-only DB クエリ層。 ORM は Prisma を想定 (差し替え可能)。
//
// このファイルはセクションごとに 1 グループずつ関数を生やしていく。
// 例: Users 一覧 / Detail / Top N など。
//
// 重要な規約:
// - 必ず READ-only (find* / groupBy / count 等)。 admin 経路で write はしない。
// - `select:` で必要列のみ取得し、 secret column を引かない (password hash / API token 等)。
// - `take:` で必ず上限を入れる (最新 200 件など)。 limit なしの list を返さない。
//
// Prisma 以外を使う場合は references/orm-variants.md を参照。

import { prisma } from "../db.js";

export type UserRow = {
  id: string;
  email: string;
  createdAt: Date;
};

export async function listUsers(limit = 200): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return users;
}

// ----------------------------------------------------------------------------
// 追加セクションの query はこの下に生やす。
// テンプレ例 (event 集計ダッシュボードを足したいとき):
//
// export type EventSummary = {
//   range: ErrorRange;
//   since: Date;
//   totalCount: number;
//   buckets: number[];
// };
//
// export async function getEventSummary(range: ErrorRange): Promise<EventSummary> { ... }
// ----------------------------------------------------------------------------

export type ErrorRange = "24h" | "7d" | "30d";

export type RangeConfig = {
  durationMs: number;
  bucketMs: number;
  bucketCount: number;
};

export function rangeConfig(range: ErrorRange): RangeConfig {
  switch (range) {
    case "24h":
      return { durationMs: 86_400_000, bucketMs: 3_600_000, bucketCount: 24 };
    case "7d":
      return {
        durationMs: 7 * 86_400_000,
        bucketMs: 6 * 3_600_000,
        bucketCount: 28,
      };
    case "30d":
      return {
        durationMs: 30 * 86_400_000,
        bucketMs: 86_400_000,
        bucketCount: 30,
      };
  }
}
