import { describe, expect, it } from "vitest";
import { diasRestantesDeTrial, resolverDiasRestantesParaFaixa } from "./trial";

const TZ = "America/Sao_Paulo";

describe("diasRestantesDeTrial", () => {
  it("no dia do cadastro restam 7 dias", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-01T20:00:00-03:00"))).toBe(7);
  });

  it("na véspera do vencimento resta 1 dia", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-07T23:00:00-03:00"))).toBe(1);
  });

  it("no dia do vencimento resta 0 (último dia a exibir)", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-08T01:00:00-03:00"))).toBe(0);
  });

  it("depois do vencimento fica negativo (não exibe banner)", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    // 1 dia depois: -1
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-09T01:00:00-03:00"))).toBe(-1);
    // Muitos dias depois: número negativo maior
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-09-30T01:00:00-03:00"))).toBeLessThan(0);
  });

  it("usa a fronteira de dia do timezone da clínica, não do servidor", () => {
    const inicio = new Date("2026-08-01T14:00:00-03:00");
    // 02:00 UTC de 08/08 ainda é 23:00 de 07/08 em São Paulo → ainda resta 1 dia.
    expect(diasRestantesDeTrial(inicio, 7, TZ, new Date("2026-08-08T02:00:00Z"))).toBe(1);
  });
});

describe("resolverDiasRestantesParaFaixa", () => {
  it("Finding 2 da review da PR #166: trial com 0 dias restantes tem que renderizar a faixa, não escondê-la", () => {
    // trialDias = 0 é falsy em JS — a checagem antiga (`&&`) cairia no
    // fallback e ocultaria a faixa mesmo com o trial "terminando hoje".
    const agora = new Date();
    const resultado = resolverDiasRestantesParaFaixa({
      trialComecoEm: agora,
      trialDias: 0,
      timezone: TZ,
    });
    // Não pode ser `null` (que faria o layout usar o fallback -1 e ocultar
    // a faixa) — precisa ser um número, mesmo que seja 0.
    expect(resultado).not.toBeNull();
    expect(resultado).toBe(0);
  });

  it("devolve null quando não há trial ativo (trialDias ausente)", () => {
    expect(
      resolverDiasRestantesParaFaixa({
        trialComecoEm: new Date(),
        trialDias: null,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("devolve null quando não há data de início de trial", () => {
    expect(
      resolverDiasRestantesParaFaixa({
        trialComecoEm: null,
        trialDias: 7,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  /**
   * Achado bloqueante do Jules na PR #176.
   *
   * A migração 0057 é `NOT NULL` e fez `UPDATE clinic SET trial_comeco_em =
   * '2020-01-01'` nas clínicas pré-existentes, escolhendo 2020 exatamente
   * porque, no contrato antigo, negativo significava "não mostrar a faixa".
   * Quando a faixa ganhou o estado "encerrado", esse sentinela virou uma
   * clínica em trial vencido para sempre — toda clínica anterior ao
   * self-service passaria a ver "seu período de teste terminou" eternamente.
   *
   * Sem o corte de data, este caso devolve um número negativo (≈ -2400) em vez
   * de `null`, e o layout renderiza a faixa. É o que discrimina o fix.
   */
  it("devolve null para o sentinela de 2020 da migração 0057 (clínica pré-self-service)", () => {
    expect(
      resolverDiasRestantesParaFaixa({
        trialComecoEm: new Date("2020-01-01T00:00:00Z"),
        trialDias: 7,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("devolve null para qualquer data anterior ao nascimento do self-service", () => {
    expect(
      resolverDiasRestantesParaFaixa({
        trialComecoEm: new Date("2026-06-30T23:59:59Z"),
        trialDias: 7,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("trata como trial real uma conta criada depois do corte, mesmo já vencida", () => {
    // Conta self-service de verdade, com o trial vencido: precisa devolver
    // número negativo (faixa "encerrado"), não `null`. Se o corte engolir este
    // caso, o estado "encerrado" nunca aparece para ninguém.
    //
    // A data é logo depois do corte e o vencimento fica no passado, então a
    // asserção não envelhece com o relógio real.
    const resultado = resolverDiasRestantesParaFaixa({
      trialComecoEm: new Date("2026-07-01T12:00:00Z"),
      trialDias: 7,
      timezone: TZ,
    });

    expect(resultado).not.toBeNull();
    expect(resultado!).toBeLessThan(0);
  });
});
