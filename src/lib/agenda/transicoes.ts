import { sessionEstado } from "@/db/schema";

export type SessionEstado = (typeof sessionEstado.enumValues)[number];

const TERMINAIS: readonly SessionEstado[] = [
  "realizada",
  "falta_paciente",
  "falta_terapeuta",
  "cancelada",
];

/** Só sessão `agendada` transiciona, e só para um estado terminal. */
export function transicaoPermitida(
  de: SessionEstado,
  para: SessionEstado,
): boolean {
  if (de !== "agendada") return false;
  return TERMINAIS.includes(para);
}

/** `justificada` só é relevante em faltas. */
export function exigeJustificada(estado: SessionEstado): boolean {
  return estado === "falta_paciente" || estado === "falta_terapeuta";
}
