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

  const dateInicio = new Date(
    `${anoInicio}-${mesInicio}-${diaInicio}T00:00:00Z`,
  );
  const dateAgora = new Date(`${anoAgora}-${mesAgora}-${diaAgora}T00:00:00Z`);

  // Diferença em dias
  const diferenca = Math.floor(
    (dateAgora.getTime() - dateInicio.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Dias restantes: retorna valores negativos quando o trial já terminou.
  // Isso permite distinguir entre "dia 0 (último dia)" e "já passou" no shell.
  // O render decide: `diasRestantes >= 0` → exibe; `< 0` → não exibe.
  return dias - diferenca;
}

/**
 * Teto entre o cadastro da clínica e o disparo automático do relógio (#175).
 *
 * O trial começa no 1º paciente cadastrado — mas quem nunca cadastra paciente
 * nenhum não pode ficar com trial eterno. Passado o teto, o relógio conta como
 * se tivesse começado no 14º dia após o cadastro.
 */
const DIAS_ATE_INICIO_AUTOMATICO = 14;

export interface StatusTrial {
  ativo: boolean;
  expirado: boolean;
  /** Nunca negativo (clamp em 0). Use `expirado` para saber se já acabou. */
  diasRestantes: number;
  dataInicio: Date;
  dataFim: Date;
  aguardandoPrimeiroPaciente: boolean;
}

/**
 * Soma dias mantendo a disciplina de data civil do `diasRestantesDeTrial`:
 * pega a data civil de `base` no timezone da clínica, soma os dias nessa
 * escala e devolve um instante ao meio-dia UTC do dia resultante.
 *
 * Somar `dias * 86_400_000` ao instante bruto derraparia um dia inteiro quando
 * o horário do cadastro é próximo da meia-noite local e há mudança de offset
 * (DST) no intervalo — o mesmo deslize que a doc no topo deste arquivo
 * descreve. Meio-dia UTC é escolhido por ser o horário que preserva a data
 * civil em qualquer offset entre -12 e +12, o que cobre todo o Brasil.
 */
function somarDiasCivis(base: Date, dias: number, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [ano, mes, dia] = formatter.format(base).split("-");
  const civil = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
  civil.setUTCDate(civil.getUTCDate() + dias);
  return civil;
}

/**
 * Estado completo do trial de uma clínica (#175).
 *
 * O relógio **não** começa no cadastro: começa quando o 1º paciente é
 * cadastrado (`trial_comeco_em` é gravado na mesma transação, via
 * `app_iniciar_trial()`). Enquanto isso não acontece, `trialComecoEm` é `NULL`
 * e a clínica está *aguardando* — não faz sentido consumir dias de teste de
 * quem ainda não tem o que testar.
 *
 * O teto de 14 dias existe para que "nunca cadastrei paciente" não vire trial
 * eterno: passado ele, o início efetivo é o próprio teto.
 *
 * `agora` é injetável para testabilidade (nenhum caller de produção passa).
 */
export function calcularStatusTrial(
  criadoEm: Date,
  trialComecoEm: Date | null,
  trialDias: number,
  timezone: string,
  agora?: Date,
): StatusTrial {
  const agora_ = agora ?? new Date();

  const dentroDoTeto =
    trialComecoEm == null &&
    diasRestantesDeTrial(
      criadoEm,
      DIAS_ATE_INICIO_AUTOMATICO,
      timezone,
      agora_,
    ) >= 0;

  if (dentroDoTeto) {
    // Relógio parado: o trial inteiro continua disponível. `dataFim` é a data
    // em que o relógio dispara sozinho, não uma data de vencimento — por isso
    // a UI deste estado não exibe contagem (ver FaixaTrial).
    const dataFim = somarDiasCivis(
      criadoEm,
      DIAS_ATE_INICIO_AUTOMATICO,
      timezone,
    );
    return {
      ativo: true,
      expirado: false,
      diasRestantes: trialDias,
      dataInicio: criadoEm,
      dataFim,
      aguardandoPrimeiroPaciente: true,
    };
  }

  const dataInicio =
    trialComecoEm ??
    somarDiasCivis(criadoEm, DIAS_ATE_INICIO_AUTOMATICO, timezone);
  const restantes = diasRestantesDeTrial(
    dataInicio,
    trialDias,
    timezone,
    agora_,
  );
  // `expirado` sai do valor BRUTO: `diasRestantes === 0` é o último dia (ainda
  // ativo), e só o negativo significa acabou. Derivar depois do clamp
  // confundiria os dois.
  const expirado = restantes < 0;

  return {
    ativo: !expirado,
    expirado,
    diasRestantes: Math.max(0, restantes),
    dataInicio,
    dataFim: somarDiasCivis(dataInicio, trialDias, timezone),
    aguardandoPrimeiroPaciente: false,
  };
}

/** Dados brutos de trial da clínica, como vêm de `clinic`. */
export interface DadosTrialClinica {
  criadoEm: Date;
  trialComecoEm: Date | null;
  trialDias: number | null;
  isentoTrial: boolean;
  timezone: string;
}

export interface FaixaTrialResolvida {
  /**
   * Valor BRUTO (pode ser negativo = trial encerrado). Não é o
   * `StatusTrial.diasRestantes` clampado: a faixa precisa do negativo para
   * renderizar o estado "encerrado".
   */
  diasRestantes: number;
  aguardandoPrimeiroPaciente: boolean;
}

/**
 * Resolve o que a faixa de trial deve mostrar, ou `null` quando ela não deve
 * aparecer.
 *
 * Não aparece em dois casos: clínica **isenta** (legado pré-self-service, que
 * nunca contratou trial) e clínica sem `trial_dias` configurado. `trialComecoEm
 * == null` **não** esconde mais a faixa — agora significa "aguardando o 1º
 * paciente", que é justamente o que a faixa precisa explicar (#175).
 *
 * O paliativo `CORTE_TRIAL_REAL` (commit ad789a6) saiu daqui: ele adivinhava o
 * legado pela data do sentinela `'2020-01-01'` da migração 0057. O sentinela
 * não existe mais — virou `NULL` + `isento_trial = true`, um fato do banco em
 * vez de uma heurística de data.
 *
 * Finding 2 da review da PR #166: `!= null` em vez de `&&` truthy porque
 * `trialDias = 0` é valor válido ("termina hoje") e falsy em JS.
 *
 * ⚠️ **Limite conhecido, com prazo:** isto ainda não distingue "trial vencido"
 * de "assinante pagante" — só existe o relógio, não existe estado de
 * assinatura. Hoje é inofensivo porque não há como pagar: o gate e a tabela
 * `subscription` chegam na Fatia B (#159). Quando a `subscription` existir, é
 * ela quem decide se a faixa aparece.
 */
export function resolverFaixaTrial(
  dadosTrial: DadosTrialClinica,
  agora?: Date,
): FaixaTrialResolvida | null {
  if (dadosTrial.isentoTrial || dadosTrial.trialDias == null) {
    return null;
  }

  const status = calcularStatusTrial(
    dadosTrial.criadoEm,
    dadosTrial.trialComecoEm,
    dadosTrial.trialDias,
    dadosTrial.timezone,
    agora,
  );

  if (status.aguardandoPrimeiroPaciente) {
    return {
      diasRestantes: dadosTrial.trialDias,
      aguardandoPrimeiroPaciente: true,
    };
  }

  return {
    diasRestantes: diasRestantesDeTrial(
      status.dataInicio,
      dadosTrial.trialDias,
      dadosTrial.timezone,
      agora,
    ),
    aguardandoPrimeiroPaciente: false,
  };
}
