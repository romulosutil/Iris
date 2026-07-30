import { afterEach, describe, expect, test } from "vitest";
import { processarEmailRt } from "./escalonamento-risco.mjs";

// Fake mínimo do postgres.js: só precisa responder ao shape de tagged
// template usado por processarEmailRt, e registrar as chamadas pra
// verificação. Sem banco real (nenhum vi.mock no repo — convenção).
function makeFakeSql({ rtRows = [] } = {}) {
  const chamadas = [];
  const registros = [];
  function sql(strings, ...valores) {
    const texto = strings.join("?");
    chamadas.push(texto);
    if (texto.includes("app_rt_do_alerta")) return Promise.resolve(rtRows);
    if (texto.includes("app_registrar_email_rt")) {
      // (p_alerta, p_sucesso, p_detalhe). Atenção: p_sucesso é literal no
      // template SQL, não interpolação — só p_alerta e p_detalhe chegam em
      // `valores`. Por isso o booleano sai do texto, não do array.
      const sucesso = /app_registrar_email_rt\(\?,\s*true,/.test(texto);
      registros.push({ alerta: valores[0], sucesso, detalhe: valores[1] });
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }
  sql.chamadas = chamadas;
  sql.registros = registros;
  return sql;
}

describe("escalonamento-risco.mjs — processarEmailRt (#126)", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
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

  // O e-mail não carrega nada de clínico de propósito, então o link pro painel
  // é a única ação possível pro RT. Sem NEXT_PUBLIC_APP_URL (o caso real do
  // serviço iris-escalonamento, que não tinha essa var), enviar assim mesmo
  // gravaria `_enviado` para uma mensagem inútil — canal que consta entregue
  // sem ter servido é a falha silenciosa da #108.
  test("com key mas sem NEXT_PUBLIC_APP_URL: registra falha, não envia e-mail com link vazio", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "re_chave_de_teste";
    delete process.env.NEXT_PUBLIC_APP_URL;
    const sql = makeFakeSql({ rtRows: [{ rt_email: "rt@clinica.example", rt_nome: "RT" }] });

    await expect(processarEmailRt(sql, "alerta-3")).resolves.toBeUndefined();

    expect(sql.registros).toHaveLength(1);
    expect(sql.registros[0].sucesso).toBe(false);
    expect(sql.registros[0].detalhe).toContain("NEXT_PUBLIC_APP_URL");
  });
});
