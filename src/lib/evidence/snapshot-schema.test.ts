import { describe, expect, it } from "vitest";
import {
  lerRepertorioState,
  lerSegmentacao,
  RepertorioStateSchema,
  SegmentacaoSchema,
} from "./snapshot-schema";

const GOAL = "00000000-0000-0000-0000-000000009001";
const PROTO = "00000000-0000-0000-0000-000000008001";

describe("snapshot-schema (A-06, #538)", () => {
  it("aceita exatamente o que materializar.ts grava", () => {
    // Espelha `materializar.ts`: snake_case, indexado por goal_id.
    const repertorio = {
      [GOAL]: { nivel_ajuda_recente: 0, contagem: 3, is_candidata: true },
    };
    const segmentacao = {
      [GOAL]: {
        [PROTO]: {
          tipo_estrutura: "marco_simples",
          metrica: { eixo: "nivel_ajuda", ordinalRecente: 0 },
          rotulo: "evolucao",
        },
      },
    };
    expect(RepertorioStateSchema.parse(repertorio)).toEqual(repertorio);
    expect(SegmentacaoSchema.parse(segmentacao)).toEqual(segmentacao);
  });

  it("null/undefined/string JSON viram objeto tipado", () => {
    expect(lerRepertorioState(null)).toEqual({});
    expect(lerSegmentacao(undefined)).toEqual({});
    expect(
      lerRepertorioState(
        JSON.stringify({ [GOAL]: { nivel_ajuda_recente: null } }),
      ),
    ).toEqual({ [GOAL]: { nivel_ajuda_recente: null, contagem: 0 } });
  });

  it("campo extra não quebra a leitura (snapshot antigo segue legível)", () => {
    const comExtra = lerRepertorioState({
      [GOAL]: { nivel_ajuda_recente: 1, origem: "legado", foo: "bar" },
    });
    expect(comExtra[GOAL]?.nivel_ajuda_recente).toBe(1);
    expect(comExtra[GOAL]?.origem).toBe("legado");
  });

  it("forma errada estoura com erro nomeado, não vira 'sem progresso'", () => {
    expect(() => lerRepertorioState({ [GOAL]: "conquistado" })).toThrow();
    expect(() =>
      lerSegmentacao({ [GOAL]: { [PROTO]: { rotulo: 1 } } }),
    ).toThrow();
    expect(() => lerSegmentacao([])).toThrow();
  });

  it("o tipo é snake_case: camelCase não é o campo que o banco tem", () => {
    const entry = lerRepertorioState({ [GOAL]: { nivelAjudaRecente: 0 } })[
      GOAL
    ]!;
    // Era o que a tela lia antes — e por isso nunca achava "conquistado":
    // o campo canônico fica no default (null), nunca em 0.
    expect(entry.nivel_ajuda_recente).toBeNull();
  });
});
