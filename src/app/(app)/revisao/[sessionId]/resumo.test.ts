import { describe, expect, test } from "vitest";
import { chaveDominio, resumirPayload, rotuloSubtipo } from "./resumo";

describe("resumirPayload", () => {
  test("evidência: função indefinida vira rótulo explícito (a confirmar)", () => {
    const linhas = resumirPayload("evidencia", {
      descricao: "pediu água",
      funcao_indefinida: true,
      nivel_ajuda: "independente",
    });
    const funcao = linhas.find((l) => l.rotulo === "Função");
    expect(funcao?.valor).toContain("indefinida");
    expect(linhas.find((l) => l.rotulo === "Nível de ajuda")?.valor).toBe("independente");
  });

  test("evidência: função definida aparece crua", () => {
    const linhas = resumirPayload("evidencia", { funcao: "mando" });
    expect(linhas.find((l) => l.rotulo === "Função")?.valor).toBe("mando");
  });

  test("ignora campos vazios/ausentes (leitura defensiva)", () => {
    const linhas = resumirPayload("evidencia", { funcao: "", descricao: "  " });
    expect(linhas).toEqual([]);
  });

  test("cadeia: numera as etapas com nível de ajuda", () => {
    const linhas = resumirPayload("cadeia", {
      nome: "lavar as mãos",
      etapas: [
        { descricao: "abrir a torneira", nivel_ajuda: "dica gestual" },
        { descricao: "ensaboar" },
      ],
    });
    expect(linhas.find((l) => l.rotulo === "Etapa 1")?.valor).toBe(
      "abrir a torneira (dica gestual)",
    );
    expect(linhas.find((l) => l.rotulo === "Etapa 2")?.valor).toBe("ensaboar");
  });

  test("payload nulo/indefinido não quebra", () => {
    expect(resumirPayload("registro_abc", null)).toEqual([]);
    expect(resumirPayload("preferencia_reforcador", undefined)).toEqual([]);
  });
});

describe("chaveDominio", () => {
  test("evidência usa dominio_id do primeiro alvo", () => {
    expect(
      chaveDominio("evidencia", { funcao: "tato", alvos: [{ dominio_id: "mando" }] }),
    ).toBe("mando");
  });

  test("evidência sem alvo cai para a função", () => {
    expect(chaveDominio("evidencia", { funcao: "tato" })).toBe("tato");
  });

  test("evidência sem alvo nem função cai para o sentinela 'evidencia'", () => {
    expect(chaveDominio("evidencia", {})).toBe("evidencia");
  });

  test("outros subtipos usam o próprio subtipo como domínio", () => {
    expect(chaveDominio("registro_abc", {})).toBe("registro_abc");
    expect(chaveDominio("preferencia_reforcador", {})).toBe("preferencia_reforcador");
  });
});

describe("rotuloSubtipo", () => {
  test("mapeia todos os subtipos conhecidos", () => {
    expect(rotuloSubtipo("evidencia")).toBe("Evidência");
    expect(rotuloSubtipo("registro_abc")).toBe("Registro ABC");
    expect(rotuloSubtipo("pendente")).toBe("Extração pendente");
  });
});
