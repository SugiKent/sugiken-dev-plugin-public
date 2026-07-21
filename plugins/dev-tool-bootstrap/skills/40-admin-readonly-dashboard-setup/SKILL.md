---
name: 40-admin-readonly-dashboard-setup
description: "個人開発 / 小規模 SaaS の Web サーバプロジェクトに、 READ-only の admin ダッシュボードを初期化するスキル。 認証は better-auth の magic link、 認可は単一 ADMIN_EMAIL 一致。 拒否時はすべて 404 を返して admin の存在自体を秘匿し、 `/admin/login` は GET 叩くだけで自分の inbox に magic link が届く副作用フォーム不要設計。 `apps/server/src/admin/` 配下に env.ts / middleware.ts / routes.ts / views.ts / queries.ts を配置し、 `app.use(\"/admin\", adminRouter)` で組み込む。 タグドテンプレ HTML レンダラ・restrictive CSP・READ-only catch-all まで含む。 「admin 画面」「管理画面」「ダッシュボード」「READ-only admin」「magic link login」「ADMIN_EMAIL」「admin 認可」「stealth login」「運用ダッシュボード」「social engineering 防止 admin」等の発話・タスク要求時に使用。 一度きりのスキャフォールド用。 認証方式 (Email OTP / Basic Auth / Cloudflare Access / OAuth) や ORM (Drizzle / Kysely / 生 SQL) や フレームワーク (Fastify / Hono / Next.js) への差し替え指針は references/ に同梱。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# READ-only Admin Dashboard セットアップスキル

個人開発・小規模 SaaS の Web サーバに、 運用者だけが state を覗くための **READ-only 管理画面** を初期化する。 攻撃面を極限まで削った構成 (passwordless / 全部 404 stealth / 書き込み禁止) をテンプレ一式で投入する。

このスキルは **初期化（スキャフォールド）専用**。 導入後の運用 (セクション追加 / クエリ拡張) は、 コピーされた `admin/README.md` を AI エージェントが読んで対応する想定。

## 絶対方針

- 配置先は **`apps/server/src/admin/`** (monorepo でない場合は `src/admin/`)。 これ以外には置かない
- 認証は **passwordless** (default: better-auth magic link)。 form / パスワードを置かない
- 認可は **single-admin email 一致**。 ADMIN_EMAIL env で差し替え可能、 多人数化は env.ts の差し替えで対応
- 拒否は **常に 404**。 401/403 を返さない (= admin の存在を漏らさない)
- ルートは **READ-only**。 POST/PUT/DELETE は catch-all で 404 になる。 書き込み機能は将来も別 router に分離する
- レスポンスは **restrictive CSP + X-Frame-Options DENY + Cache-Control private** を必ず付ける
- 既存の `admin/` ディレクトリがあれば **絶対に上書きしない**。 ユーザーに確認する

## 投入される構成

このスキルが配布するのは `references/admin-template/` 配下の以下:

```
apps/server/src/admin/
├── env.ts        # ADMIN_EMAIL 解決 (env 上書き可)
├── middleware.ts # requireAdmin (拒否時 404)
├── routes.ts     # /admin/login (404 + magic link 副作用) / / (Home) / /users / catch-all 404
├── views.ts      # html`` タグドテンプレ + layout + CSP ヘッダ
├── queries.ts    # READ-only Prisma クエリ (listUsers のみ最小)
└── README.md     # プロジェクト側の運用ガイド (セクション追加手順 / NG 一覧)
```

加えて vitest のテストテンプレを `apps/server/tests/admin/` に投入する (任意):

```
apps/server/tests/admin/
├── login.test.ts       # /admin/login の挙動を全パターン
└── middleware.test.ts  # requireAdmin の全分岐
```

## 前提

このスキルがそのまま動く想定スタック:

- **Web framework**: Express
- **Auth**: better-auth + magic link plugin
- **ORM**: Prisma + PostgreSQL/SQLite (User モデルが id/email/createdAt を持つこと)
- **Logger**: pino 等の `logger.info({...}) / logger.warn({...})` 形式

スタックが違う場合は **コピーは同じく実行し、 references/ のドキュメントを根拠に書き換える**:

- 認証を Email OTP / Basic Auth / Cloudflare Access / OAuth にしたい → `references/auth-variants.md`
- ORM を Drizzle / Kysely / 生 SQL / Mongo にしたい → `references/orm-variants.md`
- Express でなく Fastify / Hono / Next.js にしたい → `references/framework-variants.md`
- なぜこの設計か (404 stealth / GET-only login / CSP) を知りたい → `references/design-decisions.md`

## 実行手順

### Step 1: 投入先プロジェクトの前提確認

呼び出し時のプロジェクトルートを確認する。 以下を `Read` / `Bash ls` でチェック:

- `apps/server/src/` が存在するか (monorepo) / `src/` か (single-package)
- 既存 `admin/` ディレクトリがないか
  - 存在する場合は **AskUserQuestion** で「既存を残してマージ / 退避してから入れ直し / 中止」を確認
- 既存 `auth.ts` の export shape を確認: `auth.api.signInMagicLink(...)` と `getSessionFromRequest(req)` が呼べるか
  - 呼べない場合は **AskUserQuestion** で「better-auth 入れる」か「別 auth 方式 (variants.md 参照)」を確認
- 既存 `db.ts` の export shape を確認: `prisma` または `db` (Drizzle/Kysely) が export されているか
  - 不一致なら queries.ts の `import { prisma } from "../db.js"` を該当 import に書き換える計画を立てる
- `logger.ts` の export shape を確認: `logger.info / logger.warn` が呼べるか

### Step 2: AskUserQuestion で設定値を回収

