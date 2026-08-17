import { describe, expect, test } from "vitest";
import * as copyModule from "./copy";
import {
  AVISO_ECA_IDADE_DESCONHECIDA,
  AVISO_ECA_MENOR,
  CATEGORIA_LEGIVEL,
  LISTA_NEGATIVA_COPY,
  TEXTO_PUSH,
  TITULO_ALERTA,
  avisoLegal,
  corpoAlerta,
  ehMenorDeIdade,
} from "./copy";

const AGORA = new Date("2026-07-28T12:00:00.000Z");

describe("copy.ts — textos literais da §6", () => {
  test("título do alerta", () => {
    expect(TITULO_ALERTA).toBe(
      "Sinal identificado no relato requer revisão prioritária",
    );
  });

  test("corpo interpola a categoria legível", () => {
    expect(corpoAlerta(CATEGORIA_LEGIVEL.ideacao_suicida)).toBe(
      "O relato de sessão contém um trecho que corresponde a um padrão de menção a ideação suicida. Esta sinalização é gerada automaticamente a partir de padrões no texto e não constitui avaliação clínica de risco — cabe a você revisar o trecho abaixo e decidir a conduta apropriada.",
    );
  });

  test("push não traz categoria nem nome de paciente (H3)", () => {
    expect(TEXTO_PUSH).toBe(
      "Iris: sinal prioritário requer revisão imediata. Abrir agora.",
    );
    for (const legivel of Object.values(CATEGORIA_LEGIVEL)) {
      expect(TEXTO_PUSH).not.toContain(legivel);
    }
  });

  test("todas as categorias têm rótulo legível", () => {
    expect(Object.keys(CATEGORIA_LEGIVEL)).toEqual([
      "ideacao_suicida",
      "autolesao",
      "violencia_sofrida",
      "violencia_praticada",
      "risco_a_terceiro",
    ]);
  });
});

describe("copy.ts — ehMenorDeIdade", () => {
  test("nascimento ausente devolve null (desconhecido ≠ maior de idade)", () => {
    expect(ehMenorDeIdade(null, AGORA)).toBeNull();
    expect(ehMenorDeIdade(undefined, AGORA)).toBeNull();
    expect(ehMenorDeIdade("", AGORA)).toBeNull();
  });

  test("aniversário de 18 anos exatamente hoje → já é maior", () => {
    expect(ehMenorDeIdade("2008-07-28", AGORA)).toBe(false);
  });

  test("17 anos e 364 dias → ainda menor", () => {
    expect(ehMenorDeIdade("2008-07-29", AGORA)).toBe(true);
  });

  test("casos amplos", () => {
    expect(ehMenorDeIdade("2020-01-01", AGORA)).toBe(true);
    expect(ehMenorDeIdade("1990-03-15", AGORA)).toBe(false);
  });

  test("aceita timestamp ISO completo", () => {
    expect(ehMenorDeIdade("2008-07-29T00:00:00.000Z", AGORA)).toBe(true);
  });
});

describe("copy.ts — avisoLegal (§5.2)", () => {
  test("violência sofrida + menor → aviso do ECA", () => {
    expect(avisoLegal("violencia_sofrida", "2015-05-10", AGORA)).toBe(
      AVISO_ECA_MENOR,
    );
  });

  test("violência sofrida + nascimento não cadastrado → aviso condicional", () => {
    expect(avisoLegal("violencia_sofrida", null, AGORA)).toBe(
      AVISO_ECA_IDADE_DESCONHECIDA,
    );
  });

  test("violência sofrida + adulto → sem aviso (copy hedged padrão)", () => {
    expect(avisoLegal("violencia_sofrida", "1990-03-15", AGORA)).toBeNull();
  });

  test("demais categorias nunca recebem aviso, nem com paciente menor", () => {
    expect(avisoLegal("ideacao_suicida", "2015-05-10", AGORA)).toBeNull();
    expect(avisoLegal("autolesao", null, AGORA)).toBeNull();
    expect(avisoLegal("violencia_praticada", "2015-05-10", AGORA)).toBeNull();
    expect(avisoLegal("risco_a_terceiro", null, AGORA)).toBeNull();
  });
});

describe("copy.ts — lista negativa (§6.1)", () => {
  test("nenhuma string exportada contém formulação proibida", () => {
    const textos: string[] = [];
    for (const [nome, valor] of Object.entries(copyModule)) {
      // A própria lista negativa é a documentação das formulações proibidas.
      if (nome === "LISTA_NEGATIVA_COPY") continue;
      if (typeof valor === "string") textos.push(valor);
      if (valor && typeof valor === "object") {
        for (const v of Object.values(valor as Record<string, unknown>)) {
          if (typeof v === "string") textos.push(v);
        }
      }
    }
    // Inclui também a saída da função de corpo, para cada categoria.
    for (const legivel of Object.values(CATEGORIA_LEGIVEL)) {
      textos.push(corpoAlerta(legivel));
    }

    expect(textos.length).toBeGreaterThan(0);
    for (const texto of textos) {
      for (const proibido of LISTA_NEGATIVA_COPY) {
        expect(texto.toLowerCase()).not.toContain(proibido.toLowerCase());
      }
    }
  });
});
