import { describe, expect, test } from "vitest";
import { DISTORCOES_COGNITIVAS_OPCOES, salvarRpdSchema } from "./logic";

describe("TCC · Validação de Esquema RPD", () => {
  test("DISTORCOES_COGNITIVAS_OPCOES contém os clássicos de Beck/Burns", () => {
    expect(DISTORCOES_COGNITIVAS_OPCOES).toContain("Catastrofização");
    expect(DISTORCOES_COGNITIVAS_OPCOES).toContain("Leitura Mental");
    expect(DISTORCOES_COGNITIVAS_OPCOES).toContain("Tudo-ou-Nada");
    expect(DISTORCOES_COGNITIVAS_OPCOES).toContain("Generalização Excessiva");
  });

  test("salvarRpdSchema valida campos obrigatórios", () => {
    const valido = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Apresentação em público",
      pensamentoAutomatico: "Vou travar",
      emocao: "Ansiedade",
      intensidade: 90,
      distorcaoCognitiva: "Catastrofização",
      respostaRacional: "Já me preparei e treinei.",
      intensidadePos: 40,
    });

    expect(valido.success).toBe(true);
  });

  test("salvarRpdSchema rejeita intensidade menor que 0 ou maior que 100", () => {
    const menorQueZero = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: -10,
      distorcaoCognitiva: "Leitura Mental",
      respostaRacional: "Resposta",
    });
    expect(menorQueZero.success).toBe(false);

    const maiorQue100 = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: 105,
      distorcaoCognitiva: "Leitura Mental",
      respostaRacional: "Resposta",
    });
    expect(maiorQue100.success).toBe(false);
  });

  test("salvarRpdSchema aceita intensidadePos nula ou ausente", () => {
    const semPos = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Raiva",
      intensidade: 50,
      distorcaoCognitiva: "Personalização",
      respostaRacional: "Não é culpa minha.",
    });
    expect(semPos.success).toBe(true);

    const posNull = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Raiva",
      intensidade: 50,
      distorcaoCognitiva: "Personalização",
      respostaRacional: "Não é culpa minha.",
      intensidadePos: null,
    });
    expect(posNull.success).toBe(true);
  });
});
