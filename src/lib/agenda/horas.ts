export type RegraAtiva = { disciplina: string; duracaoMin: number };
export type SessaoRealizada = { disciplina: string; duracaoMin: number; agendadaPara: Date };

const MS_SEMANA = 7 * 24 * 60 * 60 * 1000;

function somaPorDisciplina(itens: RegraAtiva[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const i of itens) acc[i.disciplina] = (acc[i.disciplina] ?? 0) + i.duracaoMin;
  return acc;
}

export function horasAgendadasPorDisciplina(regras: RegraAtiva[]): Record<string, number> {
  const min = somaPorDisciplina(regras);
  return Object.fromEntries(Object.entries(min).map(([d, m]) => [d, m / 60]));
}

/** Média de horas realizadas por semana ativa, POR disciplina, contando as
 * semanas desde a 1ª sessão daquela disciplina (mínimo 1) — paciente novo não
 * aparece com aderência falsa. */
export function horasRealizadasPorDisciplina(
  sessoes: SessaoRealizada[], agora: Date,
): Record<string, number> {
  const porDisc = new Map<string, SessaoRealizada[]>();
  for (const s of sessoes) {
    const arr = porDisc.get(s.disciplina) ?? [];
    arr.push(s); porDisc.set(s.disciplina, arr);
  }
  const out: Record<string, number> = {};
  for (const [disc, arr] of porDisc) {
    const primeira = Math.min(...arr.map((s) => s.agendadaPara.getTime()));
    const semanas = Math.max(1, Math.ceil((agora.getTime() - primeira) / MS_SEMANA));
    const horas = arr.reduce((acc, s) => acc + s.duracaoMin, 0) / 60;
    out[disc] = horas / semanas;
  }
  return out;
}

export function defasagem(alvo: number, agendado: number): number {
  return alvo - agendado;
}

export function temDefasagemSustentada(
  semanas: { alvo: number; agendado: number }[], limiar = 2,
): boolean {
  let seq = 0;
  for (const s of semanas) {
    if (s.agendado < s.alvo) { seq++; if (seq >= limiar) return true; }
    else seq = 0;
  }
  return false;
}

export function alocadoTerapeuta(regras: RegraAtiva[]): number {
  return regras.reduce((acc, r) => acc + r.duracaoMin, 0) / 60;
}

export function vagoTerapeuta(capacidade: number, alocado: number, horasBloqueadas: number): number {
  return capacidade - alocado - horasBloqueadas;
}
