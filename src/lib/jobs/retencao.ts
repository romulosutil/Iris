/**
 * #352 — régua canônica de RETENÇÃO de prontuário.
 *
 * O prazo de guarda vence em `MAX(nascimento + 18 anos, alta_em + GREATEST(10
 * anos, politica_retencao_meses))`. A fórmula em si mora no banco
 * (`app_retencao_vence_em`, `0128`) porque três consumidores precisam dela
 * dentro da mesma consulta — o predicado por UUID, a fila da tela e a varredura
 * do job. O que mora AQUI é a régua do AVISO PRÉVIO: quantos dias antes do
 * vencimento a clínica é avisada, e a aritmética de dias que a tela usa para
 * dizer "vence em N dias".
 *
 * Este módulo é a REGRA PURA (sem banco, sem rede) de propósito, no mesmo
 * molde de `auto-arquivamento.ts`: a decisão de avisar antecede a eliminação
 * definitiva de um prontuário, então precisa ser testável em cima de datas
 * injetadas, e não do relógio de quem rodar a varredura.
 *
 * ⚠️ **Diferença deliberada em relação ao auto-arquivamento:** lá a conta é em
 * UTC, e o comentário daquele arquivo justifica dizendo que "aqui não existe
 * data prometida a ninguém". No expurgo EXISTE: a clínica lê o vencimento na
 * tela, recebe um aviso de 90 dias e organiza a guarda física em cima dele.
 * Um deslize de ±1 dia por fuso é uma data errada num documento de retenção
 * legal. Por isso a conta é em DATA CIVIL no fuso da clínica, seguindo a
 * disciplina de `src/lib/trial.ts` — e é a mesma conta que o SQL faz com
 * `(p_referencia AT TIME ZONE c.timezone)::date`.
 */

/**
 * Janela do aviso prévio, em dias.
 *
 * R352.D7 — este número é teto de POLÍTICA, não parâmetro de deploy. A função
 * SQL recebe `p_aviso_dias` só para o teste comprimir a janela; o job passa 90
 * fixo, lido daqui. `scripts/retencao-aviso-previo.test.mjs` compara esta
 * constante com a cópia do `.mjs` e falha se uma mudar sozinha (R352.E8) —
 * quem impede a divergência é o teste, não a boa intenção.
 */
const DIAS_AVISO_PREVIO = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD`, o formato em que `patient.alta_em` e o vencimento trafegam. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Data civil (`YYYY-MM-DD`) de um instante no fuso informado.
 *
 * `en-CA` porque é a locale cujo formato numérico curto já É ISO — evita
 * remontar a string a partir de `formatToParts`.
 */
export function dataCivilNoFuso(instante: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Diferença em dias entre duas datas civis já resolvidas (`YYYY-MM-DD`).
 *
 * Ambas viram meia-noite UTC antes de subtrair: como as duas sofrem a mesma
 * conversão, o fuso some da conta e o resultado é um número inteiro de dias de
 * calendário — nunca 89,96 arredondado para baixo por causa de horário de
 * verão no intervalo.
 */
export function diasCivisEntreDatas(inicioISO: string, fimISO: string): number {
  if (!DATA_ISO.test(inicioISO) || !DATA_ISO.test(fimISO)) {
    throw new TypeError(
      `Data civil esperada no formato YYYY-MM-DD (recebido: "${inicioISO}" → "${fimISO}").`,
    );
  }
  const inicio = Date.parse(`${inicioISO}T00:00:00Z`);
  const fim = Date.parse(`${fimISO}T00:00:00Z`);
  return Math.round((fim - inicio) / MS_POR_DIA);
}

/**
 * Quantos dias civis faltam até o vencimento da guarda, no fuso da clínica.
 *
 * Positivo = ainda dentro do prazo; `0` = vence hoje; negativo = já venceu (e
 * quem age nesse caso é a fila de expurgo, não o aviso).
 */
export function diasAteVencimento(
  venceEm: string,
  agora: Date,
  timezone: string,
): number {
  return diasCivisEntreDatas(dataCivilNoFuso(agora, timezone), venceEm);
}

/**
 * Espelho EXATO da janela de `app_retencao_avisar` (`0128:384-387`):
 *
 * ```sql
 * vence_em >  hoje  AND  vence_em <= hoje + p_aviso_dias
 * ```
 *
 * A janela é FECHADA EM CIMA (`> 0`, não `>= 0`) — passado o vencimento quem
 * age é a fila. Sem esse limite superior o job reavisaria a cada varredura de
 * um paciente vencido há meses, poluindo a trilha append-only com duplicata
 * que ninguém pode apagar.
 *
 * Esta função NÃO é o que decide o aviso em produção: quem decide é o SQL, numa
 * instrução só, onde o `INSERT` é o próprio dedup (R352.D4). Ela existe para a
 * tela e para o teste raciocinarem sobre a mesma régua sem replicá-la à mão.
 */
export function dentroDaJanelaDeAviso(
  venceEm: string,
  agora: Date,
  timezone: string,
  diasAviso: number = DIAS_AVISO_PREVIO,
): boolean {
  const dias = diasAteVencimento(venceEm, agora, timezone);
  return dias > 0 && dias <= diasAviso;
}

/** Exportada para o script de varredura e para a UI descreverem a régua. */
export const REGUA_RETENCAO = {
  diasAvisoPrevio: DIAS_AVISO_PREVIO,
} as const;

/** `acao` da linha de `audit_log` que esta régua produz (coluna é `text`). */
export const ACAO_AVISO_PREVIO_EXPURGO = "expurgo_aviso_previo";

/** `acao` do expurgo consumado — a mesma string nas duas vias (R352.B3). */
export const ACAO_PACIENTE_PURGADO = "paciente_purgado";
