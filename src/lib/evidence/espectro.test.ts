import { describe, expect, test } from "vitest";
import {
  computarDadosEspectro,
  mapearEixo,
  progressoDoAlvo,
  type AlvoEspectro,
} from "./espectro";

function alvo(p: Partial<AlvoEspectro> & { goalId: string }): AlvoEspectro {
  return {
    dominioId: null,
    disciplina: null,
    estado: "ativa",
    totalNiveisAjuda: 4,
    isCandidata: false,
    ...p,
  };
}

describe("mapearEixo", () => {
  test("mapeia o domínio do marco para o eixo", () => {
    expect(mapearEixo("mando", null)).toBe("comunicacao_expressiva");
    expect(mapearEixo("ouvinte", null)).toBe("comunicacao_receptiva");
    expect(mapearEixo("brincar", null)).toBe("social_brincar");
    expect(mapearEixo("pareamento", null)).toBe("cognicao_aprendizado");
    expect(mapearEixo("motora", null)).toBe("autonomia_motor");
    expect(mapearEixo("barreiras", null)).toBe("regulacao_barreiras");
  });

  test("cai para a disciplina só quando não há domínio", () => {
    expect(mapearEixo(null, "Fono")).toBe("comunicacao_expressiva");
    expect(mapearEixo(null, "TO")).toBe("autonomia_motor");
  });

  test("devolve null quando nada resolve — não empurra para Cognição", () => {
    // Regressão: o fallback silencioso jogava TODA meta sem marco no eixo
    // Cognição & Aprendizado, produzindo um pico solitário que ninguém mediu.
    expect(mapearEixo(null, null)).toBeNull();
    expect(mapearEixo("dominio_desconhecido", "ABA")).toBeNull();
  });
});

describe("progressoDoAlvo", () => {
  test("independente (ordinal 0) é independência plena", () => {
    expect(
      progressoDoAlvo(alvo({ goalId: "g" }), { nivel_ajuda_recente: 0 }),
    ).toBe(1);
  });

  test("ajuda máxima é zero de independência", () => {
    expect(
      progressoDoAlvo(alvo({ goalId: "g" }), { nivel_ajuda_recente: 4 }),
    ).toBe(0);
  });

  test("níveis intermediários são proporcionais à escala do protocolo", () => {
    expect(
      progressoDoAlvo(alvo({ goalId: "g" }), { nivel_ajuda_recente: 1 }),
    ).toBe(0.75);
    expect(
      progressoDoAlvo(alvo({ goalId: "g" }), { nivel_ajuda_recente: 3 }),
    ).toBe(0.25);
  });

  test("estado 'dominada' não inventa 100 — o valor vem do registro da sessão", () => {
    // `goal.estado` é o estado de HOJE e não tem data. Se ele valesse 100, toda
    // sessão passada seria reescrita com uma conquista posterior a ela.
    expect(
      progressoDoAlvo(alvo({ goalId: "g", estado: "dominada" }), undefined),
    ).toBeNull();
    expect(
      progressoDoAlvo(alvo({ goalId: "g", estado: "dominada" }), {
        nivel_ajuda_recente: 2,
      }),
    ).toBe(0.5);
  });

  test("candidata a dominada NÃO vale 1 — só o coordenador conclui", () => {
    // Mutante que este teste mata: tratar `isCandidata` como domínio.
    // Candidatura é critério atingido AGUARDANDO validação humana.
    expect(
      progressoDoAlvo(alvo({ goalId: "g", isCandidata: true }), {
        nivel_ajuda_recente: 2,
      }),
    ).toBe(0.5);
  });

  test("sem nível de ajuda registrado é null, nunca zero", () => {
    expect(progressoDoAlvo(alvo({ goalId: "g" }), undefined)).toBeNull();
    expect(
      progressoDoAlvo(alvo({ goalId: "g" }), { nivel_ajuda_recente: null }),
    ).toBeNull();
  });

  test("escala de ajuda desconhecida é null — não assumimos 0 a 4", () => {
    expect(
      progressoDoAlvo(alvo({ goalId: "g", totalNiveisAjuda: 0 }), {
        nivel_ajuda_recente: 1,
      }),
    ).toBeNull();
  });
});

