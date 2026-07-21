// テンプレ: `/admin/login` の挙動を vitest で固める。
// - 常に 404 を返す
// - magic link が ADMIN_EMAIL に飛ぶ
// - クエリで email を上書きできない
// - 失敗しても 404
// - session を一切引かない (login だけは未認可で通過)
//
// vi.mock のパス (`../../src/auth.js` 等) はプロジェクト構成に合わせて書き換える。

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

const { signInMagicLinkMock, getSessionMock } = vi.hoisted(() => ({
  signInMagicLinkMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("../../src/auth.js", () => ({
  auth: { api: { signInMagicLink: signInMagicLinkMock } },
  getSessionFromRequest: getSessionMock,
}));

vi.mock("../../src/db.js", () => ({ prisma: {} }));

import { adminRouter } from "../../src/admin/routes.js";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use("/admin", adminRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  signInMagicLinkMock.mockReset();
  signInMagicLinkMock.mockResolvedValue({ ok: true });
  getSessionMock.mockReset();
  delete process.env.ADMIN_EMAIL;
  process.env.SERVER_BASE_URL = "http://localhost:3000";
});

describe("GET /admin/login", () => {
  function firstCallBody(): { email: string; callbackURL: string } {
    const arg = signInMagicLinkMock.mock.calls[0]?.[0] as
      | { body?: { email?: string; callbackURL?: string } }
      | undefined;
    return {
      email: arg?.body?.email ?? "",
      callbackURL: arg?.body?.callbackURL ?? "",
    };
  }

  it("returns 404 and dispatches magic link to the admin email", async () => {
    const res = await fetch(`${baseUrl}/admin/login`);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(signInMagicLinkMock).toHaveBeenCalledTimes(1);
    const body = firstCallBody();
    expect(body.email).toBe("REPLACE_ME@example.com");
    expect(body.callbackURL).toBe("http://localhost:3000/admin");
  });

  it("ignores query email and always uses ADMIN_EMAIL", async () => {
    const res = await fetch(
      `${baseUrl}/admin/login?email=attacker@example.com`,
    );
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(firstCallBody().email).toBe("REPLACE_ME@example.com");
  });

  it("honors ADMIN_EMAIL env override", async () => {
    process.env.ADMIN_EMAIL = "override@example.com";
    const res = await fetch(`${baseUrl}/admin/login`);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(firstCallBody().email).toBe("override@example.com");
  });

  it("still returns 404 when magic link dispatch fails", async () => {
    signInMagicLinkMock.mockRejectedValueOnce(new Error("throttled"));
    const res = await fetch(`${baseUrl}/admin/login`);
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(signInMagicLinkMock).toHaveBeenCalledTimes(1);
  });

  it("does not require auth (no session ever consulted)", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/admin/login`);
    expect(res.status).toBe(404);
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
