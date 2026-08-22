import { describe, expect, test, vi } from "vitest";
import {
  avaliarCandidaturaGoal,
  materializarSnapshot,
  type EvidenciaObservada,
  type MaterializarQueries,
} from "./materializar";
import type { TipoEstrutura } from "./segmentacao";

describe("materializarSnapshot (unitário e contagem de chamadas)", () => {
  const patientId = "00000000-0000-0000-0000-000000000001";
  const protocol1 = "00000000-0000-0000-0000-000000000010";
  const protocol2 = "00000000-0000-0000-0000-000000000020";
  const milestone1 = "00000000-0000-0000-0000-000000000100";
  const milestone2 = "00000000-0000-0000-0000-000000000200";
  const goal1 = "00000000-0000-0000-0000-000000001000";
  const goal2 = "00000000-0000-0000-0000-000000002000";
  const goal3 = "00000000-0000-0000-0000-000000003000";

  test("retorna imediatamente sem nenhuma consulta adicional se paciente não tem evidências", async () => {
    const queries: MaterializarQueries = {
      evidenciasDoPaciente: vi.fn().mockResolvedValue([]),
      taxonomiaDoProtocolo: vi.fn(),
      taxonomiasDosProtocolos: vi.fn(),
      tipoEstruturaDoMarco: vi.fn(),
      tiposEstruturaDosMarcos: vi.fn(),
      criterioDominioDaMeta: vi.fn(),
      criteriosDominioDasMetas: vi.fn(),
      lerCandidaturaGoalAtual: vi.fn(),
      lerCandidaturasGoalsAtuais: vi.fn(),
      aplicarSnapshot: vi.fn(),
      aplicarCandidaturaGoal: vi.fn(),
    };

    await materializarSnapshot(queries, patientId, 1);

    expect(queries.evidenciasDoPaciente).toHaveBeenCalledTimes(1);
    expect(queries.taxonomiasDosProtocolos).not.toHaveBeenCalled();
    expect(queries.tiposEstruturaDosMarcos).not.toHaveBeenCalled();
    expect(queries.criteriosDominioDasMetas).not.toHaveBeenCalled();
    expect(queries.lerCandidaturasGoalsAtuais).not.toHaveBeenCalled();
    expect(queries.aplicarSnapshot).not.toHaveBeenCalled();
    expect(queries.aplicarCandidaturaGoal).not.toHaveBeenCalled();
  });

  test("elimina os 3 N+1: faz exatamente 1 chamada em lote para protocolos, marcos, critérios e candidaturas", async () => {
    const evidencias: EvidenciaObservada[] = [
      {
        sessionNumero: 1,
        goalId: goal1,
        milestoneId: milestone1,
        protocolId: protocol1,
        nivelAjuda: "independente",
        polaridade: "positiva",
        temQueryAberta: false,
      },
      {
        sessionNumero: 1,
        goalId: goal2,
        milestoneId: milestone2,
        protocolId: protocol2,
        nivelAjuda: "dica_verbal",
        polaridade: "positiva",
        temQueryAberta: false,
      },
      {
        sessionNumero: 2,
        goalId: goal1,
        milestoneId: milestone1,
        protocolId: protocol1,
        nivelAjuda: "independente",
        polaridade: "positiva",
        temQueryAberta: false,
      },
      {
        sessionNumero: 2,
        goalId: goal3,
        milestoneId: null,
        protocolId: protocol2,
        nivelAjuda: "independente",
        polaridade: "positiva",
        temQueryAberta: false,
      },
    ];

    const taxonomiasMap = new Map<string, string[]>([
      [protocol1, ["independente", "dica_verbal", "dica_fisica"]],
      [protocol2, ["independente", "dica_verbal", "dica_fisica"]],
    ]);

    const marcosMap = new Map<string, TipoEstrutura | null>([
      [milestone1, "marco_simples"],
      [milestone2, "marco_com_barreira"],
    ]);

    const criteriosMap = new Map([
      [goal1, { tipo: "sessoes_consecutivas_independente", valor: 2 } as const],
      [goal2, { tipo: "sessoes_consecutivas_independente", valor: 3 } as const],
      [goal3, { tipo: "sessoes_consecutivas_independente", valor: 1 } as const],
    ]);

    const existingDate = new Date("2026-08-01T10:00:00Z");
    const candidaturasMap = new Map([
      [goal1, { isCandidate: true, candidacySince: existingDate }],
      [goal2, { isCandidate: false, candidacySince: null }],
      [goal3, { isCandidate: false, candidacySince: null }],
    ]);

    const snapshotsAplicados: Array<{
      sessionNumero: number;
      repertorio: Record<string, unknown>;
      segmentacao: Record<string, unknown>;
    }> = [];
    const candidaturasAplicadas: Array<{
      goalId: string;
      isCandidate: boolean;
      candidacySince: Date | null;
    }> = [];

    const queries: MaterializarQueries = {
      evidenciasDoPaciente: vi.fn().mockResolvedValue(evidencias),
      taxonomiaDoProtocolo: vi.fn(),
      taxonomiasDosProtocolos: vi.fn().mockResolvedValue(taxonomiasMap),
      tipoEstruturaDoMarco: vi.fn(),
      tiposEstruturaDosMarcos: vi.fn().mockResolvedValue(marcosMap),
      criterioDominioDaMeta: vi.fn(),
      criteriosDominioDasMetas: vi.fn().mockResolvedValue(criteriosMap),
      lerCandidaturaGoalAtual: vi.fn(),
      lerCandidaturasGoalsAtuais: vi.fn().mockResolvedValue(candidaturasMap),
      aplicarSnapshot: vi.fn().mockImplementation(async (input) => {
        snapshotsAplicados.push(input);
      }),
      aplicarCandidaturaGoal: vi.fn().mockImplementation(async (input) => {
        candidaturasAplicadas.push(input);
      }),
    };

    await materializarSnapshot(queries, patientId, 2);

    // Oráculo estrito de contagem: 1 chamada por batch method, 0 chamadas por single-lookup
    expect(queries.evidenciasDoPaciente).toHaveBeenCalledTimes(1);
    expect(queries.taxonomiasDosProtocolos).toHaveBeenCalledTimes(1);
    expect(queries.taxonomiaDoProtocolo).not.toHaveBeenCalled();
    expect(queries.tiposEstruturaDosMarcos).toHaveBeenCalledTimes(1);
    expect(queries.tipoEstruturaDoMarco).not.toHaveBeenCalled();
    expect(queries.criteriosDominioDasMetas).toHaveBeenCalledTimes(1);
    expect(queries.criterioDominioDaMeta).not.toHaveBeenCalled();
    expect(queries.lerCandidaturasGoalsAtuais).toHaveBeenCalledTimes(1);
    expect(queries.lerCandidaturaGoalAtual).not.toHaveBeenCalled();

    // Verificando argumentos passados para os batch methods
    expect(queries.taxonomiasDosProtocolos).toHaveBeenCalledWith([
      protocol1,
      protocol2,
    ]);
    expect(queries.tiposEstruturaDosMarcos).toHaveBeenCalledWith([
      milestone1,
      milestone2,
    ]);
    expect(queries.criteriosDominioDasMetas).toHaveBeenCalledWith([
      goal1,
      goal2,
      goal3,
    ]);
    expect(queries.lerCandidaturasGoalsAtuais).toHaveBeenCalledWith([
      goal1,
      goal2,
      goal3,
    ]);

    // Materializou apenas sessão >= 2
    expect(snapshotsAplicados).toHaveLength(1);
    expect(snapshotsAplicados[0]?.sessionNumero).toBe(2);

    // Candidatura de goal1 preserva a data antiga candidacySince
    const cand1 = candidaturasAplicadas.find((c) => c.goalId === goal1);
    expect(cand1).toBeDefined();
    expect(cand1?.isCandidate).toBe(true);
    expect(cand1?.candidacySince).toBe(existingDate);

    // Candidatura de goal2 não atinge critério (apenas 1 sessão positiva de 3 necessárias)
    const cand2 = candidaturasAplicadas.find((c) => c.goalId === goal2);
    expect(cand2).toBeDefined();
    expect(cand2?.isCandidate).toBe(false);
    expect(cand2?.candidacySince).toBeNull();

    // Candidatura de goal3 é nova candidata (1 sessão independente) -> nova data gerada
    const cand3 = candidaturasAplicadas.find((c) => c.goalId === goal3);
    expect(cand3).toBeDefined();
    expect(cand3?.isCandidate).toBe(true);
    expect(cand3?.candidacySince).toBeInstanceOf(Date);
  });
});

