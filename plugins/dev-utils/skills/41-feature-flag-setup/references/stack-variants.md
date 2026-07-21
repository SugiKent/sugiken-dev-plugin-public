# スタック差し替え・拡張指針

6 方針はスタック非依存。 ここはコードをどう書き換えるかだけ。

## デプロイ: サーバレス vs 常駐サーバ（決定3）

| | サーバレス（Lambda 等） | 常駐サーバ（ECS/VM/Railway 等） |
|---|---|---|
| インスタンス | マルチ・フリーズあり | 単一〜少数・常駐 |
| `setInterval` | ❌ フリーズで不発 | ⭕ 使えるが不要 |
| 推奨 | **遅延 TTL（必須）** | **遅延 TTL（同じでよい）** |
| 反映 | TTL 範囲の結果整合 | 単一なら実質即時に近い |

→ **どちらも遅延 TTL でよい**。 常駐でも遅延 TTL は単純で正しく動くので、 わざわざ `setInterval` にしない。 常駐かつ即時全反映が要るなら pub/sub（Redis 等）で reload 通知 — ただし個人開発では過剰。

## フロント配信: 静的+/api 分離 vs 同一オリジン全部コンピュート（決定4）

- **静的 + `/api` 分離（S3+CloudFront 等）**: 本スキルの想定。 外部 bootstrap スクリプトが最適（HTML 無改修・CDN 無改修）。
- **同一オリジンで HTML もサーバが返す（Next.js SSR / Remix 等）**: HTML に直接 `<script>window.__FEATURE_FLAGS__=...</script>` をインライン注入してもよい（サーバが HTML を生成するので XSS は `JSON.stringify` + フレームワークのエスケープで対処）。 この場合は別ファイル `/api/feature-flags.js` を作らなくてもよい。 SSR フレームワークなら loader/getServerSideProps でフラグを渡し、 hydration 前に確定させればブリンクしない。

## ORM 差し替え（決定2 の seed が要点）

`ON CONFLICT (name) DO NOTHING` 相当を各 ORM で:

- **Prisma**: 生 SQL `$executeRaw` で `ON CONFLICT DO NOTHING`（`upsert` は使わない）。
- **Drizzle**: `db.insert(featureFlag).values(...).onConflictDoNothing({ target: featureFlag.name })`。
- **Kysely**: `.insertInto(...).onConflict((oc) => oc.column("name").doNothing())`。
- **生 SQL**: そのまま `INSERT ... ON CONFLICT (name) DO NOTHING`。
- **MySQL**（ON CONFLICT 非対応）: `INSERT IGNORE` または `INSERT ... ON DUPLICATE KEY UPDATE name=name`（実質 no-op）。
- **SQLite**: `INSERT OR IGNORE`。

いずれも「**新規のみ挿入・既存は不変更**」が満たせれば良い。

## 手続き層 差し替え（決定5）

- **oRPC**: `adminProcedure`（`requireRole` 済み base）に `.handler`。
- **tRPC**: `adminProcedure = publicProcedure.use(requireRoleMiddleware("admin"))`。
- **REST(Fastify/Express)**: `preHandler` で role チェック → 403 でなく既存方針に合わせる。 一覧 `GET /api/feature-flags`、 更新 `PUT /api/feature-flags/:name`。
- bootstrap ルート（`/api/feature-flags.js`）は **認可不要**（公開フラグ値のみ。 秘匿値は載せない）。

> ⚠️ bootstrap スクリプトは未認証でも読める。 **クライアントに見せて困る値（秘密鍵・内部フラグ）を載せない**。 フロント表示制御用の公開フラグだけを返す。 秘匿フラグはサーバ側 store からのみ参照する。

## CDN キャッシュ（任意・決定3/4）

`/api/feature-flags.js` を CDN（CloudFront 等）に `Cache-Control: max-age=60` でキャッシュさせると、 全ユーザーが約60s 以内に最新を受け取りつつ Lambda 呼び出しを抑制できる。 サーバの遅延 TTL（60s）と粒度が一致するので自然。 必須ではない（後追い可）。

## 型付き値への拡張（決定1 を超えて育ったとき）

String 一本で回らなくなったら（型ごとのバリデーション・管理画面の型別 UI が欲しい等）:

1. `type` 列（`"boolean" | "number" | "json" | "string"`）を追加。
2. 管理画面が type に応じた入力 UI（チェックボックス / 数値 / JSON エディタ）を出す。
3. 値解釈ヘルパが type で分岐し、 不正値を保存時に弾く。

ただし **最初からはやらない**（Non-Goal）。 テキスト一本 + 参照側パースで始め、 実需が出てから拡張する。
