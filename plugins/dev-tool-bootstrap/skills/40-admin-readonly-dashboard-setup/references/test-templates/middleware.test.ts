// テンプレ: `requireAdmin` の挙動を vitest で固める。
// - session なし → 404
// - session あり / email 不一致 → 404
// - session あり / email 一致 → next() を通過
// - 拒否時に 401 / 403 を返していないこと

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("../../src/auth.js", () => ({
  getSessionFromRequest: getSessionMock,
}));

vi.mock("../../src/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

import { requireAdmin } from "../../src/admin/middleware.js";

function mockRes(): Response & {
  _status?: number;
  _body?: string;
} {
  const res: Partial<Response> & { _status?: number; _body?: string } = {};
  res.status = vi.fn((n: number) => {
    res._status = n;
    return res as Response;
  }) as unknown as Response["status"];
  res.type = vi.fn(() => res as Response) as unknown as Response["type"];
  res.send = vi.fn((b: string) => {
    res._body = b;
    return res as Response;
  }) as unknown as Response["send"];
  return res as Response & { _status?: number; _body?: string };
}

beforeEach(() => {
  getSessionMock.mockReset();
  delete process.env.ADMIN_EMAIL;
});

describe("requireAdmin", () => {
  it("returns 404 when session is missing", async () => {
    getSessionMock.mockResolvedValue(null);
    const req = { path: "/admin" } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    await requireAdmin(req, res, next);
    expect(res._status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when session email != ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    getSessionMock.mockResolvedValue({
      user: { id: "u1", email: "other@example.com" },
    });
    const req = { path: "/admin" } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    await requireAdmin(req, res, next);
    expect(res._status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when session email == ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    getSessionMock.mockResolvedValue({
      user: { id: "u1", email: "admin@example.com" },
    });
    const req = { path: "/admin" } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    await requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeUndefined();
  });

  it("never returns 401 or 403", async () => {
    getSessionMock.mockResolvedValue(null);
    const req = { path: "/admin" } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    await requireAdmin(req, res, next);
    expect(res._status).not.toBe(401);
    expect(res._status).not.toBe(403);
  });
});
