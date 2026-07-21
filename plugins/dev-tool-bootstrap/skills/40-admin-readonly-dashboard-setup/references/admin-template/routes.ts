import { Router } from "express";
import { auth } from "../auth.js";
import { logger } from "../logger.js";
import { requireAdmin } from "./middleware.js";
import { getAdminEmail } from "./env.js";
import { fmtDate, html, layout, renderHtml } from "./views.js";
import { listUsers } from "./queries.js";

export const adminRouter = Router();

// ----------------------------------------------------------------------------
// `/admin/login` は requireAdmin の "前" に登録する。
// 仕掛け:
//  - 常に 404 を返す (= 存在を隠す)
//  - 副作用として固定の admin email に magic link を発火する
//  - 宛先 email はリクエストから変更できない (= enumeration / spray 不可)
// 「URL を叩くだけで自分の inbox に magic link が届く」状態にして、 form/ パスワード/
// ログインボタン等の attack surface をゼロにする。
// ----------------------------------------------------------------------------
adminRouter.get("/login", (_req, res) => {
  res.status(404).type("html").send("<h1>Not Found</h1>");
  const baseURL = process.env.SERVER_BASE_URL ?? "http://localhost:3000";
  auth.api
    .signInMagicLink({
      body: {
        email: getAdminEmail(),
        callbackURL: `${baseURL}/admin`,
      },
      headers: new Headers({ origin: baseURL }),
    })
    .catch((err: unknown) => {
      logger.warn(
        {
          event: "admin.login.send_failed",
          err: err instanceof Error ? err.message : String(err),
        },
        "admin login magic link send failed",
      );
    });
});

// この行以降のすべてのルートは requireAdmin で守られる。
adminRouter.use(requireAdmin);

// ----------------------------------------------------------------------------
// Home: セクション一覧。 増やしたら views.ts の navLinks にも同期する。
// ----------------------------------------------------------------------------
adminRouter.get("/", (_req, res) => {
  const body = html`
    <p class="muted">READ-only admin dashboard.</p>
    <ul class="menu">
      <li><a href="/admin/users">Users</a> — 登録ユーザー一覧</li>
    </ul>
  `;
  renderHtml(res, layout("Home", body));
});

// ----------------------------------------------------------------------------
// Users: 最低限のスキャフォールド。
// ここを起点に「Detail ページを足す」「フィルタを足す」「他テーブルを横並べる」を進める。
// ----------------------------------------------------------------------------
adminRouter.get("/users", async (_req, res, next) => {
  try {
    const rows = await listUsers();
    const body = html`
      <p class="muted">${rows.length} users (最新 200 件)</p>
      <table>
        <thead>
          <tr>
            <th>email</th>
            <th>id</th>
            <th>createdAt</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (u) => html`
              <tr>
                <td>${u.email}</td>
                <td class="mono">${u.id}</td>
                <td class="mono">${fmtDate(u.createdAt)}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
    renderHtml(res, layout("Users", body));
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// READ-only catch-all.
// GET 以外 (POST/PUT/DELETE/PATCH) はすべて 404 で潰す。
// 既知 GET にマッチしなかった URL も 404 (= existence の漏れを防ぐ)。
//
// このルートは router の "最後" に登録する。 これより上で adminRouter.post(...) を生やしても、
// この catch-all は通らない (Express の挙動)。 だが READ-only 原則を破る行為そのものを
// レビューで止めるべき。
// ----------------------------------------------------------------------------
adminRouter.all(/.*/, (_req, res) => {
  res.status(404).type("html").send("<h1>Not Found</h1>");
});
