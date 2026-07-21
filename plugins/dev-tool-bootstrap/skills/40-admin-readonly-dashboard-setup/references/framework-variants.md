# Web フレームワークの差し替え

デフォルトは **Express** 想定。 他フレームワークに乗せ替える場合の最小書き換え。

## どのフレームワークでも変えてはいけないこと

1. **`/admin/login` を `requireAdmin` の "前" に登録する** (= login だけは認可なしで通過する必要がある)
2. **拒否時は 404 のレスポンスを返す** (status + `<h1>Not Found</h1>` でフェイク 404 を演出)
3. **READ-only catch-all を末尾に置く** (= GET 以外と未知 URL を全部 404)
4. **レスポンスヘッダ 4 種類 (CSP / X-Frame-Options / Cache-Control / Referrer-Policy) は必ず付ける**

## (1) Express (default)

```ts
import { Router } from "express";
export const adminRouter = Router();

adminRouter.get("/login", (req, res) => { /* 404 + side effect */ });
adminRouter.use(requireAdmin);
adminRouter.get("/", ...);
adminRouter.all(/.*/, (_req, res) => res.status(404).send("<h1>Not Found</h1>"));

// マウント
app.use("/admin", adminRouter);
```

## (2) Fastify

```ts
import type { FastifyInstance } from "fastify";

export async function adminPlugin(fastify: FastifyInstance) {
  // /admin/login は preHandler 前に登録
  fastify.get("/login", async (req, reply) => {
    reply.code(404).type("text/html").send("<h1>Not Found</h1>");
    auth.api.signInMagicLink({ /* ... */ }).catch(() => {});
  });

  // 認可フック
  fastify.addHook("preHandler", async (req, reply) => {
    if (req.url === "/admin/login") return; // login は除外
    const session = await getSessionFromRequest(req.raw);
    if (!session || session.user.email !== getAdminEmail()) {
      reply.code(404).type("text/html").send("<h1>Not Found</h1>");
    }
  });

  fastify.get("/", async (req, reply) => { /* render */ });

  // catch-all (404)
  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404).type("text/html").send("<h1>Not Found</h1>");
  });
}

app.register(adminPlugin, { prefix: "/admin" });
```

## (3) Hono

```ts
import { Hono } from "hono";

export const adminApp = new Hono();

adminApp.get("/login", (c) => {
  // side effect: magic link
  auth.api.signInMagicLink({ /* ... */ }).catch(() => {});
  return c.html("<h1>Not Found</h1>", 404);
});

adminApp.use("*", async (c, next) => {
  const session = await getSessionFromRequest(c.req.raw);
  if (!session || session.user.email !== getAdminEmail()) {
    return c.html("<h1>Not Found</h1>", 404);
  }
  await next();
});

adminApp.get("/", (c) => c.html(layout("Home", body).value));

adminApp.all("*", (c) => c.html("<h1>Not Found</h1>", 404));

app.route("/admin", adminApp);
```

## (4) Next.js App Router (API + page)

Next.js は HTML page と API route の境界があるので、 admin は **dedicated layout 配下に置く + middleware で守る** のがクリーン。

```ts
// app/admin/layout.tsx (Server Component)
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";

export default async function AdminLayout({ children }) {
  const session = await getSessionFromRequest({ headers: headers() });
  if (!session || session.user.email !== process.env.ADMIN_EMAIL) {
    notFound();  // 404 ページに飛ぶ
  }
  return <>{children}</>;
}

// app/admin/login/route.ts
export async function GET() {
  void auth.api.signInMagicLink({ /* ... */ });
  return new Response("<h1>Not Found</h1>", {
    status: 404,
    headers: { "content-type": "text/html" },
  });
}
```

## レスポンスヘッダの貼り方

どのフレームワークでも、 ヘッダを設定する `renderHtml(res, page)` 相当のヘルパに集約する。 個別ルートで貼り忘れる事故を防ぐ。

Express:
```ts
res.setHeader("Content-Security-Policy", "default-src 'none'; ...");
```

Fastify:
```ts
reply.header("Content-Security-Policy", "default-src 'none'; ...");
```

Hono:
```ts
c.header("Content-Security-Policy", "default-src 'none'; ...");
```

Next.js (`route.ts`):
```ts
return new Response(html, { headers: { "Content-Security-Policy": "..." } });
```
