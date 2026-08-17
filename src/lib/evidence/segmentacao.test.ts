import { describe, expect, test } from "vitest";
import {
  computarRepertorio,
  computarSegmentacao,
  type Observacao,
} from "./segmentacao";

function obs(
  partial: Partial<Observacao> & { sessionNumero: number },
): Observacao {
  return {
    tipoEstrutura: "marco_simples",
    nivelAjudaOrdinal: null,
    polaridade: "positiva",
    temQueryAberta: false,
    ...partial,
  };
}

describe("computarSegmentacao — despacho por tipo_estrutura", () => {
  test("marco_simples computa métrica normalmente", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 3, polaridade: "positiva" }),
    ]);
    expect(r[0]!.rotulo).toBe("evolucao");
    expect(r[0]!.metrica).toEqual({ eixo: "nivel_ajuda", ordinalRecente: 3 });
  });

  for (const tipo of [
    "marco_com_barreira",
    "escore_composto",
    "faixa_normativa",
  ] as const) {
    test(`${tipo} → sempre aguardando_avaliacao_formal, nunca número fabricado`, () => {
      const r = computarSegmentacao([
        obs({
          sessionNumero: 1,
          tipoEstrutura: tipo,
          nivelAjudaOrdinal: 2,
          polaridade: "positiva",
        }),
        obs({
          sessionNumero: 2,
          tipoEstrutura: tipo,
          nivelAjudaOrdinal: 0,
          polaridade: "positiva",
        }),
      ]);
      for (const linha of r) {
        expect(linha.rotulo).toBe("aguardando_avaliacao_formal");
        expect(linha.metrica).toBeNull();
      }
    });
  }
});

describe("computarSegmentacao — EVOLUÇÃO", () => {
  test("1ª ocorrência positiva é evolução", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 4, polaridade: "positiva" }),
    ]);
    expect(r[0]!.rotulo).toBe("evolucao");
  });

  test("melhora de ordinal (menor que o melhor histórico) é evolução", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 4, polaridade: "positiva" }),
      obs({ sessionNumero: 2, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
    ]);
    expect(r[1]!.rotulo).toBe("evolucao");
  });

  test("repetir o mesmo nível já dominado NÃO é evolução de novo", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 1, polaridade: "positiva" }),
      obs({ sessionNumero: 2, nivelAjudaOrdinal: 1, polaridade: "positiva" }),
    ]);
    expect(r[0]!.rotulo).toBe("evolucao");
    expect(r[1]!.rotulo).not.toBe("evolucao");
  });
});

describe("computarSegmentacao — ESTAGNAÇÃO (janela W=5)", () => {
  test("W sessões tocando o goal sem evolução/regressão dispara estagnação", () => {
    const observacoes: Observacao[] = [
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 2, polaridade: "positiva" }), // evolucao (1ª positiva)
    ];
    for (let n = 2; n <= 6; n++) {
      observacoes.push(
        obs({ sessionNumero: n, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
      );
    }
    const r = computarSegmentacao(observacoes);
    expect(r[0]!.rotulo).toBe("evolucao");
    // sessões 2..5 (4 sessões sem progresso) ainda não fecham a janela de 5
    expect(r[1]!.rotulo).toBe("sem_dado");
    expect(r[2]!.rotulo).toBe("sem_dado");
    expect(r[3]!.rotulo).toBe("sem_dado");
    expect(r[4]!.rotulo).toBe("sem_dado");
    // sessão 6 = 5ª sessão consecutiva sem novidade → estagnação
    expect(r[5]!.rotulo).toBe("estagnacao");
  });

  test("janelaEstagnacao customizada é respeitada", () => {
    const observacoes: Observacao[] = [
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
      obs({ sessionNumero: 2, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
      obs({ sessionNumero: 3, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
    ];
    const r = computarSegmentacao(observacoes, { janelaEstagnacao: 2 });
    expect(r[2]!.rotulo).toBe("estagnacao");
  });
});

describe("computarSegmentacao — REGRESSÃO", () => {
  test("piora sustentada (≥2 sessões consecutivas piores) é regressão", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 1, polaridade: "positiva" }),
      obs({ sessionNumero: 2, nivelAjudaOrdinal: 2, polaridade: "negativa" }),
      obs({ sessionNumero: 3, nivelAjudaOrdinal: 3, polaridade: "negativa" }),
    ]);
    expect(r[0]!.rotulo).toBe("evolucao");
    expect(r[1]!.rotulo).not.toBe("regressao"); // só 1 piora ainda
    expect(r[2]!.rotulo).toBe("regressao"); // 2ª piora consecutiva
  });

  test("uma única piora isolada NÃO é regressão (precisa de 2 consecutivas)", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 1, polaridade: "positiva" }),
      obs({ sessionNumero: 2, nivelAjudaOrdinal: 2, polaridade: "negativa" }),
      obs({ sessionNumero: 3, nivelAjudaOrdinal: 1, polaridade: "positiva" }), // volta a melhorar (não é evolução pois já dominado)
    ]);
    expect(r[1]!.rotulo).not.toBe("regressao");
  });

  test("negativa em habilidade antes independente (ordinal 0) é regressão imediata", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 0, polaridade: "positiva" }), // independente
      obs({ sessionNumero: 2, nivelAjudaOrdinal: 0, polaridade: "negativa" }), // falhou algo já independente
    ]);
    expect(r[0]!.rotulo).toBe("evolucao");
    expect(r[1]!.rotulo).toBe("regressao");
  });
});

