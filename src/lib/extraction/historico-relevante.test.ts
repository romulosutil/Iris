import { describe, expect, test } from "vitest";
import {
  projetarHistoricoDeInstrumentos,
  projetarHistoricoDeRepertorio,
} from "./historico-relevante";

const TAXONOMIA = new Map([
  ["vbmapp", ["independente", "dica_verbal", "dica_ecoica", "dica_fisica"]],
]);

const METAS = [
  {
    id: "g_01",
    mapeamentos: [{ familia: "vbmapp", dominioId: "mando" }],
  },
];

describe("projetarHistoricoDeRepertorio (modo protocol_driven)", () => {
  test("traduz o ordinal de nível de ajuda pelo rótulo da taxonomia do protocolo", () => {
    const [item] = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: 2,
          contagem: 12,
          niveis_nao_classificados: 0,
        },
      },
      metas: METAS,
      taxonomiaPorFamilia: TAXONOMIA,
    });
    expect(item).toEqual({
      tipo: "protocolo",
      protocolFamilia: "vbmapp",
      dominioId: "mando",
      resumo:
        "nível de ajuda mais recente: dica_ecoica; 12 observações acumuladas.",
    });
  });

  test("ordinal fora da taxonomia não vira rótulo inventado", () => {
    const [item] = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: 9,
          contagem: 3,
          niveis_nao_classificados: 0,
        },
      },
      metas: METAS,
      taxonomiaPorFamilia: TAXONOMIA,
    });
    expect(item!.resumo).toBe(
      "nível de ajuda mais recente: ordinal 9, fora da taxonomia do protocolo; 3 observações acumuladas.",
    );
  });

  test("nivel_ajuda_recente null é reportado como ausência, não como independente (ordinal 0)", () => {
    const [item] = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: null,
          contagem: 4,
          niveis_nao_classificados: 0,
        },
      },
      metas: METAS,
      taxonomiaPorFamilia: TAXONOMIA,
    });
    expect(item!.resumo).toBe(
      "sem nível de ajuda registrado; 4 observações acumuladas.",
    );
  });

  test("ordinal 0 é 'independente', não ausência", () => {
    const [item] = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: 0,
          contagem: 4,
          niveis_nao_classificados: 0,
        },
      },
      metas: METAS,
      taxonomiaPorFamilia: TAXONOMIA,
    });
    expect(item!.resumo).toContain("independente");
  });

  test("meta candidata a avaliação formal entra no resumo", () => {
    const [item] = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: 0,
          contagem: 8,
          niveis_nao_classificados: 0,
          is_candidata: true,
        },
      },
      metas: METAS,
      taxonomiaPorFamilia: TAXONOMIA,
    });
    expect(item!.resumo).toContain("candidata a avaliação formal");
  });

  test("meta sem entrada no repertório não gera item (não inventa histórico)", () => {
    expect(
      projetarHistoricoDeRepertorio({
        repertorio: {},
        metas: METAS,
        taxonomiaPorFamilia: TAXONOMIA,
      }),
    ).toEqual([]);
  });

  test("chave `milestone:<id>` do repertório é ignorada — não casa com goal_id", () => {
    expect(
      projetarHistoricoDeRepertorio({
        repertorio: {
          "milestone:m_99": {
            nivel_ajuda_recente: 1,
            contagem: 5,
            niveis_nao_classificados: 0,
          },
        },
        metas: METAS,
        taxonomiaPorFamilia: TAXONOMIA,
      }),
    ).toEqual([]);
  });

  test("meta com dois mapeamentos vira um item por (protocolo, domínio)", () => {
    const itens = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: 1,
          contagem: 2,
          niveis_nao_classificados: 0,
        },
      },
      metas: [
        {
          id: "g_01",
          mapeamentos: [
            { familia: "vbmapp", dominioId: "mando" },
            { familia: "vbmapp", dominioId: "tato" },
          ],
        },
      ],
      taxonomiaPorFamilia: TAXONOMIA,
    });
    expect(itens.map((i) => ("dominioId" in i ? i.dominioId : null))).toEqual([
      "mando",
      "tato",
    ]);
  });

  test("protocolo sem taxonomia carregada reporta o ordinal cru, não estoura", () => {
    const [item] = projetarHistoricoDeRepertorio({
      repertorio: {
        g_01: {
          nivel_ajuda_recente: 2,
          contagem: 1,
          niveis_nao_classificados: 0,
        },
      },
      metas: METAS,
      taxonomiaPorFamilia: new Map(),
    });
    expect(item!.resumo).toContain("ordinal 2, fora da taxonomia do protocolo");
  });
});

describe("projetarHistoricoDeInstrumentos (modo tcc)", () => {
  const agora = new Date("2026-09-07T12:00:00Z");

  test("última aplicação de cada instrumento vira um item, com faixa de corte pública", () => {
    const itens = projetarHistoricoDeInstrumentos({
      aplicacoes: [
        {
          tipoInstrumento: "phq9",
          escoreTotal: 16,
          criadoEm: new Date("2026-08-12T14:00:00Z"),
        },
        {
          tipoInstrumento: "phq9",
          escoreTotal: 21,
          criadoEm: new Date("2026-07-01T14:00:00Z"),
        },
      ],
      agora,
    });
    expect(itens).toEqual([
      {
        tipo: "instrumento",
        protocolFamilia: "phq9",
        resumo:
          "última aplicação em 12/08/2026 (há 26 dias); escore 16 (moderadamente grave).",
      },
    ]);
  });

  test("PHQ-9 e GAD-7 coexistem, um item por instrumento", () => {
    const itens = projetarHistoricoDeInstrumentos({
      aplicacoes: [
        {
          tipoInstrumento: "gad7",
          escoreTotal: 12,
          criadoEm: new Date("2026-09-06T14:00:00Z"),
        },
        {
          tipoInstrumento: "phq9",
          escoreTotal: 3,
          criadoEm: new Date("2026-09-06T14:00:00Z"),
        },
      ],
      agora,
    });
    expect(itens.map((i) => i.protocolFamilia)).toEqual(["gad7", "phq9"]);
    expect(itens[0]!.resumo).toContain("escore 12 (moderado)");
    expect(itens[1]!.resumo).toContain("escore 3 (mínimo)");
  });

  test("aplicação de hoje não vira 'há 0 dias'", () => {
    const [item] = projetarHistoricoDeInstrumentos({
      aplicacoes: [
        {
          tipoInstrumento: "phq9",
          escoreTotal: 5,
          criadoEm: new Date("2026-09-07T09:00:00Z"),
        },
      ],
      agora,
    });
    expect(item!.resumo).toContain("(hoje)");
  });

  test("escore nulo é reportado como ausente, nunca como zero", () => {
    const [item] = projetarHistoricoDeInstrumentos({
      aplicacoes: [
        {
          tipoInstrumento: "phq9",
          escoreTotal: null,
          criadoEm: new Date("2026-09-06T14:00:00Z"),
        },
      ],
      agora,
    });
    expect(item!.resumo).toContain("escore não registrado");
    expect(item!.resumo).not.toContain("mínimo");
  });

  test("sem aplicações, sem histórico", () => {
    expect(projetarHistoricoDeInstrumentos({ aplicacoes: [], agora })).toEqual(
      [],
    );
  });
});
