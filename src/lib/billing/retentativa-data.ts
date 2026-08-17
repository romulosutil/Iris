import {
  civilSp,
  diasCorridosEntre,
  somarDiasCivis,
} from "./calendario-bancario";

/**
 * Cálculo da `dueDate` de uma retentativa extradia do Pix Automático (#322,
 * decisão D-3).
 *
 * Mora fora de `subscription.ts` — e sem `server-only` — de propósito: é a
 * única parte da varredura que é FUNÇÃO PURA, e é a parte cujo erro sai caro
 * (uma data fora da janela vira 400 do gateway com uma das 3 tentativas já
 * reservada). Isolada, ela ganha um teste unitário por restrição; embutida no
 * laço da varredura, só seria alcançável por integração com Postgres no ar.
 *
 * ## As quatro restrições, na ordem da D-3
 *
 * 1. **Candidata mínima = `hoje + 1 dia`.** Consequência direta da validação 3
 *    do Asaas ("o agendamento deve ser enviado até as 23h59 do dia anterior à
 *    data desejada"): uma varredura que só comanda para amanhã satisfaz essa
 *    validação **por construção**, a qualquer hora em que o job rode.
 * 2. **Nunca repetir data já comandada** (validação 1 exige datas diferentes
 *    entre as retentativas da mesma cobrança): candidata igual à
 *    `ultima_retentativa_vencimento` anda +1 dia.
 * 3. **Teto A = `vencimento_cobranca + 7 dias corridos`** (validação 2), medido
 *    com `diasCorridosEntre` — a mesma régua de dias corridos do resto da
 *    janela, e não uma subtração de milissegundos que ignora fuso.
 * 4. **Teto B = estritamente ANTES do início do próximo ciclo** (validação 4:
 *    "não pode coincidir ou ultrapassar o dia de início do próximo ciclo").
 *
 * Estourou qualquer teto ⇒ devolve `null`, e a varredura NÃO chama o gateway.
 * Fail-closed: não existe "chuta uma data" — chutar gastaria uma das 3
 * tentativas para receber um 400 previsível.
 *
 * ## ⚠️ Não empurrar para dia útil bancário — e isto é DEDUÇÃO, não medição
 *
 * `vencimentoCobrancaDeCiclo` empurra o vencimento do ciclo até um dia útil
 * bancário; aqui não se empurra nada. A razão: a medição da #321 mostrou
 * `dueDate` em sábado, domingo e feriado **aceita no `POST /payments`** (trilho
 * avulso), e empurrar consumiria janela que já é menor que 7 dias por causa da
 * liquidação.
 *
 * Estender essa medição do trilho avulso para
 * `POST /pix/automatic/paymentInstructions/{id}/retries` é **dedução, não
 * medição** — o endpoint de retentativa nunca foi exercitado contra o sandbox,
 * porque nenhuma autorização de Pix Automático chega a `ACTIVE` lá (#321).
 * Se o ensaio em produção mostrar recusa de fim de semana, o conserto é aqui, e
 * o sintoma será um 400 com mensagem que não casa com nenhuma das cinco
 * validações conhecidas (`desconhecido` em `MotivoRecusaDeRetentativa`).
 */

/**
 * Janela da validação 2 do Asaas: 7 dias **corridos** após o vencimento
 * original. Escrito aqui, e não importado do backstop (`DIAS_ATE_BACKSTOP`),
 * porque são fatos diferentes que hoje coincidem: um é o limite do gateway
 * para retentar, o outro é o prazo a partir do qual o Iris conclui que a janela
 * se esgotou. Amarrá-los faria uma mudança num mover o outro em silêncio.
 */
export const JANELA_RETENTATIVA_DIAS_CORRIDOS = 7;

export interface EntradaDueDateRetentativa {
  /** Instante da passada. O dia civil de São Paulo dele é o `hoje` da D-3. */
  agora: Date;
  /**
   * `billing_cycle.vencimento_cobranca` — o vencimento que MANDAMOS ao gateway.
   * É a origem do teto A, e por isso vem da coluna persistida, nunca de um
   * recálculo (ver o docblock da coluna em `schema.ts`).
   */
  vencimentoCobranca: Date;
  /**
   * Início do PRÓXIMO ciclo da recorrência (teto B), ou `null` quando a
   * assinatura não tem ciclo em curso — aí o teto B simplesmente não se aplica.
   */
  proximoCicloInicio: Date | null;
  /** `billing_cycle.ultima_retentativa_vencimento` (`YYYY-MM-DD`) ou `null`. */
  ultimaRetentativaVencimento: string | null;
}

/** Dia civil no formato do wire do Asaas (`YYYY-MM-DD`). */
function comoDiaCivil(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * A `dueDate` a comandar, ou `null` quando nenhuma data satisfaz as quatro
 * restrições (o caso `sem_data_possivel` da varredura).
 */
export function calcularDueDateDeRetentativa(
  entrada: EntradaDueDateRetentativa,
): string | null {
  // Passo 1 — candidata mínima: amanhã, em dia civil de São Paulo.
  let candidata = somarDiasCivis(entrada.agora, 1);

  // Passo 2 — a validação 1 exige datas DIFERENTES. Sem isto a segunda passada
  // repetiria a data da primeira e levaria 400 com a tentativa já reservada.
  if (comoDiaCivil(candidata) === entrada.ultimaRetentativaVencimento) {
    candidata = somarDiasCivis(candidata, 1);
  }

  // Passo 3 — teto A. `diasCorridosEntre` devolve 0 quando a candidata é
  // anterior ao vencimento, então uma retentativa DENTRO do prazo original
  // passa aqui sem tratamento especial.
  if (
    diasCorridosEntre(entrada.vencimentoCobranca, candidata) >
    JANELA_RETENTATIVA_DIAS_CORRIDOS
  ) {
    return null;
  }

  // Passo 4 — teto B, ESTRITAMENTE antes: a mensagem do Asaas diz "não pode
  // coincidir ou ultrapassar", então o dia de início do próximo ciclo já está
  // fora.
  //
  // O limite chega como INSTANTE (`subscription.ciclo_atual_fim`) e é
  // convertido para dia civil de São Paulo antes de comparar: meia-noite UTC é
  // 21h do dia anterior no Brasil, e comparar instantes crus faria a candidata
  // de um dia inteiro entrar ou sair conforme o fuso do carimbo.
  if (
    entrada.proximoCicloInicio &&
    candidata.getTime() >= civilSp(entrada.proximoCicloInicio).getTime()
  ) {
    return null;
  }

  return comoDiaCivil(candidata);
}
