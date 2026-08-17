// Núcleo de materialização — resolução naive→instante IANA-correta (D-1/inv1) e
// aritmética de data em UTC (não sofre DST). NUNCA usa offset fixo congelado.

/** Offset da zona (ms) no instante `ts`: quanto o wall-clock local excede o UTC. */
function offsetMs(ts: number, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(ts))
      .map((x) => [x.type, x.value]),
  );
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    p.hour === "24" ? 0 : Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUTC - ts;
}

/**
 * Instante absoluto cujo wall-clock em `fuso` é o naive `dataISO`+`horaHHMM`.
 * Inverso de `paraMinutosLocais`. Ponto-fixo de 2 iterações cobre a virada de DST.
 */
export function resolverInstante(
  dataISO: string,
  horaHHMM: string,
  fuso: string,
): Date {
  const [h, m] = horaHHMM.split(":");
  const [Y, Mo, D] = dataISO.split("-");
  const naive = Date.UTC(
    Number(Y),
    Number(Mo) - 1,
    Number(D),
    Number(h),
    Number(m),
  );
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - offsetMs(ts, fuso);
  return new Date(ts);
}

/** Horizonte rolling default: hoje + 12 semanas (84 dias). Aritmética em UTC. */
export function horizontePadrao(hojeISO: string): string {
  const d = new Date(`${hojeISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 84);
  return d.toISOString().slice(0, 10);
}

/** Dia seguinte a `dataISO` (ISO). Base do cutoff de encerramento (F5a). */
export function proximoDia(dataISO: string): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface RegraDatas {
  diaSemana: number;
  vigenciaInicio: string;
  vigenciaFim: string | null;
}

export interface BloqueioPeriodo {
  dataInicio: string;
  dataFim: string;
}

function bloqueada(dataISO: string, bloqueios: BloqueioPeriodo[]): boolean {
  return bloqueios.some((b) => dataISO >= b.dataInicio && dataISO <= b.dataFim);
}

/** Datas ISO do diaSemana da regra em [de, ate] ∩ vigência, menos bloqueios. */
export function datasDaRegra(
  regra: RegraDatas,
  deISO: string,
  ateISO: string,
  bloqueios: BloqueioPeriodo[],
): string[] {
  const inicio = deISO > regra.vigenciaInicio ? deISO : regra.vigenciaInicio;
  const fim =
    regra.vigenciaFim && regra.vigenciaFim < ateISO
      ? regra.vigenciaFim
      : ateISO;
  const datas: string[] = [];
  const cur = new Date(`${inicio}T00:00:00Z`);
  const limite = new Date(`${fim}T00:00:00Z`);
  // avança até o primeiro diaSemana >= inicio
  while (cur.getUTCDay() !== regra.diaSemana && cur <= limite) {
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  while (cur <= limite) {
    const iso = cur.toISOString().slice(0, 10);
    if (!bloqueada(iso, bloqueios)) datas.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return datas;
}
