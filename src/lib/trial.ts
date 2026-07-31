/**
 * Calcula os dias restantes de um período de trial.
 *
 * A conta é feita sobre datas civis no timezone da clínica, não em milissegundos.
 * Isso evita que a fronteira de dia (meia-noite local) deslize para antes de
 * meia-noite UTC: se usássemos milissegundos brutos, um cliente em São Paulo
 * veria seu trial acabar um dia antes do esperado (porque a data civil dela
 * avançaria para o dia seguinte antes da data UTC do servidor fazer o mesmo).
 *
 * Exemplo: trial de 7 dias começando 2026-08-01 14:00 São Paulo:
 * - No mesmo dia (2026-08-01 qualquer hora): 7 dias restam
 * - Na véspera (2026-08-07 qualquer hora): 1 dia resta
 * - No vencimento (2026-08-08): 0 dias (último dia, deve exibir)
 * - Depois do vencimento (2026-08-09+): negativo (trial encerrado, não exibe)
 *
 * @param inicio - Data/hora de início do trial (momento do cadastro)
 * @param dias - Número total de dias de trial (ex: 7)
 * @param timezone - Timezone IANA da clínica (ex: "America/Sao_Paulo")
 * @param agora - Data/hora atual (padrão: agora). Injetada para testabilidade.
 * @returns Número de dias restantes (negativo quando trial já terminou)
 */
export function diasRestantesDeTrial(
  inicio: Date,
  dias: number,
  timezone: string,
  agora?: Date,
): number {
  const agora_ = agora || new Date();

  // Converte para data civil (YYYY-MM-DD) no timezone da clínica
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const inicioString = formatter.format(inicio);
  const agoraString = formatter.format(agora_);

  // Parse YYYY-MM-DD para Date (meia-noite do timezone local, mas em UTC)
  const [anoInicio, mesInicio, diaInicio] = inicioString.split("-");
  const [anoAgora, mesAgora, diaAgora] = agoraString.split("-");

  const dateInicio = new Date(`${anoInicio}-${mesInicio}-${diaInicio}T00:00:00Z`);
  const dateAgora = new Date(`${anoAgora}-${mesAgora}-${diaAgora}T00:00:00Z`);

  // Diferença em dias
  const diferenca = Math.floor((dateAgora.getTime() - dateInicio.getTime()) / (1000 * 60 * 60 * 24));

  // Dias restantes: retorna valores negativos quando o trial já terminou.
  // Isso permite distinguir entre "dia 0 (último dia)" e "já passou" no shell.
  // O render decide: `diasRestantes >= 0` → exibe; `< 0` → não exibe.
  return dias - diferenca;
}

/**
 * Resolve quantos dias faltam para exibir na faixa de trial a partir dos
 * dados brutos da clínica, ou `null` quando a faixa não deve aparecer
 * (clínica sem trial ativo).
 *
 * Finding 2 da review da PR #166: usar `&&` truthy em `trialDias` esconderia
 * a faixa quando o trial tem explicitamente 0 dias restantes (0 é falsy em
 * JS, mas é um valor válido — "termina hoje"). `!= null` cobre null/undefined
 * sem descartar 0.
 */
export function resolverDiasRestantesParaFaixa(dadosTrial: {
  trialComecoEm: Date | null;
  trialDias: number | null;
  timezone: string;
}): number | null {
  if (dadosTrial.trialComecoEm == null || dadosTrial.trialDias == null) {
    return null;
  }
  return diasRestantesDeTrial(
    dadosTrial.trialComecoEm,
    dadosTrial.trialDias,
    dadosTrial.timezone,
  );
}
