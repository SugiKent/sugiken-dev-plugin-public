---
name: 41-feature-flag-setup
description: "個人開発 / 小規模 SaaS の Web プロジェクト (server + SPA + DB) に、 DB を正本とする Feature Flag 機構を初期化するスキル。 デプロイなしで機能の ON/OFF を切り替えられるよう、 (1) DB テーブル + 値は型を問わず String、 (2) CSV 冪等 seed (INSERT ON CONFLICT DO NOTHING で新規のみ投入・既存値は不変更)、 (3) サーバはシングルトン + 遅延 TTL 更新 (setInterval を使わず参照時に now-lastLoaded>TTL で再取得。 Lambda 等マルチインスタンス/フリーズ環境で破綻しない)、 (4) フロントへは外部 bootstrap スクリプト `/api/feature-flags.js` を render-blocking で読み window.__FEATURE_FLAGS__ に代入 (ブリンクなし・CDN/CloudFront 無改修・</script> ブレイクアウト XSS なし)、 (5) 編集は admin role ゲート限定、 (6) 手動 migration + migrate deploy (非対話 CI 対応)、 という設計を一式投入する。 「feature flag」「フィーチャーフラグ」「機能フラグ」「機能トグル」「feature toggle」「ON/OFF をデプロイなしで」「フラグ管理」「管理画面でフラグ切替」「window.__FEATURE_FLAGS__」「段階公開」「kill switch」等の発話・タスク要求時に使用。 一度きりのスキャフォールド用。 サーバレス vs 常駐サーバ・CDN キャッシュ・ORM/フレームワーク差し替え・型付き値への拡張指針は references/ に同梱。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# Feature Flag セットアップスキル

個人開発・小規模 SaaS の Web プロジェクトに、 **DB を正本とする Feature Flag 機構** を初期化する。 目的はただ一つ — **コードを再ビルド・再デプロイせずに機能の ON/OFF を切り替えられる**ようにすること。

このスキルは **初期化（スキャフォールド）専用**。 機構を一度入れたら、 以降のフラグ追加は CSV に 1 行足して seed を流すだけで済む設計にする。

## このスキルが解く問題

機能フラグがコードにハードコードされている (例: `const REAL_CALL_FEATURE_ENABLED = false`) と、 値を変えるたびに再ビルド・再デプロイが要る。 運用中に切り替えられない。 これを DB 正本に移し、 admin が管理画面から変え、 フロントへブリンクなしで届ける。

## 絶対方針（この 6 つを曲げない）

設計の根拠と代替案は `references/design-decisions.md` に全て書いてある。 ここでは結論だけ:

1. **DB が正本。 値は型を問わず String（テキスト）一本**。 型カラムを持たない。 boolean は参照側で `value === "true"` と明示比較し、 **未定義・未知値は必ず安全側（既定値、 多くは false）へフォールバック**する。 解釈は参照ヘルパ 1 箇所に集約する。
2. **初期値は CSV で宣言。 seed は冪等（`INSERT ... ON CONFLICT (name) DO NOTHING`）**。 新規フラグだけ投入し、 **既存値は絶対に上書きしない**（運用で変えた値を seed が踏み潰さない）。 migration は CSV を読めないので、 `migrate deploy` の**後段**に独立 seed として置く。
3. **サーバはシングルトン + 遅延（lazy）TTL 更新。 `setInterval` を使わない**。 モジュールスコープにフラグマップと最終ロード時刻を持ち、 **参照時に `now - lastLoaded > TTL`（本番 約60s）なら DB 再取得**する。 サーバレス（Lambda 等）はマルチインスタンスでフリーズされるため定期ポーリングは信頼できない — これが業界標準形（AppConfig 拡張も同じ）。 **dev は TTL=0 + 書き込み成功時に即時 reload** で即反映。
4. **フロントへは外部 bootstrap スクリプト `/api/feature-flags.js` を render-blocking で受け渡す**。 サーバが `window.__FEATURE_FLAGS__ = {...}` を代入する JS を生成し、 `index.html` の `<head>` から React バンドルより**前**に読む。 React 描画前に同期で値が確定するので**ブリンク（ちらつき）が起きない**。 HTML は静的配信のまま・`/api/*` だけサーバ経路なので **CDN/CloudFront の構成変更が不要**。 独立 JS ファイルなので **`</script>` ブレイクアウト XSS の懸念がない**（`JSON.stringify` で安全に出力）。 クライアントは `window.__FEATURE_FLAGS__` 欠落時に既定値へフォールバックする。
5. **編集は admin role ゲート限定**。 既存の認可機構（role gate / middleware）を再利用し、 新規の権限機構は作らない。
6. **migration は手動 SQL + `migrate deploy`**（非対話 CI/エージェント環境で `migrate dev` は対話を要求して失敗する）。 新規テーブル追加のみで rename を伴わないので低リスク。 適用前後に diff で SQL 確認と drift 検証。