describe("avaliarCandidaturaGoal", () => {
  test("ignora observações com query aberta", () => {
    const criterio = {
      tipo: "sessoes_consecutivas_independente",
      valor: 2,
    };
    const obs = [
      {
        sessionNumero: 1,
        tipoEstrutura: "marco_simples" as const,
        nivelAjudaOrdinal: 0,
        polaridade: "positiva" as const,
        temQueryAberta: false,
      },
      {
        sessionNumero: 2,
        tipoEstrutura: "marco_simples" as const,
        nivelAjudaOrdinal: 0,
        polaridade: "positiva" as const,
        temQueryAberta: true, // query aberta -> desconsiderada
      },
    ];

    expect(avaliarCandidaturaGoal(criterio, obs)).toBe(false);
  });

  test("retorna true quando histórico tem N sessões consecutivas independentes", () => {
    const criterio = {
      tipo: "sessoes_consecutivas_independente",
      valor: 2,
    };
    const obs = [
      {
        sessionNumero: 1,
        tipoEstrutura: "marco_simples" as const,
        nivelAjudaOrdinal: 0,
        polaridade: "positiva" as const,
        temQueryAberta: false,
      },
      {
        sessionNumero: 2,
        tipoEstrutura: "marco_simples" as const,
        nivelAjudaOrdinal: 0,
        polaridade: "positiva" as const,
        temQueryAberta: false,
      },
    ];

    expect(avaliarCandidaturaGoal(criterio, obs)).toBe(true);
  });
});
