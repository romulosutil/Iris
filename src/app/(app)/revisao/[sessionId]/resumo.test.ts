import { describe, expect, test } from "vitest";
import { chaveDominio, resumirPayload, rotuloSubtipo } from "./resumo";
import { TC5A } from "@/lib/extraction/__fixtures__/eval-terapia-convencional";

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

  test("resumo do modo Terapia Convencional tem rótulo próprio", () => {
    expect(rotuloSubtipo("resumo_terapia_convencional")).toBe(
      "Resumo da sessão",
    );
  });
});

describe("resumirPayload — resumo_terapia_convencional (caso TC-5a)", () => {
  const payloadTC5a = TC5A as Record<string, unknown>;

  test("renderiza resumo, cada tema com seu trecho, e o padrão de participação", () => {
    const linhas = resumirPayload("resumo_terapia_convencional", payloadTC5a);
    const rotulos = linhas.map((l) => l.rotulo);

    // O `switch` de resumirPayload não tinha guard de exaustividade: um
    // subtipo novo renderizava VAZIO em silêncio, sem erro de compilação.
    // Esta asserção é o que mata esse modo de falha.
    expect(linhas.length).toBeGreaterThan(0);

    expect(rotulos).toContain("Resumo da sessão");
    expect(rotulos).toContain("Tema 1");
    expect(rotulos).toContain("Tema 2");
    expect(rotulos).toContain("Tema recorrente 1");
    expect(rotulos).toContain("Padrão de participação verbal");

    const resumo = linhas.find((l) => l.rotulo === "Resumo da sessão")!;
    expect(resumo.valor).toContain("terceira sessão consecutiva com atraso");

    // Trecho POR tema: os dois temas trazem trechos distintos, e achatar a
    // lista (ou usar um trecho único) faria esta comparação falhar.
    const t1 = linhas.find((l) => l.rotulo === "Tema 1")!;
    const t2 = linhas.find((l) => l.rotulo === "Tema 2")!;
    expect(t1.valor).toContain("o pai ligou na quarta");
    expect(t2.valor).toContain("a mesma resistência de sempre");
    expect(t1.valor).not.toBe(t2.valor);

    const padrao = linhas.find(
      (l) => l.rotulo === "Padrão de participação verbal",
    )!;
    expect(padrao.valor).toContain("deslocou o assunto para o trabalho");
  });

  test("presente:false vira copy explícita, nunca linha ausente", () => {
    // §3.1 do protocolo: `presente: false` é "nada de notável", NÃO "participou
    // bem". Omitir a linha deixaria o leitor preencher o silêncio sozinho.
    const linhas = resumirPayload("resumo_terapia_convencional", {
      resumo_sessao: "Sessão de encerramento.",
      temas: [],
      tema_recorrente_sinalizado: [],
      padrao_participacao_verbal: { presente: false, descricao: null },
    });
    const padrao = linhas.find(
      (l) => l.rotulo === "Padrão de participação verbal",
    );
    expect(padrao?.valor).toBe("nada de notável registrado");
  });

  test("não vaza o alerta de risco para dentro do cartão de revisão", () => {
    // O alerta viaja FORA desta fila (#122) e tem prioridade visual própria.
    const linhas = resumirPayload("resumo_terapia_convencional", {
      ...payloadTC5a,
      alerta_risco: {
        categoria: "violencia_sofrida",
        severidade: "violencia_sofrida",
        certeza: "explicito",
        trecho_fonte: "segurou pelo braço",
        detalhe: "detalhe do alerta",
      },
    });
    expect(linhas.some((l) => l.valor.includes("detalhe do alerta"))).toBe(
      false,
    );
  });
});
