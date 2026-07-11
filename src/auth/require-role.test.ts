import { describe, expect, test } from "vitest";
import { requireRole } from "./require-role";
import type { TenantContext } from "@/db/rls";

const ctx = (role: TenantContext["role"]): TenantContext => ({
  clinicId: "11111111-1111-1111-1111-111111111111",
  userId: "a0000000-0000-0000-0000-000000000001",
  role,
});

describe("requireRole", () => {
  test("não lança quando o papel está na lista permitida", () => {
    expect(() => requireRole(ctx("coordenador"), "coordenador")).not.toThrow();
  });

  test("lança erro descritivo quando o papel não está na lista", () => {
    expect(() => requireRole(ctx("admin_recepcao"), "coordenador")).toThrow(
      /admin_recepcao.*coordenador/,
    );
  });

  test("aceita múltiplos papéis permitidos", () => {
    expect(() =>
      requireRole(ctx("terapeuta"), "coordenador", "terapeuta"),
    ).not.toThrow();
  });
});
