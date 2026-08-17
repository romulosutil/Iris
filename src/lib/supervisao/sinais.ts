export type SinalTipo = "estagnacao" | "regressao" | "faltas_excessivas";

export type DetalheEstagnacao = {
  metrica: string;
  tipoEstrutura: string;
  sessionNumero: number;
};

export type DetalheFaltas = {
  faltas: number;
  janelaSemanas: number;
  limiar: number;
};

export type SinalCru = {
  tipo: SinalTipo;
  patientId: string;
  goalId: string | null;
  protocolId: string | null;
  detalhe: DetalheEstagnacao | DetalheFaltas;
};

export function chaveNatural(
  s: Pick<SinalCru, "tipo" | "patientId" | "goalId" | "protocolId">,
): string {
  return s.tipo === "faltas_excessivas"
    ? `faltas_excessivas:${s.patientId}`
    : `${s.tipo}:${s.patientId}:${s.goalId}:${s.protocolId}`;
}

export type SnapshotRow = {
  patientId: string;
  sessionNumero: number;
  segmentacao: Record<
    string,
    Record<string, { tipo_estrutura: string; metrica: string; rotulo: string }>
  >;
};

export function sinaisDeSnapshot(rows: SnapshotRow[]): SinalCru[] {
  const sinais: SinalCru[] = [];
  for (const row of rows) {
    if (!row.segmentacao) continue;
    for (const [goalId, protocols] of Object.entries(row.segmentacao)) {
      if (!protocols) continue;
      for (const [protocolId, data] of Object.entries(protocols)) {
        if (
          data &&
          (data.rotulo === "estagnacao" || data.rotulo === "regressao")
        ) {
          sinais.push({
            tipo: data.rotulo as SinalTipo,
            patientId: row.patientId,
            goalId,
            protocolId,
            detalhe: {
              metrica: data.metrica,
              tipoEstrutura: data.tipo_estrutura,
              sessionNumero: row.sessionNumero,
            },
          });
        }
      }
    }
  }
  return sinais.sort((a, b) => {
    if (a.patientId !== b.patientId)
      return a.patientId.localeCompare(b.patientId);
    const aGoal = a.goalId || "";
    const bGoal = b.goalId || "";
    if (aGoal !== bGoal) return aGoal.localeCompare(bGoal);
    const aProto = a.protocolId || "";
    const bProto = b.protocolId || "";
    return aProto.localeCompare(bProto);
  });
}

export type FaltaCount = { patientId: string; faltas: number };

export function sinaisDeFaltas(
  counts: FaltaCount[],
  cfg: { limiar: number; janelaSemanas: number },
): SinalCru[] {
  return counts
    .filter((c) => c.faltas >= cfg.limiar)
    .map((c) => ({
      tipo: "faltas_excessivas" as const,
      patientId: c.patientId,
      goalId: null,
      protocolId: null,
      detalhe: {
        faltas: c.faltas,
        janelaSemanas: cfg.janelaSemanas,
        limiar: cfg.limiar,
      },
    }))
    .sort((a, b) => a.patientId.localeCompare(b.patientId));
}