以下を **AskUserQuestion** で 1 度にまとめて聞く (項目数 3-4):

1. **ADMIN_EMAIL の値**: 既知 email (例: `you+admin@example.com`)
   - 「ハードコードする値（env が未設定の時の fallback）」と「env name」の 2 値を取る
2. **配置先パス**: `apps/server/src/admin` (monorepo) / `src/admin` (single-package) / その他
3. **認証スタック**: better-auth magic link (default) / Email OTP / Basic Auth / Cloudflare Access / OAuth
   - default 以外を選んだら `references/auth-variants.md` を Read して該当セクションに従って routes.ts / middleware.ts を書き換える
4. **テストテンプレを入れるか**: yes (推奨) / no

### Step 3: ディレクトリ一式をコピー

このスキルの `references/admin-template/` 配下（`${CLAUDE_SKILL_DIR}/references/admin-template/`）を、 Step 2 で決めた配置先にコピー:

- `env.ts`
- `middleware.ts`
- `routes.ts`
- `views.ts`
- `queries.ts`
- `README.md`

**コピー時に必ず置換する箇所**:

- `env.ts` の `DEFAULT_ADMIN_EMAIL = "REPLACE_ME@example.com"` → Step 2 で聞いた値
- `import { ... } from "../auth.js"` / `"../db.js"` / `"../logger.js"` → 該当プロジェクトのパスに合わせる

テストテンプレを yes にした場合:

- `references/test-templates/login.test.ts` を `apps/server/tests/admin/login.test.ts` にコピー
- `references/test-templates/middleware.test.ts` を `apps/server/tests/admin/middleware.test.ts` にコピー
- 内部の `REPLACE_ME@example.com` も Step 2 の値で置換

### Step 4: server エントリへの mount

`apps/server/src/index.ts` (またはエントリ相当ファイル) に以下を追記。 編集は `Edit` で:

```ts
import { adminRouter } from "./admin/routes.js";

// 認証 middleware より "後" に mount する (better-auth の cookie が読める位置)
app.use("/admin", adminRouter);
```

### Step 5: env への ADMIN_EMAIL 追加

`.env.example` と `.env` (存在すれば) に追記:

```
# admin dashboard の宛先 email。 未設定なら env.ts の DEFAULT_ADMIN_EMAIL が使われる。
ADMIN_EMAIL=""

# admin/login で生成される magic link の base URL。
SERVER_BASE_URL="http://localhost:3000"
```

`.env.example` がない場合は新規作成する。 `.env` 直書きはしない (= 値はユーザーが手で入れる)。

### Step 6: 動作確認の案内

このスキルでは動作確認は実行しない。 ユーザーに以下の手順を案内する:

```
1. server を起動: pnpm --filter @<your>/server dev (or 該当コマンド)
2. ブラウザで http://localhost:3000/admin/login を開く (404 が返る)
3. ADMIN_EMAIL の inbox に magic link が届くのを確認
4. link を踏んで /admin に飛ぶ → Home が表示される (= admin 経路通過)
5. /admin/users で User 一覧が出る (= Prisma User モデルが正しく繋がっている)
```

magic link が届かない場合は:

- better-auth の `sendMagicLink` callback が実装されているか確認
- SMTP 設定 (`SMTP_HOST` 等) を確認

### Step 7: 「次にどのセクションを足すか」の提案

雛形は Home + Users 2 ページしかない。 ユーザーに **AskUserQuestion** で次の着手を聞く:

1. **エラーログダッシュボード** を足す (error events を fingerprint 集計、 24h/7d/30d range、 sparkline)
2. **ユーザ Detail** を足す (`/users/:id` でその user のタイムライン / イベント / 関連 record)
3. **ドメインモデル一覧** を足す (User 以外のテーブル: orders / posts / sessions 等)
4. **観測イベント** を足す (`AiEvent` 的な generic event 集計)
5. **何も追加しない**。 Home + Users だけで運用開始する

選ばれたものに集中する。 **全部一気に作らない** (= 初期化スキルの責務は基盤導入まで)。

## やってはいけないこと

- 既存 `admin/` の上書き (必ず確認)
- 認可拒否時に 401 / 403 を返す (必ず 404)
- `/admin/login` を POST + form で作る (= 攻撃面が増える)
- `/admin/login` の email をクエリから受け取れる形にする (= open relay 化する)
- `adminRouter.post(...) / .put(...) / .delete(...)` を生やす (READ-only 原則。 必要なら別 router に分離)
- DB クエリで `SELECT *` / `select: { _: true }` 同等を使う (= secret column 漏洩)
- `take:` / `limit` 抜きの list query (= 全件 dump リスク)
- `views.ts` の `raw()` を unsanitized 入力に通す (= XSS sink)
- `Content-Security-Policy` を緩める (`unsafe-inline` を script に拡張する等) (= XSS 影響範囲拡大)
- 「ついでに」既存 auth.ts / db.ts を改造する (= 範囲外。 ユーザーに案内のみ)
- ADMIN_EMAIL を 5 人以上の DL に向ける運用 (= 一人 admin モデルが壊れる。 多人数なら env.ts を `isAdminEmail()` ベースに昇格)

## 参考

- 設計判断と「なぜ」: `references/design-decisions.md`
- 認証方式の差し替え (Email OTP / Basic Auth / Cloudflare Access / OAuth): `references/auth-variants.md`
- ORM の差し替え (Drizzle / Kysely / 生 SQL / Mongo): `references/orm-variants.md`
- Web フレームワークの差し替え (Fastify / Hono / Next.js): `references/framework-variants.md`
- 投入される雛形: `references/admin-template/`
- テストテンプレ: `references/test-templates/`
