import { describe, it, expect } from "vitest";
import {
  chaveNatural,
  sinaisDeSnapshot,
  sinaisDeFaltas,
  type SnapshotRow,
} from "./sinais";

describe("sinais - logic unit tests", () => {
  describe("sinaisDeSnapshot", () => {
    it("1. emite um sinal estagnacao para leaf com rotulo='estagnacao'", () => {
      const rows: SnapshotRow[] = [
        {
          patientId: "patient-1",
          sessionNumero: 42,
          segmentacao: {
            "goal-1": {
              "protocol-1": {
                tipo_estrutura: "motor",
                metrica: "tempo",
                rotulo: "estagnacao",
              },
            },
          },
        },
      ];

      const result = sinaisDeSnapshot(rows);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        tipo: "estagnacao",
        patientId: "patient-1",
        goalId: "goal-1",
        protocolId: "protocol-1",
        detalhe: {
          metrica: "tempo",
          tipoEstrutura: "motor",
          sessionNumero: 42,
        },
      });
    });

    it("2. emite regressao para rotulo='regressao'", () => {
      const rows: SnapshotRow[] = [
        {
          patientId: "patient-1",
          sessionNumero: 42,
          segmentacao: {
            "goal-1": {
              "protocol-1": {
                tipo_estrutura: "motor",
                metrica: "tempo",
                rotulo: "regressao",
              },
            },
          },
        },
      ];

      const result = sinaisDeSnapshot(rows);
      expect(result).toHaveLength(1);
      expect(result[0]!.tipo).toBe("regressao");
    });

    it("3. ignora evolucao, sem_dado, aguardando_avaliacao_formal", () => {
      const rows: SnapshotRow[] = [
        {
          patientId: "patient-1",
          sessionNumero: 42,
          segmentacao: {
            "goal-1": {
              "protocol-1": { tipo_estrutura: "motor", metrica: "tempo", rotulo: "evolucao" },
              "protocol-2": { tipo_estrutura: "motor", metrica: "tempo", rotulo: "sem_dado" },
              "protocol-3": { tipo_estrutura: "motor", metrica: "tempo", rotulo: "aguardando_avaliacao_formal" },
            },
          },
        },
      ];

      const result = sinaisDeSnapshot(rows);
      expect(result).toHaveLength(0);
    });

    it("4. com múltiplos goals/protocols -> um sinal por par sinalizado, ordem determinística (patientId, goalId, protocolId)", () => {
      const rows: SnapshotRow[] = [
        {
          patientId: "patient-b",
          sessionNumero: 10,
          segmentacao: {
            "goal-1": {
              "protocol-2": { tipo_estrutura: "a", metrica: "m", rotulo: "estagnacao" },
              "protocol-1": { tipo_estrutura: "a", metrica: "m", rotulo: "regressao" },
            },
          },
        },
        {
          patientId: "patient-a",
          sessionNumero: 12,
          segmentacao: {
            "goal-2": {
              "protocol-1": { tipo_estrutura: "a", metrica: "m", rotulo: "estagnacao" },
            },
            "goal-1": {
              "protocol-1": { tipo_estrutura: "a", metrica: "m", rotulo: "regressao" },
            },
          },
        },
      ];

      const result = sinaisDeSnapshot(rows);
      expect(result).toHaveLength(4);
      // patient-a deve vir antes de patient-b
      expect(result[0]!.patientId).toBe("patient-a");
      expect(result[0]!.goalId).toBe("goal-1");
      expect(result[0]!.protocolId).toBe("protocol-1");

      expect(result[1]!.patientId).toBe("patient-a");
      expect(result[1]!.goalId).toBe("goal-2");
      expect(result[1]!.protocolId).toBe("protocol-1");

      expect(result[2]!.patientId).toBe("patient-b");
      expect(result[2]!.goalId).toBe("goal-1");
      expect(result[2]!.protocolId).toBe("protocol-1");

      expect(result[3]!.patientId).toBe("patient-b");
      expect(result[3]!.goalId).toBe("goal-1");
      expect(result[3]!.protocolId).toBe("protocol-2");
    });
  });

  describe("sinaisDeFaltas", () => {
    it("5. emite quando faltas >= limiar; não emite quando < limiar", () => {
      const counts = [
        { patientId: "patient-1", faltas: 3 },
        { patientId: "patient-2", faltas: 2 },
      ];
      const cfg = { limiar: 3, janelaSemanas: 4 };

      const result = sinaisDeFaltas(counts, cfg);
      expect(result).toHaveLength(1);
      expect(result[0]!.patientId).toBe("patient-1");
      expect(result[0]!.detalhe).toEqual({
        faltas: 3,
        janelaSemanas: 4,
        limiar: 3,
      });
    });

    it("6. no limite exato (faltas === limiar) -> emite", () => {
      const counts = [{ patientId: "patient-1", faltas: 5 }];
      const cfg = { limiar: 5, janelaSemanas: 4 };

      const result = sinaisDeFaltas(counts, cfg);
      expect(result).toHaveLength(1);
      expect(result[0]!.patientId).toBe("patient-1");
    });
  });

  describe("chaveNatural", () => {
    it("7. chaveNatural estável e distinta: estagnação vs regressão do mesmo par -> chaves diferentes; faltas depende só do paciente", () => {
      const s1 = {
        tipo: "estagnacao" as const,
        patientId: "p1",
        goalId: "g1",
        protocolId: "pr1",
      };
      const s2 = {
        tipo: "regressao" as const,
        patientId: "p1",
        goalId: "g1",
        protocolId: "pr1",
      };
      const sFaltas = {
        tipo: "faltas_excessivas" as const,
        patientId: "p1",
        goalId: null,
        protocolId: null,
      };

      const c1 = chaveNatural(s1);
      const c2 = chaveNatural(s2);
      const c3 = chaveNatural(sFaltas);

      expect(c1).toBe("estagnacao:p1:g1:pr1");
      expect(c2).toBe("regressao:p1:g1:pr1");
      expect(c3).toBe("faltas_excessivas:p1");
      expect(c1).not.toBe(c2);
    });
  });
});
