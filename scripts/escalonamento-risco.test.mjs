import { afterEach, describe, expect, test } from "vitest";
import { processarEmailRt, varrer } from "./escalonamento-risco.mjs";

// Fake mínimo do postgres.js: só precisa responder ao shape de tagged
// template usado por processarEmailRt, e registrar as chamadas pra
// verificação. Sem banco real (nenhum vi.mock no repo — convenção).
function makeFakeSql({ rtRows = [], escalados = [], pendentes = [], aoRegistrar } = {}) {
  const chamadas = [];
  const registros = [];
  function sql(strings, ...valores) {
    const texto = strings.join("?");
    chamadas.push(texto);
    if (texto.includes("app_escalonar_risco_vencidos")) return Promise.resolve(escalados);
    if (texto.includes("app_alertas_estagio2_sem_email")) return Promise.resolve(pendentes);
    if (texto.includes("app_rt_do_alerta")) return Promise.resolve(rtRows);
    if (texto.includes("app_registrar_email_rt")) {
      // Assinatura #154: (p_alerta, p_sucesso, p_transitorio, p_detalhe).
      // `p_sucesso` e, nos caminhos de sucesso/RT-ausente, `p_transitorio`
      // são LITERAIS no template SQL — não chegam em `valores`. Só no caminho
      // de falha de envio o `p_transitorio` é interpolado (vira `?`). Por isso
      // a posição do detalhe em `valores` depende do formato do texto.
      const m = /app_registrar_email_rt\(\?,\s*(true|false),\s*(true|false|\?),/.exec(texto);
      if (!m) throw new Error(`chamada a app_registrar_email_rt não reconhecida: ${texto}`);
      const transitorioLiteral = m[2] !== "?";
      registros.push({
        alerta: valores[0],
        sucesso: m[1] === "true",
        transitorio: transitorioLiteral ? m[2] === "true" : valores[1],
        detalhe: transitorioLiteral ? valores[1] : valores[2],
      });
      if (aoRegistrar) aoRegistrar(valores[0]);
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

describe("escalonamento-risco.mjs — retentativa e isolamento de laço (#154)", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  test("sem RT resolvido: grava p_transitorio=false (não adia o que retentar não conserta)", async () => {
    const sql = makeFakeSql({ rtRows: [] });
    await processarEmailRt(sql, "alerta-1");

    expect(sql.registros).toHaveLength(1);
    expect(sql.registros[0].sucesso).toBe(false);
    expect(sql.registros[0].transitorio).toBe(false);
  });

  test("canal não configurado (sem API key): grava p_transitorio=false", async () => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    const sql = makeFakeSql({ rtRows: [{ rt_email: "rt@clinica.example", rt_nome: "RT" }] });
    await processarEmailRt(sql, "alerta-2");

    expect(sql.registros).toHaveLength(1);
    expect(sql.registros[0].transitorio).toBe(false);
  });

  test("toda chamada usa a assinatura de 4 argumentos (a de 3 foi removida na 0068)", async () => {
    const sql = makeFakeSql({ rtRows: [] });
    await processarEmailRt(sql, "alerta-3");

    const chamada = sql.chamadas.find((c) => c.includes("app_registrar_email_rt"));
    // 4 args = 3 vírgulas de topo dentro dos parênteses.
    expect(chamada).toMatch(/app_registrar_email_rt\(\?,\s*(true|false),\s*(true|false|\?),\s*\?\)/);
  });

  // O bug: um alerta que estourasse exceção derrubava a varredura inteira e
  // silenciava TODOS os alertas seguintes da fila — a mesma classe de falha
  // silenciosa da #108, só que atingindo os alertas de outras clínicas.
  test("varredura: exceção num alerta não impede o processamento dos demais", async () => {
    const sql = makeFakeSql({
      rtRows: [],
      escalados: [
        { out_alerta_id: "a1", out_clinic_id: "c1", out_estagio: 2, out_severidade: "alta", out_prazo_minutos: 30 },
        { out_alerta_id: "a2", out_clinic_id: "c2", out_estagio: 2, out_severidade: "alta", out_prazo_minutos: 30 },
      ],
      aoRegistrar: (alerta) => {
        if (alerta === "a1") throw new Error("conexão com o Postgres caiu");
      },
    });

    await expect(varrer(sql)).resolves.toBe(2);

    // a1 estourou, mas a2 chegou a registrar — a fila não foi abandonada.
    expect(sql.registros.map((r) => r.alerta)).toContain("a2");
  });

  test("varredura: exceção na reconciliação também é isolada por alerta", async () => {
    const sql = makeFakeSql({
      rtRows: [],
      escalados: [],
      pendentes: [{ alerta_id: "p1" }, { alerta_id: "p2" }],
      aoRegistrar: (alerta) => {
        if (alerta === "p1") throw new Error("timeout na função de banco");
      },
    });

    await expect(varrer(sql)).resolves.toBe(0);
    expect(sql.registros.map((r) => r.alerta)).toContain("p2");
  });
});