describe("computarDadosEspectro", () => {
  test("sem nenhum alvo, todo eixo é null — ausência de dado não é pontuação zero", () => {
    const { eixos, naoClassificados } = computarDadosEspectro({}, []);
    expect(eixos).toHaveLength(6);
    expect(eixos.every((e) => e.valor === null)).toBe(true);
    expect(eixos.every((e) => e.alvos === 0)).toBe(true);
    expect(naoClassificados).toBe(0);
  });

  test("média simples dos alvos medidos do eixo", () => {
    const { eixos } = computarDadosEspectro(
      {
        g1: { nivel_ajuda_recente: 0, contagem: 3 },
        g2: { nivel_ajuda_recente: 4, contagem: 2 },
      },
      [
        alvo({ goalId: "g1", dominioId: "mando" }),
        alvo({ goalId: "g2", dominioId: "tato" }),
      ],
    );
    const expressiva = eixos.find((e) => e.eixo === "comunicacao_expressiva")!;
    expect(expressiva.valor).toBe(50);
    expect(expressiva.alvos).toBe(2);
    expect(expressiva.medidos).toBe(2);
    expect(expressiva.contagemEvidencias).toBe(5);
  });

  test("alvo sem registro fica fora da média, mas visível na contagem", () => {
    const { eixos } = computarDadosEspectro(
      { g1: { nivel_ajuda_recente: 0, contagem: 3 } },
      [
        alvo({ goalId: "g1", dominioId: "mando" }),
        alvo({ goalId: "g2", dominioId: "mando" }),
      ],
    );
    const expressiva = eixos.find((e) => e.eixo === "comunicacao_expressiva")!;
    // 100%, não 50%: g2 nunca foi medido. Diluir com zero afirmaria um
    // desempenho que ninguém observou.
    expect(expressiva.valor).toBe(100);
    expect(expressiva.alvos).toBe(2);
    expect(expressiva.medidos).toBe(1);
  });

  test("eixo com alvos mas nenhum medido é null, não zero", () => {
    const { eixos } = computarDadosEspectro({}, [
      alvo({ goalId: "g1", dominioId: "brincar" }),
    ]);
    const social = eixos.find((e) => e.eixo === "social_brincar")!;
    expect(social.valor).toBeNull();
    expect(social.alvos).toBe(1);
    expect(social.medidos).toBe(0);
  });

  test("separa dominados de candidatos", () => {
    const { eixos } = computarDadosEspectro(
      {
        g1: { nivel_ajuda_recente: 0, contagem: 6 },
        g2: { nivel_ajuda_recente: 0, contagem: 4 },
      },
      [
        alvo({ goalId: "g1", dominioId: "mando", estado: "dominada" }),
        alvo({ goalId: "g2", dominioId: "mando", isCandidata: true }),
      ],
    );
    const expressiva = eixos.find((e) => e.eixo === "comunicacao_expressiva")!;
    expect(expressiva.dominados).toBe(1);
    expect(expressiva.candidatos).toBe(1);
  });

  test("alvo sem eixo é contado à parte, não somado a Cognição", () => {
    const { eixos, naoClassificados } = computarDadosEspectro(
      { g1: { nivel_ajuda_recente: 0, contagem: 3 } },
      [alvo({ goalId: "g1", dominioId: null, disciplina: null })],
    );
    expect(naoClassificados).toBe(1);
    expect(
      eixos.find((e) => e.eixo === "cognicao_aprendizado")!.valor,
    ).toBeNull();
  });

  test("rascunho, pausada e descontinuada não são alvos do PEI corrente", () => {
    const { eixos } = computarDadosEspectro(
      {
        g1: { nivel_ajuda_recente: 0, contagem: 1 },
        g2: { nivel_ajuda_recente: 0, contagem: 1 },
        g3: { nivel_ajuda_recente: 0, contagem: 1 },
      },
      [
        alvo({ goalId: "g1", dominioId: "mando", estado: "rascunho" }),
        alvo({ goalId: "g2", dominioId: "mando", estado: "pausada" }),
        alvo({ goalId: "g3", dominioId: "mando", estado: "descontinuada" }),
      ],
    );
    expect(eixos.find((e) => e.eixo === "comunicacao_expressiva")!.alvos).toBe(
      0,
    );
  });

  test("ordinal fora da escala é limitado, nunca gera valor negativo ou acima de 100", () => {
    const { eixos } = computarDadosEspectro(
      {
        g1: { nivel_ajuda_recente: 99, contagem: 1 },
        g2: { nivel_ajuda_recente: -5, contagem: 1 },
      },
      [
        alvo({ goalId: "g1", dominioId: "mando" }),
        alvo({ goalId: "g2", dominioId: "ouvinte" }),
      ],
    );
    expect(eixos.find((e) => e.eixo === "comunicacao_expressiva")!.valor).toBe(
      0,
    );
    expect(eixos.find((e) => e.eixo === "comunicacao_receptiva")!.valor).toBe(
      100,
    );
  });

  test("metadados de origem e procedência não afetam o cálculo (mesmo resultado que sem eles)", () => {
    const alvos = [
      alvo({ goalId: "g1", dominioId: "mando" }),
      alvo({ goalId: "g2", dominioId: "tato" }),
    ];
    const semMetadados = computarDadosEspectro(
      {
        g1: { nivel_ajuda_recente: 0, contagem: 3 },
        g2: { nivel_ajuda_recente: 4, contagem: 2 },
      },
      alvos,
    );
    const comMetadados = computarDadosEspectro(
      {
        g1: {
          nivel_ajuda_recente: 0,
          contagem: 3,
          origem: "anamnese",
          procedencia: "relatado_responsavel",
        },
        g2: {
          nivel_ajuda_recente: 4,
          contagem: 2,
          origem: "anamnese",
          procedencia: "observado_avaliador",
        },
      },
      alvos,
    );
    expect(comMetadados).toEqual(semMetadados);
  });

  test("alvo com nivel_ajuda_recente: null produz eixo com valor: null, alvos: 1, medidos: 0 (nunca 0)", () => {
    const { eixos } = computarDadosEspectro(
      {
        g1: {
          nivel_ajuda_recente: null,
          contagem: 0,
          origem: "anamnese",
          procedencia: "relatado_responsavel",
        },
      },
      [alvo({ goalId: "g1", dominioId: "mando" })],
    );
    const expressiva = eixos.find((e) => e.eixo === "comunicacao_expressiva")!;
    expect(expressiva.valor).toBeNull();
    expect(expressiva.alvos).toBe(1);
    expect(expressiva.medidos).toBe(0);
  });
});
