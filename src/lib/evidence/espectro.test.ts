import { describe, expect, test } from "vitest";
import { computarDadosEspectro, mapearEixo, type MilestoneMetadata, type GoalMetadata } from "./espectro";

describe("espectro.ts (mapearEixo)", () => {
  test("mapeia domínios do VB-MAPP para eixos do Espectro", () => {
    expect(mapearEixo("mando", null)).toBe("comunicacao_expressiva");
    expect(mapearEixo("ouvinte", null)).toBe("comunicacao_receptiva");
    expect(mapearEixo("brincar", null)).toBe("social_brincar");
    expect(mapearEixo("pareamento", null)).toBe("cognicao_aprendizado");
    expect(mapearEixo("motora", null)).toBe("autonomia_motor");
    expect(mapearEixo("barreiras", null)).toBe("regulacao_barreiras");
  });

  test("mapeia disciplinas de metas como fallback", () => {
    expect(mapearEixo("", "Fono")).toBe("comunicacao_expressiva");
    expect(mapearEixo("", "TO")).toBe("autonomia_motor");
    expect(mapearEixo("", "qualquer")).toBe("cognicao_aprendizado");
  });
});

describe("espectro.ts (computarDadosEspectro)", () => {
  test("retorna 0 para todos os eixos se o repertorioState estiver vazio (evita divisão por zero)", () => {
    const radar = computarDadosEspectro({}, {}, []);
    expect(radar).toHaveLength(6);
    expect(radar.every((e) => e.valor === 0)).toBe(true);
    expect(radar.every((e) => e.contagemEvidencias === 0)).toBe(true);
  });

  test("calcula progresso de marco simples (eixo de nível de ajuda) corretamente", () => {
    const repertorio = {
      "milestone-1": { nivel_ajuda_recente: 0, contagem: 3 }, // independente (melhor) -> 100%
      "milestone-2": { nivel_ajuda_recente: 4, contagem: 2 }, // dica_fisica (pior) -> 0%
    };

    const mapeamento: Record<string, MilestoneMetadata> = {
      "milestone-1": { dominioId: "mando", protocolId: "p1", tipoEstrutura: "marco_simples", totalNiveisAjuda: 4 },
      "milestone-2": { dominioId: "mando", protocolId: "p1", tipoEstrutura: "marco_simples", totalNiveisAjuda: 4 },
    };

    const radar = computarDadosEspectro(repertorio, mapeamento, []);
    const expressiva = radar.find((r) => r.eixo === "comunicacao_expressiva");

    // Média de 100% (milestone-1) e 0% (milestone-2) = 50%
    expect(expressiva?.valor).toBe(50);
    expect(expressiva?.contagemEvidencias).toBe(5); // 3 + 2
  });

  test("aplica inversão no eixo de Barreiras / Regulação de forma correta", () => {
    const repertorio = {
      "milestone-barreira": { nivel_ajuda_recente: 1, contagem: 4 }, // escore 1 de 4 (pouca barreira -> 75% regulação)
    };

    const mapeamento: Record<string, MilestoneMetadata> = {
      "milestone-barreira": { dominioId: "barreiras", protocolId: "p1", tipoEstrutura: "marco_com_barreira", totalNiveisAjuda: 4 },
    };

    const radar = computarDadosEspectro(repertorio, mapeamento, []);
    const regulacao = radar.find((r) => r.eixo === "regulacao_barreiras");

    // Inversão: (4 - 1) / 4 = 75%
    expect(regulacao?.valor).toBe(75);
    expect(regulacao?.contagemEvidencias).toBe(4);
  });

  test("calcula progresso de metas com base na candidatura/acúmulo", () => {
    const repertorio = {
      "goal-1": { contagem: 2, is_candidata: false }, // progresso: 2/3 = 67%
      "goal-2": { contagem: 1, is_candidata: true },  // is_candidata -> 100%
    };

    const metas: GoalMetadata[] = [
      { id: "goal-1", disciplina: "Fono" },
      { id: "goal-2", disciplina: "Fono" },
    ];

    const radar = computarDadosEspectro(repertorio, {}, metas);
    const expressiva = radar.find((r) => r.eixo === "comunicacao_expressiva");

    // Média de 66.6% e 100% = 83.3% -> round 83%
    expect(expressiva?.valor).toBe(83);
  });
});
