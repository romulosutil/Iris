// Aritmética de datas em UTC para não sofrer deslocamento de DST — opera
// sobre strings ISO date-only (YYYY-MM-DD), nunca sobre horário local.

function paraUTC(dataISO: string): Date {
  return new Date(`${dataISO}T00:00:00Z`);
}

/** Segunda-feira da semana que contém `dataISO` (semana ISO, seg→dom). */
export function segundaDaSemana(dataISO: string): string {
  const d = paraUTC(dataISO);
  const dow = d.getUTCDay(); // 0=domingo … 6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** 7 datas ISO a partir de uma segunda (inclusive), seg→dom. */
export function diasDaSemana(segundaISO: string): string[] {
  const base = paraUTC(segundaISO);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** C7: vigência nunca começa no passado — max(segunda visível, segunda atual). */
export function vigenciaInicioC7(semanaVisivelISO: string, hojeISO: string): string {
  const segVisivel = segundaDaSemana(semanaVisivelISO);
  const segAtual = segundaDaSemana(hojeISO);
  return segVisivel > segAtual ? segVisivel : segAtual;
}

/** C7: alocação em semana passada é desabilitada na UI. */
export function semanaEhPassada(semanaVisivelISO: string, hojeISO: string): boolean {
  return segundaDaSemana(semanaVisivelISO) < segundaDaSemana(hojeISO);
}
