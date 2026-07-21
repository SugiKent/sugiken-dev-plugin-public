import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import { getSessionFromRequest } from "../auth.js";
import { getAdminEmail } from "./env.js";

// admin ルートの認可ガード。
// 「拒否時は常に 404」が鉄則。 401/403 を返すと「admin が存在する」ことが洩れる。
// 一致する email の session のみ next() に進める。

function notFound(res: Response): void {
  res.status(404).type("html").send("<h1>Not Found</h1>");
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await getSessionFromRequest(req);

  if (!session) {
    logger.warn({
      event: "admin.rejected",
      reason: "no_session",
      route: req.path,
    });
    notFound(res);
    return;
  }

  if (session.user.email !== getAdminEmail()) {
    logger.warn({
      event: "admin.rejected",
      reason: "not_admin",
      route: req.path,
    });
    notFound(res);
    return;
  }

  logger.info({
    event: "admin.access",
    userId: session.user.id,
    route: req.path,
  });

  next();
}
