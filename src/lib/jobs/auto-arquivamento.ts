/**
 * #174 — regra 5: auto-arquivamento COMERCIAL por inatividade.
 *
 * 90 dias sem nenhum registro clínico → o paciente sai da contagem de ativos
 * da fatura (`arquivado_em = now()`). No 83º dia sai um aviso prévio, dando 7
 * dias para a clínica reagir antes de o status mudar sozinho.
 *
 * O aviso é IN-APP e só isso: uma linha em `audit_log`
 * (`acao = 'arquivamento_aviso_previo'`) que a faixa da clínica lê. Nada de
 * e-mail/SMS — arquivamento é ato administrativo sobre cobrança, não evento
 * clínico, e o Iris não fala com o mundo externo sobre paciente.
 *
 * Este módulo é a REGRA PURA (sem banco, sem rede) de propósito: a decisão de
 * arquivar tira dinheiro da fatura da clínica, então precisa ser testável em
 * cima de datas injetadas, e não do relógio de quem rodar a varredura.
 */

/** Janela de aviso prévio: a partir daqui a faixa avisa que vai arquivar. */
const DIAS_AVISO_PREVIO = 83;

/** Corte do arquivamento automático. */
const DIAS_ARQUIVAMENTO = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Diferença em DIAS CIVIS entre dois instantes, truncando cada um para a sua
 * data (YYYY-MM-DD) antes de subtrair.
 *
 * Mesma disciplina de `diasRestantesDeTrial` (`src/lib/trial.ts`), pelo mesmo
 * motivo: aritmética crua de milissegundos faz o resultado depender da HORA
 * do dia, e aí um paciente parado desde as 13:00 só entra na janela de aviso
 * às 13:00 do 83º dia — a varredura da manhã veria 82 e pularia o aviso.
 *
 * A diferença deliberada em relação ao trial: aqui a conta é em UTC, não no
 * timezone da clínica. A assinatura pedida pela issue não recebe timezone, e
 * não deve receber — o trial tem uma DATA DE VENCIMENTO que o cliente lê na
 * tela e cobra ("meu teste acaba dia 8"), então a fronteira precisa bater com
 * o calendário dele. Aqui não existe data prometida a ninguém: são dois
 * limiares internos de higiene de cobrança com 7 dias de folga entre eles.
 * Um deslize de ±1 dia por fuso é irrelevante nessa folga, e amarrar a conta
 * a um timezone por clínica só criaria a ilusão de precisão numa varredura
 * que roda uma vez por dia de qualquer jeito.
 */
function diasCivisEntre(inicio: Date, fim: Date): number {
  const soData = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((soData(fim) - soData(inicio)) / MS_POR_DIA);
}

export function calcularStatusArquivamento(
  ultimaAtividade: Date,
  agora?: Date,
): {
  diasSemAtividade: number;
  deveNotificarAviso: boolean;
  deveArquivar: boolean;
} {
  const diasSemAtividade = diasCivisEntre(ultimaAtividade, agora ?? new Date());

  // A janela do aviso é FECHADA em cima (`< DIAS_ARQUIVAMENTO`): passado o
  // corte, quem age é o arquivamento. Sem esse limite superior o job avisaria
  // de novo a cada varredura de um paciente parado há meses, poluindo a faixa
  // da clínica e a trilha append-only com duplicata que ninguém pode apagar.
  const deveNotificarAviso =
    diasSemAtividade >= DIAS_AVISO_PREVIO && diasSemAtividade < DIAS_ARQUIVAMENTO;

  const deveArquivar = diasSemAtividade >= DIAS_ARQUIVAMENTO;

  return { diasSemAtividade, deveNotificarAviso, deveArquivar };
}

/** Exportados para o script de varredura e para a UI descreverem a régua. */
export const REGUA_ARQUIVAMENTO = {
  diasAvisoPrevio: DIAS_AVISO_PREVIO,
  diasArquivamento: DIAS_ARQUIVAMENTO,
} as const;

/** `acao` das linhas de `audit_log` que esta régua produz (coluna é `text`). */
export const ACAO_AVISO_PREVIO = "arquivamento_aviso_previo";
export const ACAO_ARQUIVADO_AUTOMATICAMENTE = "paciente_arquivado_automaticamente";
export const ACAO_DESARQUIVADO_AUTOMATICAMENTE =
  "paciente_desarquivado_automaticamente";
