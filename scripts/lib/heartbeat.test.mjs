/**
 * #536 (DA-03) — helper de heartbeat dos jobs de infra.
 *
 * O que se prova aqui, sem banco:
 *  - `detalheSemPii` só deixa passar NÚMEROS e booleanos: qualquer string
 *    (id, nome, trecho, `message` de erro) é descartada na origem, e não
 *    depende de quem chama lembrar de filtrar.
 *  - `gravarHeartbeat` chama a função definer da 0143 com `(job, ok, detalhe)`
 *    e NUNCA lança: um heartbeat que falha não pode transformar uma varredura
 *    bem-sucedida em exit != 0 — o alarme (ausência de heartbeat) é o canal
 *    certo para essa falha, não o laço do job.
 *  - No log da falha vai `name` + `code`, nunca `message` (que num erro de
 *    driver carrega SQL + params).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { detalheSemPii, gravarHeartbeat } from "./heartbeat.mjs";

function sqlDubleQueGrava(chamadas) {
  return function sql(strings, ...valores) {
    chamadas.push({ texto: strings.join("?"), valores });
    return Promise.resolve([]);
  };
}

function sqlDubleQueLanca(err) {
  return function sql() {
    return Promise.reject(err);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("heartbeat.mjs — detalheSemPii (#536)", () => {
  test("só números e booleanos entram; strings são descartadas", () => {
    const detalhe = detalheSemPii({
      avisados: 3,
      arquivados: 0,
      dryRun: false,
      nome: "Paciente Fulano",
      id: "00000000-0000-0000-0000-000000000001",
      mensagem: "permission denied for table patient",
    });
    expect(detalhe).toBe("avisados=3 arquivados=0 dryRun=false");
    expect(detalhe).not.toContain("Fulano");
    expect(detalhe).not.toContain("0000");
    expect(detalhe).not.toContain("permission");
  });

  test("objeto vazio ou sem numérico → string vazia, não 'undefined'", () => {
    expect(detalheSemPii({})).toBe("");
    expect(detalheSemPii({ nome: "x" })).toBe("");
  });

  test("NaN e Infinity não passam — não são contagem", () => {
    expect(detalheSemPii({ a: NaN, b: Infinity, c: 2 })).toBe("c=2");
  });
});

describe("heartbeat.mjs — gravarHeartbeat (#536)", () => {
  test("ok → chama app_job_heartbeat_gravar(job, true, detalhe) e devolve true", async () => {
    const chamadas = [];
    const sql = sqlDubleQueGrava(chamadas);
    const resultado = await gravarHeartbeat(sql, "retencao", {
      ok: true,
      detalhe: "avisados=3",
    });
    expect(resultado).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].texto).toContain("app_job_heartbeat_gravar(");
    expect(chamadas[0].valores).toEqual(["retencao", true, "avisados=3"]);
  });

  test("erro → chama com ok=false e detalhe de categoria", async () => {
    const chamadas = [];
    const sql = sqlDubleQueGrava(chamadas);
    await gravarHeartbeat(sql, "arquivamento", {
      ok: false,
      detalhe: "erro=PostgresError code=42501",
    });
    expect(chamadas[0].valores).toEqual([
      "arquivamento",
      false,
      "erro=PostgresError code=42501",
    ]);
  });

  test("detalhe omitido → string vazia, nunca undefined no banco", async () => {
    const chamadas = [];
    await gravarHeartbeat(sqlDubleQueGrava(chamadas), "asr-sweeper", {
      ok: true,
    });
    expect(chamadas[0].valores).toEqual(["asr-sweeper", true, ""]);
  });

  test("banco lança → NÃO propaga, devolve false, loga name+code e não a message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = Object.assign(
      new Error(
        "SELECT app_job_heartbeat_gravar($1) -- params: Paciente Fulano",
      ),
      { name: "PostgresError", code: "42501" },
    );
    const resultado = await gravarHeartbeat(sqlDubleQueLanca(err), "retencao", {
      ok: true,
    });
    expect(resultado).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const logado = warn.mock.calls[0].join(" ");
    expect(logado).toContain("PostgresError");
    expect(logado).toContain("42501");
    expect(logado).not.toContain("Fulano");
  });
});
