# DB schema & migration

`error_events` テーブル 1 つだけを追加する。既存の Postgres を共有し、別 DB を立てない。

## Prisma schema

`prisma/schema.prisma` に追加:

```prisma
model ErrorEvent {
  id             String   @id
  fingerprint    String
  platform       String
  environment    String
  release        String?
  level          String
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

## Field 設計の意図

| field | 意図 |
|---|---|
| `id` | `randomUUID()` を application 側で生成。Prisma の auto-id を使わないのは `service.ts` で先に id を持ちたいケース（テスト, fire-and-forget の追跡）に備えるため |
| `fingerprint` | `sha1(platform + exceptionType + 正規化 stack 1 行目)` の 40 桁 hex |
| `platform` | `"mobile"` / `"server"` / 必要なら `"web"` |
| `environment` | `"production"` / `"staging"` / `"development"` |
| `release` | app version / git sha / EAS build profile など、後で「いつのビルドか」を辿る用 |
| `level` | `"error"` / `"fatal"` / `"warning"` |
| `message` | 8KB cap で truncate |
| `exceptionType` | `"TypeError"` 等 |
| `exceptionValue` | 8KB cap で truncate |
| `exceptionStack` | 生 stack そのまま（64KB ingest cap で実質制限） |
| `context` | `{ userId, route, extra }` を Json で保存。`extra` は PII mask 済み |
| `occurredAt` | client で発生した時刻（client 時計） |
| `receivedAt` | server insert 時刻（server 時計） |
| `notified` | webhook 通知済みか。dedupe 判定で使う |
| `createdAt` | 監査用 |

## Index 設計

```
(fingerprint, received_at DESC)
(fingerprint, notified, received_at DESC)
```

1 つ目は将来の閲覧 UI（同 fingerprint の event 履歴表示）用。2 つ目は `notifyIfNew` の dedupe query 用:

```sql
SELECT id FROM error_events
WHERE fingerprint = $1 AND notified = true AND received_at >= $2
LIMIT 1;
```

このクエリは index 先頭から 2 列までで一意 lookup できる。Prisma は partial index 未対応のため、 `notified = true` を index に焼き付けることはできないが、`(fingerprint, notified, received_at DESC)` の composite で十分な性能が出る。

## Migration を発行する

```bash
pnpm --filter <server-package> exec prisma migrate dev --name add_error_events
```

生成される SQL は以下のような形:

```sql
-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "release" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "exception_type" TEXT NOT NULL,
    "exception_value" TEXT NOT NULL,
    "exception_stack" TEXT NOT NULL,
    "context" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_events_fingerprint_received_at_idx"
  ON "error_events"("fingerprint", "received_at" DESC);

CREATE INDEX "error_events_fingerprint_notified_received_at_idx"
  ON "error_events"("fingerprint", "notified", "received_at" DESC);
```

CI / 本番では `prisma migrate deploy` が自動で適用する想定。

## Retention（MVP では未実装）

retention（古いデータ削除）は MVP では入れない。手動 delete でも十分間に合うサイズ。
将来 cron を入れるなら例:

```sql
DELETE FROM error_events WHERE received_at < NOW() - INTERVAL '30 days';
```

を 1 日 1 回回す。tables size が GB 級になったら検討する。
