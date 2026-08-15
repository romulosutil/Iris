/**
 * Vencimento da cobrança do ciclo, dentro da janela que o Pix Automático
 * exige (#317).
 *
 * **A janela não pôde ser medida.** A doc do Asaas se contradiz: a página de
 * Implementação diz "entre 2 e 10 dias **úteis** antes do vencimento", os
 * Motivos de Recusa dizem "menos de 2 dias" / "superior a 10 dias" sem
 * qualificar a unidade, e o guia BACEN fala em dias corridos. A sessão de
 * medição no sandbox (#321, 15/08/2026) NÃO resolveu: nenhuma autorização de
 * Pix Automático chega a `ACTIVE` no sandbox, então todo `POST /payments` com
 * `pixAutomaticAuthorizationId` devolve o mesmo 400 de autorização inativa —
 * inclusive um controle DENTRO da janela. A resposta não carrega informação
 * nenhuma sobre janela. Só o ensaio com clínica de teste em produção decide.
 *
 * Enquanto isso, a regra satisfaz o **mais restritivo** das duas leituras:
 * piso em dias ÚTEIS, teto em dias CORRIDOS. Sob qualquer interpretação da
 * doc, a data resultante está dentro. O que se paga por isso é uma
 * antecedência um pouco maior em semanas com feriado.
 *
 * O que havia antes era `somarDias(agora, 5)` em dias corridos: passa o ano
 * inteiro verde e falha em janeiro, no Carnaval e no fim de semana prolongado
 * — bug sazonal, invisível em teste que usa a data de hoje.
 */

import {
  diasCorridosEntre,
  diasUteisEntre,
  proximoDiaUtilBancario,
} from "./calendario-bancario";

/** Piso, em dias úteis bancários. Leitura restritiva da doc de Implementação. */
export const ANTECEDENCIA_MINIMA_DIAS_UTEIS = 2;

/**
 * Teto, em dias CORRIDOS. 10 corridos é sempre ≤ 10 úteis, então respeita as
 * duas leituras de uma vez.
 */
export const ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS = 10;

/** Antecedência desejada quando o calendário não atrapalha. Era o valor único. */
export const ANTECEDENCIA_PADRAO_DIAS_CORRIDOS = 5;

/**
 * Guarda o teto de dias CORRIDOS da janela. Exportada e não embutida em
 * `vencimentoCobrancaDeCiclo` porque nenhum fechamento real do calendário
 * brasileiro a faz lançar (a maior antecedência medida em 3 anos é 9): dentro
 * da função, o ramo do `throw` seria código sem cobertura nenhuma, vivo só na
 * leitura. Como função pura dá para alimentá-la com um candidato fora da
 * janela e provar que ela morde.
 */
export function verificarTetoDaJanela(base: Date, candidato: Date): void {
  const corridos = diasCorridosEntre(base, candidato);
  if (corridos > ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS) {
    // Estado impossível no calendário brasileiro (a maior sequência de
    // não-úteis é o Carnaval). Se acontecer, o gateway recusaria com
    // `RECEIVED_TOO_EARLY` e o ciclo iria a `falhou` sem ninguém entender —
    // falhar aqui, nomeando a causa, é mais barato. Degradar em silêncio já
    // custou caro neste repo (#157).
    throw new RangeError(
      `Vencimento calculado a ${corridos} dias corridos da emissão excede o teto de ${ANTECEDENCIA_MAXIMA_DIAS_CORRIDOS} da janela do Pix Automático`,
    );
  }
}

export function vencimentoCobrancaDeCiclo(base: Date): Date {
  let candidato = proximoDiaUtilBancario(
    somarCorridos(base, ANTECEDENCIA_PADRAO_DIAS_CORRIDOS),
  );

  while (diasUteisEntre(base, candidato) < ANTECEDENCIA_MINIMA_DIAS_UTEIS) {
    candidato = proximoDiaUtilBancario(somarCorridos(candidato, 1));
  }

  verificarTetoDaJanela(base, candidato);
  return candidato;
}

function somarCorridos(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}
