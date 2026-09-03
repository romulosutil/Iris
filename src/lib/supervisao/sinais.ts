import {
  formatarMetricaSegmentacao,
  type ResultadoSegmentacao,
  type Segmentacao,
} from "@/lib/evidence/snapshot-schema";

export type SinalTipo = "estagnacao" | "regressao" | "faltas_excessivas";

export type DetalheEstagnacao = {
  /** Já formatado para exibição (`formatarMetricaSegmentacao`) — nunca o
   * objeto cru do snapshot. `null` quando não há métrica. */
  metrica: string | null;
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
  /** Forma persistida de `session_snapshot.segmentacao` — `metrica` é objeto
   * OU string, conforme o schema; nunca redeclarar `string` aqui (#567). */
  segmentacao: Segmentacao;
};

/**
 * Detalhe de um alerta JÁ PERSISTIDO (`alerta.detalhe`, jsonb) → forma de
 * exibição. Linhas antigas guardam `metrica` como objeto; a formatação roda na
 * LEITURA, então não há backfill a fazer (#567).
 */
export function lerDetalheAlerta(
  bruto: unknown,
): DetalheEstagnacao | DetalheFaltas {
  const dados = (
    typeof bruto === "string" ? JSON.parse(bruto) : bruto
  ) as Record<string, unknown>;
  if (dados && typeof dados === "object" && "metrica" in dados) {
    return {
      ...(dados as unknown as DetalheEstagnacao),
      metrica: formatarMetricaSegmentacao(
        dados.metrica as ResultadoSegmentacao["metrica"],
      ),
    };
  }
  return dados as unknown as DetalheFaltas;
}

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
              metrica: formatarMetricaSegmentacao(data.metrica),
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
