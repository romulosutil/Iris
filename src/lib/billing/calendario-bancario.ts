/**
 * Calendário bancário brasileiro para a janela do Pix Automático (#317).
 *
 * Existe porque o repo não tem nenhuma biblioteca de data (`date-fns`,
 * `dayjs`, `luxon`) nem tabela de feriados nacionais — o único "feriado" do
 * sistema é o bloqueio de agenda por clínica, alimentado à mão pelo
 * coordenador, tenant-scoped e inútil para cobrança.
 *
 * Cobre **feriado bancário**, não feriado civil: Carnaval e Corpus Christi são
 * ponto facultativo na lei e mesmo assim o banco não liquida. Tratar um dia a
 * mais como não-útil só aumenta a antecedência do vencimento — erra para o
 * lado seguro da janela, e o teto de dias corridos é guardado em
 * `vencimento.ts`.
 *
 * Toda a aritmética acontece em **data civil de São Paulo**, com o instante
 * devolvido ao meio-dia UTC: é o horário que preserva a data civil em qualquer
 * offset do Brasil, a mesma disciplina de `somarDiasCivis` (`src/lib/trial.ts`).
 */

const TIMEZONE = "America/Sao_Paulo";

/** `01-01` … `12-31`. Feriados nacionais de data fixa. */
const FERIADOS_FIXOS = new Set([
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra (nacional desde a Lei 14.759/2023)
  // 24/12 e 31/12 NÃO são feriado civil — são fechamento bancário: o
  // expediente não abre e nada liquida. São exatamente os dois dias que o
  // docblock acima justifica incluir, e sem eles o cluster de fim de ano
  // entrega vencimento com 1 dia útil de antecedência (fechamento em
  // 22/12/2026 → 28/12, com só 23/12 de útil no meio). Medido: com os dois,
  // a maior antecedência em 3 anos é 9 dias corridos — o teto de 10 continua
  // folgado.
  "12-24", // Fechamento bancário (véspera de Natal)
  "12-25", // Natal
  "12-31", // Fechamento bancário (último dia útil do ano)
]);

/** Data civil de São Paulo, normalizada ao meio-dia UTC. */
function civilSp(data: Date): Date {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(data)
    .split("-");
  return new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
}

function somarDiasCivis(data: Date, dias: number): Date {
  const d = new Date(civilSp(data));
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Domingo de Páscoa do ano, algoritmo gregoriano anônimo (Meeus/Jones/Butcher).
 * Calculado em vez de tabelado porque tabela chumbada vence em silêncio — e o
 * modo de falhar seria justamente o bug sazonal que esta issue conserta.
 */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(
    `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T12:00:00Z`,
  );
}

const moveisPorAno = new Map<number, Set<string>>();

/** `MM-DD` dos feriados bancários móveis do ano. */
function feriadosMoveis(ano: number): Set<string> {
  const cache = moveisPorAno.get(ano);
  if (cache) return cache;
  const base = pascoa(ano);
  const chave = (deslocamento: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + deslocamento);
    return d.toISOString().slice(5, 10);
  };
  const conjunto = new Set([
    chave(-48), // Carnaval (segunda)
    chave(-47), // Carnaval (terça)
    chave(-2), // Sexta-Feira Santa
    chave(60), // Corpus Christi
  ]);
  moveisPorAno.set(ano, conjunto);
  return conjunto;
}

export function ehDiaUtilBancario(data: Date): boolean {
  const civil = civilSp(data);
  const semana = civil.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  const mmdd = civil.toISOString().slice(5, 10);
  if (FERIADOS_FIXOS.has(mmdd)) return false;
  return !feriadosMoveis(civil.getUTCFullYear()).has(mmdd);
}

export function proximoDiaUtilBancario(data: Date): Date {
  let candidato = civilSp(data);
  // Teto de segurança: nenhuma sequência de não-úteis no Brasil chega perto
  // disso. Estourar significa calendário corrompido, e travar é melhor que
  // laçar para sempre dentro do job de fechamento.
  for (let i = 0; i < 30; i += 1) {
    if (ehDiaUtilBancario(candidato)) return candidato;
    candidato = somarDiasCivis(candidato, 1);
  }
  throw new RangeError(
    `Nenhum dia útil bancário encontrado em 30 dias a partir de ${civilSp(data).toISOString().slice(0, 10)}`,
  );
}

/**
 * Dias úteis **estritamente entre** as duas datas civis — nem o início nem o
 * fim contam. É a leitura mais restritiva de "criada entre 2 e 10 dias úteis
 * antes do vencimento": exigir mais antecedência erra para o lado que o Asaas
 * aceita sob qualquer interpretação. Nunca negativo.
 */
export function diasUteisEntre(inicio: Date, fim: Date): number {
  const a = civilSp(inicio);
  const b = civilSp(fim);
  if (b <= a) return 0;
  let total = 0;
  let cursor = somarDiasCivis(a, 1);
  while (cursor < b) {
    if (ehDiaUtilBancario(cursor)) total += 1;
    cursor = somarDiasCivis(cursor, 1);
  }
  return total;
}

/** Dias corridos entre as duas datas civis. Nunca negativo. */
export function diasCorridosEntre(inicio: Date, fim: Date): number {
  const a = civilSp(inicio).getTime();
  const b = civilSp(fim).getTime();
  if (b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}
