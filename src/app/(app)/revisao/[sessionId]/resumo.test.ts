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
    expect(linhas.find((l) => l.rotulo === "Nível de ajuda")?.valor).toBe(
      "independente",
    );
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

  // #558 · T6 (R4.1/R4.2) — o coordenador nunca deve supor que aprovou dado
  // que o gráfico ignora. Com âncora, o resumo mostra a procedência; sem
  // âncora (ou sem meta na âncora), diz em texto que fica fora da evolução.
  test("cadeia com âncora: mostra a procedência do alvo", () => {
    const linhas = resumirPayload("cadeia", {
      nome: "lanche",
      alvo: {
        goal_id: "8f14e45f-ceea-467a-9c2b-1b2e4a1d7a11",
        protocol_id: "ablls",
        dominio_id: "avds",
      },
      etapas: [{ descricao: "abrir a lancheira" }],
    });
    expect(linhas.find((l) => l.rotulo === "Meta vinculada")?.valor).toBe(
      "8f14e45f-ceea-467a-9c2b-1b2e4a1d7a11",
    );
    expect(linhas.find((l) => l.rotulo === "Protocolo")?.valor).toBe("ablls");
    expect(linhas.find((l) => l.rotulo === "Domínio")?.valor).toBe("avds");
    expect(linhas.find((l) => l.rotulo === "Evolução")).toBeUndefined();
  });

  test("cadeia sem âncora: avisa que fica na trilha e fora da evolução", () => {
    const linhas = resumirPayload("cadeia", {
      nome: "lavar as mãos",
      etapas: [{ descricao: "abrir a torneira" }],
    });
    expect(linhas.find((l) => l.rotulo === "Meta vinculada")).toBeUndefined();
    const evolucao = linhas.find((l) => l.rotulo === "Evolução");
    expect(evolucao?.valor).toContain("trilha");
    expect(evolucao?.valor).toContain("fora da leitura de evolução");
  });

  test("cadeia com âncora sem meta: mostra a procedência E o aviso", () => {
    const linhas = resumirPayload("cadeia", {
      nome: "lanche",
      alvo: { protocol_id: "ablls", dominio_id: "avds" },
      etapas: [{ descricao: "abrir a lancheira" }],
    });
    expect(linhas.find((l) => l.rotulo === "Domínio")?.valor).toBe("avds");
    expect(linhas.find((l) => l.rotulo === "Evolução")?.valor).toContain(
      "fora da leitura de evolução",
    );
  });

  test("payload nulo/indefinido não quebra", () => {
    expect(resumirPayload("registro_abc", null)).toEqual([]);
    expect(resumirPayload("preferencia_reforcador", undefined)).toEqual([]);
  });
});

describe("chaveDominio", () => {
  test("evidência usa dominio_id do primeiro alvo", () => {
    expect(
      chaveDominio("evidencia", {
        funcao: "tato",
        alvos: [{ dominio_id: "mando" }],
      }),
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
    expect(chaveDominio("preferencia_reforcador", {})).toBe(
      "preferencia_reforcador",
    );
  });
});

describe("rotuloSubtipo", () => {
  test("mapeia todos os subtipos conhecidos", () => {
    expect(rotuloSubtipo("evidencia")).toBe("Evidência");
    expect(rotuloSubtipo("registro_abc")).toBe("Registro ABC");
    expect(rotuloSubtipo("pendente")).toBe("Extração pendente");
  });
});
