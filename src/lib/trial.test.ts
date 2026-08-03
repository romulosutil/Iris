import { describe, expect, it } from "vitest";
import { calcularStatusTrial, diasRestantesDeTrial, resolverFaixaTrial } from "./trial";

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

/**
 * #175: o relógio do trial passa a começar no 1º paciente cadastrado, com teto
 * de 14 dias após o cadastro da clínica. `trialComecoEm = null` deixou de ser
 * "clínica sem trial" e passou a ser "relógio ainda não disparou".
 */
describe("calcularStatusTrial", () => {
  const criadoEm = new Date("2026-08-01T14:00:00-03:00");

  it("sem 1º paciente e dentro do teto: aguardando, sem consumir dias", () => {
    const s = calcularStatusTrial(criadoEm, null, 7, TZ, new Date("2026-08-10T09:00:00-03:00"));

    expect(s.aguardandoPrimeiroPaciente).toBe(true);
    expect(s.ativo).toBe(true);
    expect(s.expirado).toBe(false);
    // O relógio não começou: continua valendo o trial inteiro.
    expect(s.diasRestantes).toBe(7);
  });

  it("no último dia do teto ainda está aguardando (fronteira de data civil)", () => {
    // 15/08 é o 14º dia após 01/08 — último dia dentro do teto.
    const s = calcularStatusTrial(criadoEm, null, 7, TZ, new Date("2026-08-15T23:00:00-03:00"));

    expect(s.aguardandoPrimeiroPaciente).toBe(true);
    expect(s.expirado).toBe(false);
  });

  it("teto de 14 dias estourado sem paciente: relógio conta a partir do teto", () => {
    // Teto = 15/08. Trial de 7 dias sobre o teto vence em 22/08.
    const dentro = calcularStatusTrial(criadoEm, null, 7, TZ, new Date("2026-08-18T09:00:00-03:00"));
    expect(dentro.aguardandoPrimeiroPaciente).toBe(false);
    expect(dentro.expirado).toBe(false);
    expect(dentro.diasRestantes).toBe(4);

    const fora = calcularStatusTrial(criadoEm, null, 7, TZ, new Date("2026-09-01T09:00:00-03:00"));
    expect(fora.aguardandoPrimeiroPaciente).toBe(false);
    expect(fora.expirado).toBe(true);
    // Clamp: nunca negativo na saída, mesmo com o trial vencido há semanas.
    expect(fora.diasRestantes).toBe(0);
  });

  it("trial iniciado no 1º paciente conta a partir dele, não do cadastro", () => {
    // Clínica criada em 01/08, 1º paciente só no dia 04/08.
    const trialComecoEm = new Date("2026-08-04T10:00:00-03:00");
    const s = calcularStatusTrial(criadoEm, trialComecoEm, 7, TZ, new Date("2026-08-06T09:00:00-03:00"));

    expect(s.aguardandoPrimeiroPaciente).toBe(false);
    expect(s.ativo).toBe(true);
    expect(s.diasRestantes).toBe(5);
    expect(s.dataInicio.getTime()).toBe(trialComecoEm.getTime());
  });

  it("expirado é derivado ANTES do clamp — 0 dias restantes ainda é trial ativo", () => {
    const trialComecoEm = new Date("2026-08-04T10:00:00-03:00");
    // 11/08 = dia do vencimento: 0 dias restantes, mas ainda não expirou.
    const ultimoDia = calcularStatusTrial(criadoEm, trialComecoEm, 7, TZ, new Date("2026-08-11T09:00:00-03:00"));
    expect(ultimoDia.diasRestantes).toBe(0);
    expect(ultimoDia.expirado).toBe(false);
    expect(ultimoDia.ativo).toBe(true);

    const diaSeguinte = calcularStatusTrial(criadoEm, trialComecoEm, 7, TZ, new Date("2026-08-12T09:00:00-03:00"));
    expect(diaSeguinte.diasRestantes).toBe(0);
    expect(diaSeguinte.expirado).toBe(true);
    expect(diaSeguinte.ativo).toBe(false);
  });
});

describe("resolverFaixaTrial", () => {
  const criadoEm = new Date("2026-08-01T14:00:00-03:00");

  it("clínica isenta (pré-self-service) nunca vê a faixa", () => {
    // Substitui o paliativo do corte de data (`CORTE_TRIAL_REAL`, commit
    // ad789a6): o legado agora é marcado no banco, não adivinhado pela data.
    expect(
      resolverFaixaTrial({
        criadoEm,
        trialComecoEm: null,
        trialDias: 7,
        isentoTrial: true,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("clínica isenta não vê a faixa nem se tiver trial_comeco_em gravado", () => {
    expect(
      resolverFaixaTrial({
        criadoEm,
        trialComecoEm: new Date("2026-08-02T10:00:00-03:00"),
        trialDias: 7,
        isentoTrial: true,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("devolve null quando não há trial configurado (trialDias ausente)", () => {
    expect(
      resolverFaixaTrial({
        criadoEm,
        trialComecoEm: new Date("2026-08-02T10:00:00-03:00"),
        trialDias: null,
        isentoTrial: false,
        timezone: TZ,
      }),
    ).toBeNull();
  });

  it("sem 1º paciente dentro do teto: a faixa APARECE, no estado aguardando", () => {
    const r = resolverFaixaTrial({
      criadoEm,
      trialComecoEm: null,
      trialDias: 7,
      isentoTrial: false,
      timezone: TZ,
    }, new Date("2026-08-05T09:00:00-03:00"));

    expect(r).not.toBeNull();
    expect(r!.aguardandoPrimeiroPaciente).toBe(true);
  });

  it("Finding 2 da review da PR #166: trial com 0 dias restantes renderiza a faixa, não some", () => {
    // 0 é falsy em JS — a checagem antiga (`&&`) ocultaria a faixa no dia do
    // vencimento. `!= null` cobre null/undefined sem descartar 0.
    const r = resolverFaixaTrial({
      criadoEm,
      trialComecoEm: new Date("2026-08-04T10:00:00-03:00"),
      trialDias: 7,
      isentoTrial: false,
      timezone: TZ,
    }, new Date("2026-08-11T09:00:00-03:00"));

    expect(r).not.toBeNull();
    expect(r!.diasRestantes).toBe(0);
    expect(r!.aguardandoPrimeiroPaciente).toBe(false);
  });

  it("trial vencido devolve número negativo (faixa no estado 'encerrado')", () => {
    const r = resolverFaixaTrial({
      criadoEm,
      trialComecoEm: new Date("2026-08-04T10:00:00-03:00"),
      trialDias: 7,
      isentoTrial: false,
      timezone: TZ,
    }, new Date("2026-09-01T09:00:00-03:00"));

    expect(r).not.toBeNull();
    expect(r!.diasRestantes).toBeLessThan(0);
  });

  it("teto estourado sem paciente: faixa deixa de ser 'aguardando' e vira contagem", () => {
    const r = resolverFaixaTrial({
      criadoEm,
      trialComecoEm: null,
      trialDias: 7,
      isentoTrial: false,
      timezone: TZ,
    }, new Date("2026-09-01T09:00:00-03:00"));

    expect(r).not.toBeNull();
    expect(r!.aguardandoPrimeiroPaciente).toBe(false);
    expect(r!.diasRestantes).toBeLessThan(0);
  });
});