> ⚠️ 一番の肝は **方針 3（遅延 TTL）と方針 4（外部 bootstrap スクリプト）**。 ここを `setInterval` や HTML インライン埋め込みでやると、 サーバレスで動かない / CDN 工事が要る / XSS リスク、 のいずれかを踏む。 理由は `references/design-decisions.md` を必ず読むこと。

## 投入される構成

```
<repo>/
├── feature_flag/feature_flag.csv          # name,value,description（初期値の宣言。フラグ追加はここに1行）
├── prisma/
│   ├── schema.prisma                       # FeatureFlag モデル追記
│   └── migrations/<ts>_add_feature_flag/migration.sql   # 手動 SQL
├── apps/server/src/featureFlag/            # （monorepo でなければ src/featureFlag/）
│   ├── store.ts                            # シングルトン + 遅延 TTL + 値解釈ヘルパ
│   ├── repository.ts                       # 全件取得 / name キー更新（READ + 限定 WRITE）
│   ├── service.ts                          # 一覧 / 更新（更新成功時 dev は reload）
│   ├── procedures.ts                       # oRPC/tRPC/REST 手続き（更新は admin ゲート）
│   ├── bootstrapRoute.ts                   # GET /api/feature-flags.js
│   └── seed.ts                             # CSV 冪等 seed（ON CONFLICT DO NOTHING）
└── apps/client/src/
    ├── lib/featureFlags.ts                 # window.__FEATURE_FLAGS__ 参照 + フォールバック
    ├── index.html                          # <head> に <script src="/api/feature-flags.js">
    └── pages/admin/FeatureFlags.tsx        # admin 限定の一覧/編集画面
```

具体コードは `references/` のテンプレを土台にする（下記「手順」参照）。

## 前提（このスキルがそのまま動く想定スタック）

- **言語**: TypeScript
- **サーバ**: Node の HTTP フレームワーク（Fastify / Express / Hono 等。 リファレンスは Fastify + oRPC）。 デプロイは **サーバレス（AWS Lambda + Web Adapter）想定** ← 方針 3 の遅延 TTL はここが理由。 常駐サーバなら `references/stack-variants.md` 参照
- **DB / ORM**: PostgreSQL + Prisma（v6 系）。 他 ORM・MySQL/SQLite は `references/stack-variants.md`
- **フロント**: React SPA。 `index.html` は静的配信（S3 + CloudFront 等）、 `/api/*` のみサーバ経路 ← 方針 4 の前提
- **認可**: role の階層（例 `system_admin > admin > manager > user`）と `requireRole(min)` 相当のゲートが既にある

スタックが違っても **設計（6 方針）はそのまま使える**。 コードだけ `references/stack-variants.md` を根拠に書き換える。

## 手順

### 0. 読む（書く前に）
- `references/design-decisions.md` を読み、 6 方針の根拠を把握する。
- 既存コードを読む: 現状ハードコードされているフラグ（移行対象）、 ORM の model 規約、 認可ゲートの呼び方、 既存 seed の流儀、 `index.html` の場所と読み込み順。

### 1. スタック確認（AskUserQuestion）
不明なら聞く。 推測で進めない:
- デプロイは **サーバレス（Lambda 等）/ 常駐サーバ** のどちらか（TTL 戦略が変わる）。
- フロント配信は **静的 + `/api` 分離 / 同一オリジン全部コンピュート** のどちらか（bootstrap 受け渡しが変わる）。
- 編集を許す role（既定: 最上位 admin 限定）。
- 最初に移行する既存ハードコードフラグ（1 個に絞る。 残りは後続）。

