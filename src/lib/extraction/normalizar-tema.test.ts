import { describe, expect, it } from "vitest";
import {
  deduplicarTemas,
  MAX_TEMAS_POR_SESSAO,
  normalizarTema,
} from "./normalizar-tema";

describe("normalizarTema", () => {
  it("casa as variações de conectivo que a #645 cita como o caso motivador", () => {
    const chave = normalizarTema("luto do pai");
    expect(normalizarTema("luto pelo pai")).toBe(chave);
    expect(normalizarTema("Luto Pelo Pai")).toBe(chave);
    expect(chave).toBe("luto pai");
  });

  it("é insensível à ordem das palavras", () => {
    expect(normalizarTema("pai, luto")).toBe(normalizarTema("luto do pai"));
  });

  it("remove acento e pontuação sem perder o token", () => {
    expect(normalizarTema("ansiedade — antecipatória!")).toBe(
      "ansiedade antecipatoria",
    );
    expect(normalizarTema("relação com a mãe")).toBe("mae relacao");
  });

  it("colapsa cedilha via NFD (ç → c)", () => {
    expect(normalizarTema("negociação")).toBe(normalizarTema("negociacao"));
  });

  it("deduplica token repetido", () => {
    expect(normalizarTema("luto e luto")).toBe("luto");
  });

  it("NÃO trata negação como conectivo — negar muda o tema", () => {
    expect(normalizarTema("medo de dirigir")).not.toBe(
      normalizarTema("medo sem dirigir"),
    );
    expect(normalizarTema("aceitação")).not.toBe(
      normalizarTema("não aceitação"),
    );
  });

  it("devolve string vazia quando não sobra token (o caller descarta)", () => {
    expect(normalizarTema("")).toBe("");
    expect(normalizarTema("   ")).toBe("");
    expect(normalizarTema("— , !")).toBe("");
    expect(normalizarTema("de do da")).toBe("");
  });

  it("é estável: mesma entrada, mesma chave", () => {
    const entrada = "Ansiedade de desempenho no trabalho";
    expect(normalizarTema(entrada)).toBe(normalizarTema(entrada));
    expect(normalizarTema(entrada)).toBe("ansiedade desempenho trabalho");
  });
});

describe("deduplicarTemas", () => {
  it("colapsa grafias na mesma chave e mantém a PRIMEIRA (a que o terapeuta leu)", () => {
    expect(deduplicarTemas(["luto do pai", "luto pelo pai"])).toEqual([
      { tema: "luto do pai", temaChave: "luto pai" },
    ]);
  });

  it("descarta o que não vira chave em vez de gravar chave vazia", () => {
    expect(deduplicarTemas(["", "   ", "— !", "de do da", "luto"])).toEqual([
      { tema: "luto", temaChave: "luto" },
    ]);
  });

  it("apara espaço em volta do texto cru", () => {
    expect(deduplicarTemas(["  ansiedade  "])).toEqual([
      { tema: "ansiedade", temaChave: "ansiedade" },
    ]);
  });

  it("ordena por chave — INSERT determinístico entre execuções iguais", () => {
    const entrada = ["zelo", "ansiedade", "briga"];
    expect(deduplicarTemas(entrada).map((t) => t.temaChave)).toEqual([
      "ansiedade",
      "briga",
      "zelo",
    ]);
    expect(deduplicarTemas([...entrada].reverse())).toEqual(
      deduplicarTemas(entrada),
    );
  });

  it("corta no teto — modelo degenerado não enche o prontuário", () => {
    const muitos = Array.from(
      { length: MAX_TEMAS_POR_SESSAO + 7 },
      (_, i) => `tema${i}`,
    );
    expect(deduplicarTemas(muitos)).toHaveLength(MAX_TEMAS_POR_SESSAO);
  });

  it("o teto conta temas ÚNICOS, não linhas cruas repetidas", () => {
    const repetido = Array.from({ length: 60 }, () => "luto do pai");
    expect(deduplicarTemas(repetido)).toHaveLength(1);
  });
});
