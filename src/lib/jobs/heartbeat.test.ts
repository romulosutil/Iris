/**
 * #536 — heartbeat das rotas internas de job. Mesmas garantias do helper
 * `.mjs` (scripts/lib/heartbeat.test.mjs), agora do lado do app.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

const chamadas: { texto: string; valores: unknown[] }[] = [];
let proximoErro: unknown = null;

vi.mock("@/db/client", () => ({
  sql: (strings: TemplateStringsArray, ...valores: unknown[]) => {
    chamadas.push({ texto: strings.join("?"), valores });
    if (proximoErro) return Promise.reject(proximoErro);
    return Promise.resolve([]);
  },
}));

const { detalheDoErro, detalheSemPii, registrarHeartbeat } =
  await import("./heartbeat");

afterEach(() => {
  chamadas.length = 0;
  proximoErro = null;
  vi.restoreAllMocks();
});

describe("heartbeat.ts — detalheSemPii / detalheDoErro (#536)", () => {
  test("só números e booleanos entram; strings (id, nome, message) ficam de fora", () => {
    expect(
      detalheSemPii({
        processados: 2,
        expirados: null,
        ok: true,
        clinicId: "00000000-0000-0000-0000-000000000001",
        error: "permission denied",
      }),
    ).toBe("processados=2 ok=true");
  });

  test("detalheDoErro: name + code, nunca a message", () => {
    const err = Object.assign(new Error("SELECT … params: Fulano"), {
      name: "PostgresError",
      code: "42501",
    });
    expect(detalheDoErro(err)).toBe("erro=PostgresError code=42501");
    expect(detalheDoErro("x")).toBe("erro=desconhecido");
  });
});

describe("heartbeat.ts — registrarHeartbeat (#536)", () => {
  test("chama app_job_heartbeat_gravar(job, ok, detalhe) via o cliente de app", async () => {
    expect(await registrarHeartbeat("exportacao", true, "processados=2")).toBe(
      true,
    );
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.texto).toContain("app_job_heartbeat_gravar(");
    expect(chamadas[0]!.valores).toEqual(["exportacao", true, "processados=2"]);
  });

  test("banco lança → devolve false, loga name+code, NUNCA propaga nem loga a message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    proximoErro = Object.assign(new Error("params: Paciente Fulano"), {
      name: "PostgresError",
      code: "42501",
    });

    expect(await registrarHeartbeat("asr", false, "erro=x")).toBe(false);

    const logado = warn.mock.calls[0]!.join(" ");
    expect(logado).toContain("42501");
    expect(logado).not.toContain("Fulano");
  });
});
