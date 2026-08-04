import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

// Mock better-auth
vi.mock("@/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock db client
vi.mock("@/db/client", () => ({
  authDb: {
    select: vi.fn(),
  },
}));

import { exigirSuperAdmin, isSuperAdmin } from "./super-admin";
import { auth } from "@/auth/auth";
import { authDb } from "@/db/client";
import { notFound } from "next/navigation";

describe("Super Admin Auth Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chama notFound() quando usuário não está autenticado", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    await expect(exigirSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("chama notFound() quando usuário não tem is_super_admin = true", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "user-1", email: "user@test.com" },
      session: { id: "sess-1" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValueOnce([{ isSuperAdmin: false }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(authDb.select).mockReturnValueOnce({ from: mockFrom } as any);

    await expect(exigirSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("retorna o ID do usuário quando o usuário é super admin", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: { id: "super-user-id", email: "admin@iris.com" },
      session: { id: "sess-2" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValueOnce([{ isSuperAdmin: true }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(authDb.select).mockReturnValueOnce({ from: mockFrom } as any);

    const res = await exigirSuperAdmin();
    expect(res).toEqual({ userId: "super-user-id", email: "admin@iris.com" });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("isSuperAdmin retorna false para usuário normal e true para super admin", async () => {
    const mockLimit1 = vi.fn().mockResolvedValueOnce([{ isSuperAdmin: false }]);
    const mockWhere1 = vi.fn().mockReturnValue({ limit: mockLimit1 });
    const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });
    vi.mocked(authDb.select).mockReturnValueOnce({ from: mockFrom1 } as any);

    const res1 = await isSuperAdmin("user-normal");
    expect(res1).toBe(false);

    const mockLimit2 = vi.fn().mockResolvedValueOnce([{ isSuperAdmin: true }]);
    const mockWhere2 = vi.fn().mockReturnValue({ limit: mockLimit2 });
    const mockFrom2 = vi.fn().mockReturnValue({ where: mockWhere2 });
    vi.mocked(authDb.select).mockReturnValueOnce({ from: mockFrom2 } as any);

    const res2 = await isSuperAdmin("user-super");
    expect(res2).toBe(true);
  });
});
