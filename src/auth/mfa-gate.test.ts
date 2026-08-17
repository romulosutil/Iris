import { describe, expect, test } from "vitest";
import { assertMfaBypassSafe } from "./mfa-gate";

const env = (
  NODE_ENV: string,
  BYPASS_MFA_FOR_DEV?: string,
  NEXT_PHASE?: string,
): NodeJS.ProcessEnv =>
  ({ NODE_ENV, BYPASS_MFA_FOR_DEV, NEXT_PHASE }) as NodeJS.ProcessEnv;

describe("assertMfaBypassSafe (A5 — fail-closed)", () => {
  test("produção + bypass=true ⇒ lança (não sobe)", () => {
    expect(() => assertMfaBypassSafe(env("production", "true"))).toThrow(
      /produção/i,
    );
  });

  test("produção + bypass ausente/false ⇒ ok", () => {
    expect(() => assertMfaBypassSafe(env("production"))).not.toThrow();
    expect(() => assertMfaBypassSafe(env("production", "false"))).not.toThrow();
  });

  test("dev/test + bypass=true ⇒ ok (permitido fora de produção)", () => {
    expect(() => assertMfaBypassSafe(env("development", "true"))).not.toThrow();
    expect(() => assertMfaBypassSafe(env("test", "true"))).not.toThrow();
  });

  test("produção + bypass=true durante next build ⇒ ok (falso-positivo)", () => {
    // next build seta NEXT_PHASE numa máquina de dev; o boot NÃO seta.
    expect(() =>
      assertMfaBypassSafe(env("production", "true", "phase-production-build")),
    ).not.toThrow();
  });

  test("produção + bypass=true no boot (sem NEXT_PHASE) ⇒ ainda lança", () => {
    expect(() => assertMfaBypassSafe(env("production", "true"))).toThrow(
      /produção/i,
    );
  });
});
