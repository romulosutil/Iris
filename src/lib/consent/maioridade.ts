/**
 * Indicador PASSIVO de pendência de renovação por maioridade (#135).
 *
 * ⚠️ PASSIVO significa PASSIVO: nada neste módulo bloqueia atendimento, escrita
 * clínica ou qualquer outra operação. O termo adulto ratificado é explícito em
 * que a maioridade alcançada "não é impedimento de atendimento" — o que existe
 * é uma lista para a coordenação providenciar o novo termo. Quem chamar isto
 * para negar uma ação está usando errado.
 *
 * Funções puras, sem banco.
 */
import { ehMenorDeIdade } from "@/lib/risco/copy";

/**
 * Prazo de §4(b) do termo adulto (ratificado): 90 dias CORRIDOS a partir do
 * aniversário de 18 anos para colher o autoconsentimento do agora-titular.
 */
export const PRAZO_RENOVACAO_MAIORIDADE_DIAS = 90;

export type PendenciaMaioridade =
  /** O paciente não está sob regime de menor — não há o que renovar. */
  | "nao_se_aplica"
  /** Sem data de nascimento utilizável. NÃO é "ainda é menor". */
  | "desconhecido"
  /** Fez 18 anos há no máximo 90 dias. */
  | "dentro_do_prazo"
  /** Passou dos 90 dias sem termo de titular adulto. */
  | "vencido";

/**
 * Dias corridos completos entre duas datas de CALENDÁRIO. Normaliza pelos
 * componentes locais via `Date.UTC` para não sofrer com horário de verão: a
 * pergunta é "quantos dias no calendário", não "quantas horas".
 */
function diasEntre(de: Date, ate: Date): number {
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate());
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Classifica a pendência de renovação por maioridade.
 *
 * `regimeVigente` é o tipo do consentimento de regime em vigor (de
 * `regimeVigente()` em `./vigencia`), ou `null`. Só `tratamento_dados_menor`
 * produz pendência: curatela não vence com a idade, e quem já tem
 * autoconsentimento (adulto ou emancipado) não tem o que renovar.
 *
 * `nascimento` em ISO `YYYY-MM-DD`. Ausente ou ilegível → `"desconhecido"`,
 * NUNCA "ainda é menor": suprimir a pendência por falta de dado esconderia
 * exatamente o caso em que ninguém conferiu a idade do paciente.
 *
 * Reusa `ehMenorDeIdade` (`src/lib/risco/copy.ts`) como fonte única da
 * fronteira dos 18 anos — usar dois cálculos de idade no produto é como se
 * criam divergências de um dia. Ela não resolve o prazo (devolve só
 * booleano/`null`, sem a data do aniversário), então a contagem dos 90 dias é
 * feita aqui, sem alterá-la.
 */
export function classificarPendenciaMaioridade(
  nascimento: string | null | undefined,
  agora: Date,
  regimeVigente: string | null | undefined,
): PendenciaMaioridade {
  if (regimeVigente !== "tratamento_dados_menor") return "nao_se_aplica";

  const menor = ehMenorDeIdade(nascimento, agora);
  // `null` = sem nascimento cadastrado ou formato irreconhecível.
  if (menor === null) return "desconhecido";
  // Ainda menor: o consentimento do responsável continua sendo o correto.
  if (menor) return "nao_se_aplica";

  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento!);
  // Inalcançável (`ehMenorDeIdade` já devolveria `null`), mas sem o guard o TS
  // teria de confiar — e "desconhecido" é o fallback seguro de qualquer forma.
  if (!partes) return "desconhecido";

  // Aniversário de 18 anos. Nascido em 29/02 cai em 01/03 nos anos não
  // bissextos (comportamento nativo do `Date`): antecipa a pendência em um
  // dia, o que é conservador na direção certa.
  const aniversario18 = new Date(
    Number(partes[1]) + 18,
    Number(partes[2]) - 1,
    Number(partes[3]),
  );
  const dias = diasEntre(aniversario18, agora);
  return dias > PRAZO_RENOVACAO_MAIORIDADE_DIAS ? "vencido" : "dentro_do_prazo";
}
