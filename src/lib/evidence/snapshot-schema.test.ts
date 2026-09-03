import { describe, expect, it, vi } from "vitest";
import {
  lerRepertorioState,
  lerSegmentacao,
  RepertorioStateSchema,
  SegmentacaoSchema,
  formatarMetricaSegmentacao,
  type AvisoSnapshot,
} from "./snapshot-schema";

const GOAL = "00000000-0000-0000-0000-000000009001";
const PROTO = "00000000-0000-0000-0000-000000008001";

describe("snapshot-schema (A-06, #538)", () => {
  it("aceita exatamente o que materializar.ts grava (metrica objeto)", () => {
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

  it("aceita exatamente o que anamnese/logic.ts grava no marco-zero (metrica STRING) — o vermelho do CI test-rls", () => {
    // Cópia literal de `anamnese/logic.ts` (app_validar_anamnese, 0115):
    // metrica é a string "nivel_ajuda" e rotulo é o NOME do marco.
    const segmentacao = {
      [GOAL]: {
        [PROTO]: {
          tipo_estrutura: "marco_simples",
          metrica: "nivel_ajuda",
          rotulo: "Pede item preferido",
        },
      },
    };
    const repertorio = {
      [GOAL]: {
        nivel_ajuda_recente: 2,
        contagem: 0,
        is_candidata: false,
        origem: "anamnese",
        procedencia: "relato_familia",
      },
    };
    const avisar = vi.fn();
    expect(lerSegmentacao(segmentacao, avisar)).toEqual(segmentacao);
    expect(lerRepertorioState(repertorio, avisar)).toEqual(repertorio);
    expect(avisar).not.toHaveBeenCalled();
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

  it("entrada fora da forma é ignorada com aviso de categoria fechada — a tela nunca fica vazia nem muda", () => {
    const avisos: AvisoSnapshot[] = [];
    const avisar = (a: AvisoSnapshot) => avisos.push(a);
    const OUTRA = "00000000-0000-0000-0000-000000009002";

    const rep = lerRepertorioState(
      { [GOAL]: "conquistado", [OUTRA]: { nivel_ajuda_recente: 1 } },
      avisar,
    );
    expect(Object.keys(rep)).toEqual([OUTRA]);

    const seg = lerSegmentacao(
      {
        [GOAL]: { [PROTO]: { rotulo: 1 } },
        [OUTRA]: {
          [PROTO]: { tipo_estrutura: "x", rotulo: "estagnacao" },
        },
      },
      avisar,
    );
    expect(seg[GOAL]).toEqual({});
    expect(seg[OUTRA]?.[PROTO]?.rotulo).toBe("estagnacao");

    expect(avisos).toEqual([
      { categoria: "repertorio_entrada_invalida", quantidade: 1 },
      { categoria: "segmentacao_entrada_invalida", quantidade: 1 },
    ]);
    // Nunca id nem conteúdo clínico no aviso.
    expect(JSON.stringify(avisos)).not.toContain(GOAL);
  });

  it("valor que nem é objeto (array, número, JSON quebrado) vira {} com aviso, nunca exceção", () => {
    const avisar = vi.fn();
    expect(lerSegmentacao([], avisar)).toEqual({});
    expect(lerRepertorioState(42, avisar)).toEqual({});
    expect(lerRepertorioState("{nao é json", avisar)).toEqual({});
    expect(avisar.mock.calls.map(([a]) => a.categoria)).toEqual([
      "segmentacao_nao_objeto",
      "repertorio_nao_objeto",
      "json_invalido",
    ]);
  });

  it("o emissor padrão escreve só categoria e quantidade no console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    lerRepertorioState({ [GOAL]: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain("repertorio_entrada_invalida");
    expect(msg).not.toContain(GOAL);
    warn.mockRestore();
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

describe("formatarMetricaSegmentacao (#567)", () => {
  it("forma objeto com ordinal vira rótulo humano + ordinal", () => {
    expect(
      formatarMetricaSegmentacao({ eixo: "nivel_ajuda", ordinalRecente: 3 }),
    ).toBe("Nível de ajuda: 3");
  });

  it("ordinal 0 é medida, não ausência", () => {
    expect(
      formatarMetricaSegmentacao({ eixo: "nivel_ajuda", ordinalRecente: 0 }),
    ).toBe("Nível de ajuda: 0");
  });

  it("ordinal nulo cai para o rótulo do eixo — eixo registrado sem medida", () => {
    expect(
      formatarMetricaSegmentacao({ eixo: "nivel_ajuda", ordinalRecente: null }),
    ).toBe("Nível de ajuda");
  });

  it("objeto sem ordinal algum também cai para o rótulo do eixo", () => {
    expect(formatarMetricaSegmentacao({ eixo: "nivel_ajuda" })).toBe(
      "Nível de ajuda",
    );
  });

  it("string do marco-zero ganha o mesmo rótulo humano do eixo", () => {
    expect(formatarMetricaSegmentacao("nivel_ajuda")).toBe("Nível de ajuda");
  });

  it("string desconhecida atravessa como está", () => {
    expect(formatarMetricaSegmentacao("VBMAPP")).toBe("VBMAPP");
  });

  it("ausência de métrica é null, nunca a palavra 'undefined'", () => {
    expect(formatarMetricaSegmentacao(null)).toBeNull();
    expect(formatarMetricaSegmentacao(undefined)).toBeNull();
    expect(formatarMetricaSegmentacao("")).toBeNull();
    expect(formatarMetricaSegmentacao("   ")).toBeNull();
  });

  it("objeto sem eixo não vira linha", () => {
    expect(formatarMetricaSegmentacao({ ordinalRecente: 2 })).toBeNull();
  });

  it("nunca devolve [object Object]", () => {
    const saida = formatarMetricaSegmentacao({
      eixo: "nivel_ajuda",
      ordinalRecente: 3,
    });
    expect(saida).not.toContain("[object Object]");
  });
});
