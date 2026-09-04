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

1. 投入先を確認する。`apps/server/src/` (monorepo) か `src/` (single-package) か。既存の `admin/` があれば **AskUserQuestion** で「既存を残してマージ / 退避してから入れ直し / 中止」を確認する。
2. 既存の `auth.ts` (`auth.api.signInMagicLink(...)` / `getSessionFromRequest(req)`)、 `db.ts` (`prisma` or `db`)、 `logger.ts` (`logger.info / logger.warn`) の export shape を確認する。合わなければ **AskUserQuestion** で「better-auth 入れる」か「別 auth 方式 (variants.md 参照)」を確認し、 import の書き換え計画を立てる。
3. **AskUserQuestion** で 1 度にまとめて聞く: ADMIN_EMAIL の値 (env 未設定時の fallback) と env name、 配置先パス、 認証スタック (default: better-auth magic link)、 テストテンプレを入れるか。 default 以外の認証を選んだら `references/auth-variants.md` の該当セクションに従って routes.ts / middleware.ts を書き換える。
4. `${CLAUDE_SKILL_DIR}/references/admin-template/` (テストを選んだ場合は `references/test-templates/` も `apps/server/tests/admin/` へ) をコピーする。 `REPLACE_ME@example.com` と `../auth.js` / `../db.js` / `../logger.js` の import は該当プロジェクトに合わせて必ず置換する。
5. server エントリで `app.use("/admin", adminRouter)` を **認証 middleware より後** に mount する (better-auth の cookie が読める位置)。
6. `.env.example` (存在すれば `.env` も) に `ADMIN_EMAIL` と `SERVER_BASE_URL` を追記する。 `.env` に値を直書きしない (= 値はユーザーが手で入れる)。
7. 動作確認はこのスキルでは実行せず、 ユーザーに案内する: server 起動 → `/admin/login` を開く (404 が返る) → ADMIN_EMAIL の inbox に magic link が届く → `/admin` で Home、 `/admin/users` で User 一覧が出る。 届かない場合は better-auth の `sendMagicLink` callback と SMTP 設定を確認する。
8. 雛形は Home + Users 2 ページしかない。 **AskUserQuestion** で次に足すセクション (エラーログダッシュボード / ユーザ Detail / ドメインモデル一覧 / 観測イベント / 何も追加しない) を聞き、 選ばれたものに集中する。 **全部一気に作らない** (= 初期化スキルの責務は基盤導入まで)。

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
