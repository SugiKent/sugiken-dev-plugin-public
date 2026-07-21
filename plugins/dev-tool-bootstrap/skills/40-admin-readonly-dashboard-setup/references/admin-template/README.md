# admin (READ-only dashboard)

社内運用 / 個人開発オーナー向けの **READ 専用** 管理画面。 認証は magic link、認可は単一 admin email 一致。

## 使い方

1. `.env` (または Railway / Vercel 等の secret store) に `ADMIN_EMAIL=you@example.com` を設定する。
2. `apps/server/src/index.ts` 等のエントリで router を mount する:
   ```ts
   import { adminRouter } from "./admin/routes.js";
   app.use("/admin", adminRouter);
   ```
3. ブラウザで `https://<your-app>/admin/login` を開く。 画面は 404 が返るが、 background で `ADMIN_EMAIL` に magic link が届く。 メールのリンクを踏むと session が張られる。
4. その後 `https://<your-app>/admin` を開けば session が一致するので各セクションに入れる。

## セクションを足す

1. `queries.ts` に READ-only 関数を生やす (`select:` で必要列のみ、 `take:` で上限を付ける)
2. `routes.ts` に `adminRouter.get("/<section>", async (...) => { ... })` を **catch-all `.all(/.*/)` より上に** 追加
3. `views.ts` の `navLinks` に新セクションへのリンクを足す
4. 必要なら専用テストを `tests/admin/` に書く (template は skill の `references/test-templates/` 参照)

## やってはいけないこと

- **書き込みルートを足さない**。 POST/PUT/DELETE は catch-all で 404 になる。 必要になったら別 router (`/internal-write/*` 等) を分離し、 ADMIN_EMAIL 以外の追加 factor (Cloudflare Access / OTP / 2nd device 確認等) を必ず併用する
- **エラー時に 401/403 を返さない**。 必ず 404。 「admin が存在する」事実を漏らさない
- **`raw()` を unsanitized 入力に通さない**。 ユーザ入力 / DB の自由記述は必ず `html\`\${value}\`` 経由で interpolate する
- **`/admin/login` の email をクエリで上書きできる形にしない**。 hardcode された `ADMIN_EMAIL` 以外の宛先に magic link を出すと open relay になる

## 認証 / ORM / フレームワークを差し替えたいとき

skill の `references/`:
- `auth-variants.md` — better-auth magic link 以外 (Email OTP / Basic Auth / OAuth) への差し替え案
- `orm-variants.md` — Prisma 以外 (Drizzle / Kysely / 生 SQL) での書き直し
- `framework-variants.md` — Express 以外 (Fastify / Hono) への移植