### 2. DB（`references/db-and-seed.md`）
- `schema.prisma` に `FeatureFlag`（`id` cuid / `name` @unique / `value` String / `description` String? / `createdAt` / `updatedAt`）を追記。
- `migrate diff` で SQL を確認 → 手動 migration を作成 → `migrate deploy` → `generate`。
- **`.claude/rules/prisma-schema.md` 等のプロジェクト規約があれば必ず従う**（rename 禁止・手動 migration 必須など）。

### 3. CSV + 冪等 seed（`references/db-and-seed.md`）
- `feature_flag/feature_flag.csv` を作り、 移行対象フラグを 1 行書く（`REAL_CALL_FEATURE_ENABLED,false` 等）。
- CSV を読み `ON CONFLICT (name) DO NOTHING` で投入する seed を、 既存 seed パターンに準拠して実装。
- `package.json` にコマンド追加（例 `featureflag:seed`）し、 デプロイ手順の `migrate deploy` 後段に組み込む。

### 4. サーバ（`references/server-implementation.md`）
- `store.ts`: シングルトン + 遅延 TTL + 値解釈ヘルパ（boolean 等）。
- `repository.ts` / `service.ts`: 全件取得・name 更新・更新成功時 dev は `reload()`。
- `procedures.ts`: 一覧取得・値更新。 **更新（と本 change では一覧も）に admin role ゲート**。 入力検証失敗は握り潰さず throw。
- `bootstrapRoute.ts`: `GET /api/feature-flags.js` で `window.__FEATURE_FLAGS__ = {...}` を `Content-Type: application/javascript` で返す。 シングルトンの現在値を使う。

### 5. クライアント（`references/client-implementation.md`）
- `lib/featureFlags.ts` を `window.__FEATURE_FLAGS__` 参照へ。 未定義時は安全側の既定値へフォールバック。
- `index.html` の `<head>`、 React バンドルより**前**に `<script src="/api/feature-flags.js"></script>`。
- admin 限定の管理画面ページ + ルート + 導線（admin にのみ表示）。

### 6. テスト（`references/tests.md`）
- CSV 冪等 seed / 遅延 TTL / 値解釈ヘルパ / role ゲート / bootstrap 出力 / クライアントフォールバック。

### 7. 仕上げ
- lint・typecheck・テスト一式グリーン。
- 移行したハードコードフラグの旧定義を削除し、 ロールバック挙動（`window.__FEATURE_FLAGS__` 欠落時に既定値）を確認。

## やってはいけない（アンチパターン）

- ❌ サーバで `setInterval` による定期リロード — サーバレスのフリーズで動かない。 必ず参照時遅延 TTL。
- ❌ フラグ値を `index.html` に JSON インライン埋め込み — `</script>` ブレイクアウト XSS リスク + 静的配信なら HTML 生成経路が要る。 独立 JS ファイルで返す。
- ❌ API fetch + クライアントキャッシュでフラグ取得 — 初回ブリンクが残る。 render-blocking スクリプトで同期確定させる。
- ❌ seed で `upsert`（既存値も更新）— 運用で変えた値を踏み潰す。 `DO NOTHING` で新規のみ。
- ❌ 型付きカラム（boolean/json）を最初から作り込む — Non-Goal。 String 一本 + 参照側パースで始める（拡張は `references/stack-variants.md`）。
- ❌ フラグごとに手書き SQL migration を増やす — CSV + 冪等 seed に一元化する。
- ❌ 未知・未定義のフラグ値で機能を ON にする — 必ず安全側（既定値）に倒す。

## references/

- `design-decisions.md` — 6 方針それぞれの「なぜ」・代替案・トレードオフ・リスク（**最初に読む**）
- `db-and-seed.md` — Prisma モデル / 手動 migration SQL / CSV 冪等 seed
- `server-implementation.md` — シングルトン+遅延 TTL / repository / service / 手続き / bootstrap route のコードテンプレ
- `client-implementation.md` — featureFlags.ts / index.html / admin 管理画面
- `stack-variants.md` — サーバレス vs 常駐 / CDN キャッシュ / ORM・フレームワーク差し替え / 型付き値への拡張
- `tests.md` — ユニットテスト観点チェックリスト
