import { describe, expect, test } from "vitest";
import { detectarSinaisDeRiscoRPD } from "./deteccao-risco";

describe("TCC · Varredura determinística de risco no RPD (#391)", () => {
  test("nenhum termo casa: retorna array vazio", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: "Reunião de trabalho",
      pensamentoAutomatico: "Vou cometer um erro grave",
      evidenciasFavor: "Já errei antes",
      evidenciasContra: "Tenho bom histórico",
      respostaRacional: "Posso corrigir o erro",
      comportamentoResultante: "Respirei fundo e continuei",
    });

    expect(sinais).toEqual([]);
  });

  test("só termo de ideação suicida: um sinal, categoria ideacao_suicida", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: "Situação",
      pensamentoAutomatico: "Às vezes eu só quero morrer e sumir de tudo",
      evidenciasFavor: null,
      evidenciasContra: null,
      respostaRacional: null,
      comportamentoResultante: null,
    });

    expect(sinais).toHaveLength(1);
    expect(sinais[0]!.categoria).toBe("ideacao_suicida");
    expect(sinais[0]!.severidade).toBe("ideacao_ativa_sem_plano");
    expect(sinais[0]!.certeza).toBe("ambiguo_citado");
    expect(sinais[0]!.trechoFonte.length).toBeGreaterThan(0);
    expect(sinais[0]!.trechoFonte.toLowerCase()).toContain("quero morrer");
  });

  test("só termo de autolesão: um sinal, categoria autolesao", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: "Situação",
      pensamentoAutomatico: "Pensamento",
      evidenciasFavor: "Ontem cheguei a me cortar de novo",
      evidenciasContra: null,
      respostaRacional: null,
      comportamentoResultante: null,
    });

    expect(sinais).toHaveLength(1);
    expect(sinais[0]!.categoria).toBe("autolesao");
    expect(sinais[0]!.severidade).toBe("autolesao_recente");
    expect(sinais[0]!.certeza).toBe("ambiguo_citado");
    expect(sinais[0]!.trechoFonte.toLowerCase()).toContain("me cortar");
  });

  test("as duas categorias casam em campos diferentes: DOIS sinais", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: "Situação",
      pensamentoAutomatico: "Penso em me matar quando fico assim",
      evidenciasFavor: "Cheguei a me machucar de propósito semana passada",
      evidenciasContra: null,
      respostaRacional: null,
      comportamentoResultante: null,
    });

    expect(sinais).toHaveLength(2);
    const categorias = sinais.map((s) => s.categoria).sort();
    expect(categorias).toEqual(["autolesao", "ideacao_suicida"]);
  });

  test("as duas categorias casam no MESMO campo: DOIS sinais", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: null,
      pensamentoAutomatico:
        "Quero morrer e às vezes penso em me cortar também",
      evidenciasFavor: null,
      evidenciasContra: null,
      respostaRacional: null,
      comportamentoResultante: null,
    });

    expect(sinais).toHaveLength(2);
  });

  test("campos null/undefined não quebram a função", () => {
    expect(() =>
      detectarSinaisDeRiscoRPD({
        situacao: undefined,
        pensamentoAutomatico: null,
        evidenciasFavor: undefined,
        evidenciasContra: null,
        respostaRacional: undefined,
        comportamentoResultante: null,
      }),
    ).not.toThrow();

    const sinais = detectarSinaisDeRiscoRPD({
      situacao: undefined,
      pensamentoAutomatico: null,
      evidenciasFavor: undefined,
      evidenciasContra: null,
      respostaRacional: undefined,
      comportamentoResultante: null,
    });
    expect(sinais).toEqual([]);
  });

  test("normalização de acento funciona: 'não aguento mais viver' casa mesmo com til/cedilha", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: "Situação",
      pensamentoAutomatico: "Sinto que não aguento mais viver desse jeito",
      evidenciasFavor: null,
      evidenciasContra: null,
      respostaRacional: null,
      comportamentoResultante: null,
    });

    expect(sinais).toHaveLength(1);
    expect(sinais[0]!.categoria).toBe("ideacao_suicida");
    // Trecho retornado preserva o texto ORIGINAL (com acento), não a versão
    // normalizada usada só para a busca.
    expect(sinais[0]!.trechoFonte).toContain("não aguento mais viver");
  });

  test("trechoFonte nunca é vazio quando há casamento", () => {
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: "suicid",
      pensamentoAutomatico: null,
      evidenciasFavor: null,
      evidenciasContra: null,
      respostaRacional: null,
      comportamentoResultante: null,
    });

    expect(sinais).toHaveLength(1);
    expect(sinais[0]!.trechoFonte.length).toBeGreaterThan(0);
  });
});
