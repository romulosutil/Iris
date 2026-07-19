import { horaParaMin } from "./janela";

export type OrigemBloco = "previsto" | "concreto" | "conflito";

export interface RegraProjecao {
  id: string;
  diaSemana: number;
  horaInicio: string; // "HH:MM" (hora crua da regra)
  duracaoMin: number;
  disciplina: string;
  rotulo: string; // paciente ou terapeuta, conforme o eixo
}

export interface AvulsaProjecao {
  id: string;
  diaSemana: number;
  inicioMin: number; // minutos-locais SP (já convertido na query, C10)
  duracaoMin: number;
  disciplina: string;
  rotulo: string;
  /** Regra que originou esta sessão materializada (null/undefined p/ avulsa pura). */
  recorrenteId?: string | null;
}

export interface BlocoAgenda {
  id: string;
  origem: OrigemBloco;
  diaSemana: number;
  inicioMin: number;
  duracaoMin: number;
  disciplina: string;
  rotulo: string;
  /** Regra de origem (Etapa D): presente em todo bloco "previsto" (a própria
   * regra) e em "concreto" quando a sessão foi materializada de uma regra.
   * Ausente em avulsa pura — overlay correspondente continua não-interativo. */
  recorrenteId?: string;
}

/** Unifica regras (previsto) e avulsas (concreto) em blocos ordenados. */
export function projetarSemana(
  regras: RegraProjecao[],
  avulsas: AvulsaProjecao[],
): BlocoAgenda[] {
  const previstos: BlocoAgenda[] = regras.map((r) => ({
    id: r.id,
    origem: "previsto",
    diaSemana: r.diaSemana,
    inicioMin: horaParaMin(r.horaInicio),
    duracaoMin: r.duracaoMin,
    disciplina: r.disciplina,
    rotulo: r.rotulo,
    recorrenteId: r.id,
  }));
  const concretos: BlocoAgenda[] = avulsas.map((a) => ({
    id: a.id,
    origem: "concreto",
    diaSemana: a.diaSemana,
    inicioMin: a.inicioMin,
    duracaoMin: a.duracaoMin,
    disciplina: a.disciplina,
    rotulo: a.rotulo,
    recorrenteId: a.recorrenteId ?? undefined,
  }));
  return [...previstos, ...concretos].sort(
    (x, y) => x.diaSemana - y.diaSemana || x.inicioMin - y.inicioMin,
  );
}
