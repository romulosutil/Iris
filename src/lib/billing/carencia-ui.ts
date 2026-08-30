/**
 * A frase do relógio de carência, isolada para ter mais de um consumidor
 * (#36, bloco B2).
 *
 * Estava privada em `recusa-ui.ts`, onde só a faixa global de recusa a
 * enxergava. O aviso de `past_due` da tela de assinatura precisa da MESMA
 * frase: duas cópias divergiriam no primeiro ajuste de copy, e a clínica veria
 * dois prazos diferentes para o mesmo corte, na mesma tela.
 *
 * **Puro e sem `server-only`**, pelo mesmo motivo de `recusa-ui.ts`: é
 * consumido por componente e por teste de componente. Importar um módulo
 * `server-only` de um client component derruba o `pnpm build` — e o `pnpm test`
 * não pega, porque no jsdom o `server-only` resolve normalmente.
 */

export interface EntradaPrazoCarencia {
  /** `subscription.status`. Só `past_due` faz o relógio existir. */
  statusAssinatura: string;
  pastDueDesde: Date | null;
  carenciaDias: number;
  /** IANA da clínica: o prazo é contado em dias CIVIS, não em 24h. */
  timezone: string;
  /** Injetável para teste. */
  agora?: Date;
}

function dataCivil(momento: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}

function paraBR(civil: string): string {
  const [ano, mes, dia] = civil.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Diferença em dias CIVIS no fuso da clínica. Comparar instantes daria "0 dias"
 * às 23h da véspera do corte — a mesma classe de erro de sinal que
 * `calendario-bancario.ts` existe para evitar.
 */
function diasCivisAte(prazo: Date, agora: Date, timezone: string): number {
  const meiaNoite = (civil: string) => new Date(`${civil}T00:00:00Z`).getTime();
  const dif =
    meiaNoite(dataCivil(prazo, timezone)) -
    meiaNoite(dataCivil(agora, timezone));
  return Math.round(dif / 86_400_000);
}

export function frasePrazoCarencia(
  entrada: EntradaPrazoCarencia,
): string | null {
  // Fora de `past_due` não há relógio: G3 corta por decisão do gateway, não por
  // carência, e assinatura ativa não tem prazo correndo contra ela.
  if (entrada.statusAssinatura !== "past_due") return null;
  if (!entrada.pastDueDesde) return null;

  const prazo = new Date(
    entrada.pastDueDesde.getTime() + entrada.carenciaDias * 86_400_000,
  );
  const agora = entrada.agora ?? new Date();
  const data = paraBR(dataCivil(prazo, entrada.timezone));
  const dias = diasCivisAte(prazo, agora, entrada.timezone);

  if (dias < 0) {
    return `O prazo para regularizar venceu em ${data}: sua assinatura será cancelada na próxima verificação de cobrança.`;
  }
  if (dias === 0) {
    return `Sua assinatura será cancelada hoje (${data}) se o pagamento não for concluído.`;
  }
  if (dias === 1) {
    return `Sua assinatura será cancelada em 1 dia (${data}) se o pagamento não for concluído.`;
  }
  return `Sua assinatura será cancelada em ${dias} dias (${data}) se o pagamento não for concluído.`;
}
