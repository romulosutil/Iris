import { describe, expect, test } from "vitest";
import { DISTORCOES_COGNITIVAS_OPCOES, salvarRpdSchema } from "./logic";

describe("TCC · Validação de Esquema RPD", () => {
  test("DISTORCOES_COGNITIVAS_OPCOES contém os clássicos de Beck/Burns (slug + rótulo)", () => {
    const rotulos = DISTORCOES_COGNITIVAS_OPCOES.map((o) => o.rotulo);
    const slugs = DISTORCOES_COGNITIVAS_OPCOES.map((o) => o.slug);
    expect(rotulos).toContain("Catastrofização");
    expect(rotulos).toContain("Leitura Mental");
    expect(rotulos).toContain("Tudo-ou-Nada");
    expect(rotulos).toContain("Generalização Excessiva");
    expect(slugs).toContain("catastrofizacao");
    expect(slugs).toContain("leitura_mental");
  });

  test("salvarRpdSchema valida campos obrigatórios (campos 1-3)", () => {
    const valido = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Apresentação em público",
      pensamentoAutomatico: "Vou travar",
      emocao: "Ansiedade",
      intensidade: 90,
      distorcoesCognitivas: ["catastrofizacao"],
      respostaRacional: "Já me preparei e treinei.",
      intensidadePos: 40,
    });

    expect(valido.success).toBe(true);
  });

  test("salvarRpdSchema aceita respostaRacional ausente (deixou de ser obrigatória)", () => {
    const semRespostaRacional = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Apresentação em público",
      pensamentoAutomatico: "Vou travar",
      emocao: "Ansiedade",
      intensidade: 90,
    });

    expect(semRespostaRacional.success).toBe(true);
  });

  test("salvarRpdSchema rejeita intensidade menor que 0 ou maior que 100", () => {
    const menorQueZero = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: -10,
      distorcoesCognitivas: ["leitura_mental"],
      respostaRacional: "Resposta",
    });
    expect(menorQueZero.success).toBe(false);

    const maiorQue100 = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: 105,
      distorcoesCognitivas: ["leitura_mental"],
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
      distorcoesCognitivas: ["personalizacao"],
      respostaRacional: "Não é culpa minha.",
    });
    expect(semPos.success).toBe(true);

    const posNull = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Raiva",
      intensidade: 50,
      distorcoesCognitivas: ["personalizacao"],
      respostaRacional: "Não é culpa minha.",
      intensidadePos: null,
    });
    expect(posNull.success).toBe(true);
  });

  test("salvarRpdSchema rejeita credibilidade fora da faixa 0-100", () => {
    const inicialInvalida = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: 50,
      credibilidadeInicial: 150,
    });
    expect(inicialInvalida.success).toBe(false);

    const alternativaInvalida = salvarRpdSchema.safeParse({
      patientId: "00000000-0000-0000-0000-000000000001",
      situacao: "Gatilho",
      pensamentoAutomatico: "Pensamento",
      emocao: "Medo",
      intensidade: 50,
      credibilidadeAlternativa: -1,
    });
    expect(alternativaInvalida.success).toBe(false);
  });
});
