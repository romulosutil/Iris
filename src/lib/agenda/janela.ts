export type FaixaDia = { diaSemana: number; horaInicio: string; horaFim: string };

export function horaParaMin(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

export function minParaHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fundirFaixasPorDia(faixas: FaixaDia[]): FaixaDia[] {
  const porDia = new Map<number, Array<[number, number]>>();
  for (const f of faixas) {
    const ini = horaParaMin(f.horaInicio);
    const fim = horaParaMin(f.horaFim);
    if (fim <= ini) continue; // descarta vazia/invertida
    const lista = porDia.get(f.diaSemana) ?? [];
    lista.push([ini, fim]);
    porDia.set(f.diaSemana, lista);
  }
  const resultado: FaixaDia[] = [];
  for (const [dia, lista] of [...porDia.entries()].sort((a, b) => a[0] - b[0])) {
    lista.sort((a, b) => a[0] - b[0]);
    let [curIni, curFim] = lista[0]!;
    for (let i = 1; i < lista.length; i++) {
      const [ini, fim] = lista[i]!;
      if (ini <= curFim) {
        curFim = Math.max(curFim, fim); // sobreposta ou encostada
      } else {
        resultado.push({ diaSemana: dia, horaInicio: minParaHora(curIni), horaFim: minParaHora(curFim) });
        [curIni, curFim] = [ini, fim];
      }
    }
    resultado.push({ diaSemana: dia, horaInicio: minParaHora(curIni), horaFim: minParaHora(curFim) });
  }
  return resultado;
}

export function horasDisponiveisSemana(faixas: FaixaDia[]): number {
  const fundidas = fundirFaixasPorDia(faixas);
  const totalMin = fundidas.reduce((acc, f) => acc + (horaParaMin(f.horaFim) - horaParaMin(f.horaInicio)), 0);
  return Math.round((totalMin / 60) * 10) / 10;
}
