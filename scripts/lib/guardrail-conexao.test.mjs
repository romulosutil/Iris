import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLAG_REMOTO,
  assertScriptRemotoPermitido,
  isLocalDatabase,
} from "./guardrail-conexao.mjs";

/**
 * Cobertura do helper genérico (#534). A lógica de host é a mesma do D52 e já
 * é exercitada exaustivamente em `guardrail-seed.test.ts` (que agora passa por
 * aqui) — este arquivo cobre só o que é próprio do helper: rótulo, flag
 * compartilhada e mensagem sem "seed".
 */
describe("assertScriptRemotoPermitido", () => {
  const original = process.env[FLAG_REMOTO];

  beforeEach(() => {
    delete process.env[FLAG_REMOTO];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG_REMOTO];
    else process.env[FLAG_REMOTO] = original;
    vi.restoreAllMocks();
  });

  it("falha sem URL, nomeando o script", () => {
    expect(() =>
      assertScriptRemotoPermitido(undefined, { rotulo: "unlock-user" }),
    ).toThrow(/\[GUARDRAIL unlock-user\] URL do banco não informada/);
  });

  it("libera localhost sem flag", () => {
    expect(
      assertScriptRemotoPermitido("postgres://iris:x@localhost:5433/iris", {
        rotulo: "backfill-evidence",
      }),
    ).toEqual({ isLocal: true, host: "localhost" });
  });

  it("bloqueia banco remoto sem a flag, com mensagem do script (não de seed)", () => {
    expect(() =>
      assertScriptRemotoPermitido("postgres://iris:x@db.prod.internal/iris", {
        rotulo: "unlock-user",
      }),
    ).toThrow(
      /\[GUARDRAIL unlock-user\] Execução bloqueada: o banco de destino \("db\.prod\.internal"\)/,
    );
  });

  it("bloqueia remoto quando a flag tem outro valor", () => {
    process.env[FLAG_REMOTO] = "yes";
    expect(() =>
      assertScriptRemotoPermitido("postgres://iris:x@db.prod.internal/iris"),
    ).toThrow(/\[GUARDRAIL script\] Execução bloqueada/);
  });

  it("libera remoto com ALLOW_SEED_REMOTE=true (mesma flag do seed) e avisa", () => {
    process.env[FLAG_REMOTO] = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      assertScriptRemotoPermitido(
        "postgres://iris:x@db.staging.internal/iris",
        {
          rotulo: "smoke-alerta-risco",
        },
      ),
    ).toEqual({ isLocal: false, host: "db.staging.internal" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[GUARDRAIL smoke-alerta-risco] ALLOW_SEED_REMOTE=true detectado. Executando contra banco remoto: "db.staging.internal"',
      ),
    );
  });

  it("aceita allowRemoteEnv explícito (sem ler process.env)", () => {
    process.env[FLAG_REMOTO] = "true";
    expect(() =>
      assertScriptRemotoPermitido("postgres://iris:x@db.prod.internal/iris", {
        allowRemoteEnv: undefined,
      }),
    ).toThrow(/Execução bloqueada/);
  });

  it("isLocalDatabase é o mesmo predicado", () => {
    expect(isLocalDatabase("postgres://iris:x@127.0.0.1:5433/iris")).toBe(true);
    expect(isLocalDatabase("postgres://iris:x@db.prod.internal/iris")).toBe(
      false,
    );
  });
});