describe("computarSegmentacao — V1e: evidence_query aberta excluída", () => {
  test("observação com temQueryAberta=true não conta nem aparece no resultado", () => {
    const r = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 3, polaridade: "positiva" }),
      obs({
        sessionNumero: 2,
        nivelAjudaOrdinal: 1,
        polaridade: "positiva",
        temQueryAberta: true,
      }),
      obs({ sessionNumero: 3, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.sessionNumero)).toEqual([1, 3]);
    // sessão 3 (ordinal 2) não é melhora vs melhor histórico (3 já é pior que
    // o "1" da sessão excluída NÃO contar) — o melhor histórico após a
    // sessão 1 é 3, então 2 < 3 é melhora.
    expect(r[1]!.rotulo).toBe("evolucao");
  });
});

describe("computarSegmentacao — isolamento por protocolo", () => {
  test("nunca cruza ordinais entre protocolos (contrato: 1 chamada = 1 protocolo)", () => {
    // O módulo não recebe protocolId — é responsabilidade do chamador nunca
    // misturar streams de protocolos diferentes na mesma chamada. Este teste
    // documenta a garantia: rodar dois protocolos em streams SEPARADOS produz
    // resultados independentes, mesmo com ordinais numericamente iguais mas
    // semânticas diferentes (ex.: VB-MAPP ordinal 1 = dica verbal; PEDI
    // ordinal 1 = supervisão — não comparáveis).
    const streamVbmapp = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 1, polaridade: "positiva" }),
    ]);
    const streamPedi = computarSegmentacao([
      obs({ sessionNumero: 1, nivelAjudaOrdinal: 1, polaridade: "positiva" }),
    ]);
    // Cada stream evolui de forma independente (1ª positiva → evolução em
    // ambos, sem qualquer estado compartilhado entre as duas chamadas).
    expect(streamVbmapp[0]!.rotulo).toBe("evolucao");
    expect(streamPedi[0]!.rotulo).toBe("evolucao");
  });
});

describe("computarRepertorio", () => {
  test("conta observações, ignora query aberta, e usa o ordinal mais recente", () => {
    const r = computarRepertorio({
      "goal-1": [
        obs({ sessionNumero: 1, nivelAjudaOrdinal: 3, polaridade: "positiva" }),
        obs({
          sessionNumero: 2,
          nivelAjudaOrdinal: 1,
          polaridade: "positiva",
          temQueryAberta: true,
        }),
        obs({ sessionNumero: 3, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
      ],
    });
    expect(r["goal-1"]!.contagem).toBe(2); // sessão 2 excluída
    expect(r["goal-1"]!.nivelAjudaRecente).toBe(2);
  });

  test("nunca retorna texto livre — só numérico/enum (LGPD G6b)", () => {
    const r = computarRepertorio({
      "goal-1": [
        obs({ sessionNumero: 1, nivelAjudaOrdinal: 2, polaridade: "positiva" }),
      ],
    });
    for (const valor of Object.values(r["goal-1"]!)) {
      expect(["number", "boolean"]).toContain(
        typeof valor === null ? "object" : typeof valor,
      );
    }
  });
});
