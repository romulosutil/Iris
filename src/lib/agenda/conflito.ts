export interface Intervalo {
  inicioMin: number;
  fimMin: number;
}

/** Sobreposição meia-aberta [início, fim): adjacentes não colidem. */
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicioMin < b.fimMin && b.inicioMin < a.fimMin;
}

export interface Slot extends Intervalo {
  diaSemana: number;
}

/**
 * True se `nova` colide com alguma ocupação de UMA entidade (terapeuta OU
 * paciente). C5: o chamador roda para ambas dimensões e faz OR do resultado.
 */
export function conflita(nova: Slot, existentes: Slot[]): boolean {
  return existentes.some(
    (e) => e.diaSemana === nova.diaSemana && sobrepoe(nova, e),
  );
}
