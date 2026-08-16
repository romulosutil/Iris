import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  DISTORCOES_COGNITIVAS_OPCOES,
  formatarDataHoraRpd,
  salvarRpdSchema,
} from "./logic";

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

/**
 * O histórico de RPD é renderizado num Server Component. Em nuvem o processo
 * roda em UTC, então `toLocaleDateString` sem `timeZone` mostrava o dia
 * ERRADO para todo registro salvo depois das 21h de Brasília.
 *
 * O fuso do processo é fixado em UTC dentro do teste de propósito: a máquina
 * do time roda em `America/Sao_Paulo`, e sem esse pino o teste passaria
 * mesmo se o `timeZone` fosse removido do formatador — verde que não mede
 * nada. Com o pino, tirar `timeZone: FUSO_CLINICA` de `formatarDataHoraRpd`
 * faz o primeiro caso virar `10/03/2026, 02:30` e a asserção falhar.
 */
describe("TCC · Carimbo de data/hora do RPD no fuso da clínica", () => {
  const tzOriginal = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "UTC";
  });

  afterAll(() => {
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  });

  test("o processo de teste está mesmo em UTC (senão o caso abaixo não mede nada)", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
  });

  test("23h30 de Brasília fica no dia civil brasileiro, não no dia seguinte de UTC", () => {
    // 2026-03-10T02:30Z = 2026-03-09 23:30 em São Paulo (UTC-3, sem DST).
    // O dia civil VIRA entre os dois fusos: é esse o caso que o bug quebrava.
    expect(formatarDataHoraRpd("2026-03-10T02:30:00.000Z")).toBe(
      "09/03/2026, 23:30",
    );
  });

  test("00h30 de Brasília fica no mesmo dia civil (borda simétrica)", () => {
    // 2026-03-10T03:30Z = 2026-03-10 00:30 em São Paulo — aqui os dois fusos
    // concordam na DATA, então este caso sozinho não pegaria o bug; ele existe
    // para provar que a correção não deslocou o caso comum.
    expect(formatarDataHoraRpd(new Date("2026-03-10T03:30:00.000Z"))).toBe(
      "10/03/2026, 00:30",
    );
  });
});
