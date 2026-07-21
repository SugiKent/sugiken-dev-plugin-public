# DB スキーマ・migration・CSV 冪等 seed

PostgreSQL + Prisma(v6) 前提。 他スタックは `stack-variants.md`。

## 1. Prisma モデル

```prisma
model FeatureFlag {
  id          String   @id @default(cuid())
  name        String   @unique
  value       String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("feature_flag")
}
```

- `value` は **String 一本**（型カラムなし。 決定1）。
- 自然キーは `name`（unique）。 seed / 更新は name で操作する（決定2）。

## 2. 手動 migration（非対話 / CI 対応）

`migrate dev` は使わない。 手順:

```bash
# 1) 生成される SQL を事前確認
pnpm prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script

# 2) 手動で migration ファイルを作成
mkdir -p prisma/migrations/<ts>_add_feature_flag
#   → 確認した SQL を migration.sql に書く（下記）

# 3) 適用 + クライアント型更新
pnpm prisma migrate deploy
pnpm prisma generate

# 4) テスト DB へも反映し drift 検証
pnpm db:test:setup   # プロジェクトのテスト DB セットアップコマンド
pnpm prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code         # drift があれば非0で落ちる
```

`prisma/migrations/<ts>_add_feature_flag/migration.sql`:

```sql
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_flag_name_key" ON "feature_flag"("name");
```

> プロジェクトに Prisma 運用規約（`.claude/rules/prisma-schema.md` 等）があれば**必ずそれに従う**。 rename は drop/create と解釈されデータが消えるため絶対にしない。

## 3. CSV 初期値

リポジトリ直下 `feature_flag/feature_flag.csv`:

```csv
name,value,description
REAL_CALL_FEATURE_ENABLED,false,実通話機能の公開フラグ
```

- フラグ追加は **このファイルに 1 行足すだけ**。
- `value` はテキスト（boolean も `true`/`false` の文字列）。

## 4. 冪等 seed（ON CONFLICT DO NOTHING）

既存 seed パターン（`DevScripts` 等）に準拠。 **新規のみ投入・既存値は不変更**（決定2）。

```ts
// apps/server/src/featureFlag/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";

type Row = { name: string; value: string; description: string | null };

function parseCsv(csv: string): Row[] {
  const [header, ...lines] = csv.trim().split("\n");
  // 単純 CSV 前提（値にカンマを含めない運用）。含めるなら csv パーサを使う
  return lines
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [name, value, description = ""] = line.split(",");
      return { name: name.trim(), value: value.trim(), description: description.trim() || null };
    });
}

export async function seedFeatureFlags(prisma: PrismaClient): Promise<void> {
  const csvPath = path.resolve(process.cwd(), "feature_flag/feature_flag.csv");
  const rows = parseCsv(readFileSync(csvPath, "utf-8"));

  for (const row of rows) {
    // ON CONFLICT (name) DO NOTHING 相当: 既存値は絶対に上書きしない
    await prisma.$executeRaw`
      INSERT INTO "feature_flag" ("id", "name", "value", "description", "createdAt", "updatedAt")
      VALUES (${createId()}, ${row.name}, ${row.value}, ${row.description}, NOW(), NOW())
      ON CONFLICT ("name") DO NOTHING
    `;
  }
}
```

- `createId()` は cuid 生成（`@paralleldrive/cuid2` 等、 プロジェクトの id 生成に合わせる）。
- Prisma の `upsert` は使わない（既存値を更新してしまう）。 生 SQL の `ON CONFLICT DO NOTHING` を使う。

`package.json`:

```json
{ "scripts": { "featureflag:seed": "tsx apps/server/src/featureFlag/seedCli.ts" } }
```

## 5. デプロイ手順への組み込み

dev / CI / 本番すべてで、 `prisma migrate deploy` の**後段**に `featureflag:seed` を実行する。 migration（テーブル作成）→ seed（初期フラグ投入）の順。 seed は冪等なので毎デプロイ流して安全。
