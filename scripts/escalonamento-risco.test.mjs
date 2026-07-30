import { afterEach, describe, expect, test } from "vitest";
import { processarEmailRt } from "./escalonamento-risco.mjs";

// Fake mínimo do postgres.js: só precisa responder ao shape de tagged
// template usado por processarEmailRt, e registrar as chamadas pra
// verificação. Sem banco real (nenhum vi.mock no repo — convenção).
function makeFakeSql({ rtRows = [] } = {}) {
  const chamadas = [];
  function sql(strings) {
    const texto = strings.join("?");
    chamadas.push(texto);
    if (texto.includes("app_rt_do_alerta")) return Promise.resolve(rtRows);
    if (texto.includes("app_registrar_email_rt")) return Promise.resolve([]);
    return Promise.resolve([]);
  }
  sql.chamadas = chamadas;
  return sql;
}

describe("escalonamento-risco.mjs — processarEmailRt (#126)", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
  });

  test("sem RT resolvido: registra falha explícita, não lança", async () => {
    const sql = makeFakeSql({ rtRows: [] });
    await expect(processarEmailRt(sql, "alerta-1")).resolves.toBeUndefined();
    expect(sql.chamadas.some((c) => c.includes("app_registrar_email_rt"))).toBe(true);
    expect(sql.chamadas.some((c) => c.includes("app_rt_do_alerta"))).toBe(true);
  });

  test("com RT mas sem EMAIL_PROVIDER_API_KEY: registra falha (canal indisponível), não lança", async () => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    const sql = makeFakeSql({ rtRows: [{ rt_email: "rt@clinica.example", rt_nome: "RT" }] });
    await expect(processarEmailRt(sql, "alerta-2")).resolves.toBeUndefined();
    expect(sql.chamadas.some((c) => c.includes("app_registrar_email_rt"))).toBe(true);
  });
});
