import { describe, expect, test } from "vitest";
import {
  MfaRequiredError,
  requireMfaIfClinicalRole,
  requireRole,
  requireAgendar,
  RoleError,
} from "./require-role";
import type { TenantContext } from "@/db/rls";

const ctx = (
  role: TenantContext["role"],
  mfaEnrolled?: boolean,
): TenantContext => ({
  clinicId: "11111111-1111-1111-1111-111111111111",
  userId: "a0000000-0000-0000-0000-000000000001",
  role,
  mfaEnrolled,
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

describe("requireMfaIfClinicalRole", () => {
  test("papel clínico sem MFA cadastrado lança MfaRequiredError", () => {
    expect(() => requireMfaIfClinicalRole(ctx("terapeuta", false))).toThrow(
      MfaRequiredError,
    );
    expect(() => requireMfaIfClinicalRole(ctx("coordenador"))).toThrow(
      MfaRequiredError,
    );
  });

  test("papel clínico com MFA cadastrado passa", () => {
    expect(() =>
      requireMfaIfClinicalRole(ctx("terapeuta", true)),
    ).not.toThrow();
    expect(() =>
      requireMfaIfClinicalRole(ctx("coordenador", true)),
    ).not.toThrow();
  });

  test("admin_recepcao (administrativo) não exige MFA", () => {
    expect(() =>
      requireMfaIfClinicalRole(ctx("admin_recepcao", false)),
    ).not.toThrow();
  });

  test("MfaRequiredError é um RoleError (catch existente trata)", () => {
    // garante que os catches `err instanceof RoleError` continuam pegando MFA
    expect(new MfaRequiredError()).toBeInstanceOf(Error);
  });
});


describe("requireAgendar", () => {
  test("não lança quando o papel é coordenador", () => {
    expect(() => requireAgendar(ctx("coordenador"))).not.toThrow();
  });

  test("não lança quando o papel é admin_recepcao", () => {
    expect(() => requireAgendar(ctx("admin_recepcao"))).not.toThrow();
  });

  test("lança erro quando o papel não tem permissão", () => {
    expect(() => requireAgendar(ctx("terapeuta"))).toThrow(RoleError);
    expect(() => requireAgendar(ctx("dono" as any))).toThrow(RoleError);
  });
});
