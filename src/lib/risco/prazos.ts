/**
 * Prazos de notificação e escalonamento interno do software — espelho em TS da
 * §4.1 de `docs/agente/regra-alerta-risco.md`.
 *
 * ⚠️ FONTE DE VERDADE: a função SQL `app_prazo_risco_minutos`
 * (migração `db/migrations/0049_alerta_risco_clinico.sql`). Este módulo NÃO é
 * autoritativo — existe para EXIBIÇÃO na UI e para os testes unitários. Se os
 * dois divergirem, o servidor vence; corrija este arquivo, nunca o contrário.
 *
 * ⚠️ NOMENCLATURA TRAVADA PELO PARECER JURÍDICO (pergunta 3): estes prazos
 * regem apenas o envio de alertas dentro do sistema Iris para os gestores da
 * clínica. Nunca chamá-los de prazo de atendimento nem associá-los a
 * atendimento de urgência — não existe prazo legal brasileiro para resposta
 * clínica a crise, e prometer resposta humana é promessa que o produto não
 * pode cumprir. A denominação correta, em identificadores, comentários, copy e
 * contrato, é "prazos de notificação e escalonamento interno do software".
 */

export type SeveridadeRisco =
  | "ideacao_passiva"
  | "ideacao_ativa_sem_plano"
  | "ideacao_ativa_com_plano"
  | "autolesao_recente"
  | "tentativa_relatada"
  | "violencia_sofrida"
  | "violencia_praticada"
  | "risco_a_terceiro";

export type CertezaRisco = "explicito" | "ambiguo_citado";

export type CategoriaRisco =
  | "ideacao_suicida"
  | "autolesao"
  | "violencia_sofrida"
  | "violencia_praticada"
  | "risco_a_terceiro";

export type StatusRisco =
  | "aberto"
  | "reconhecido"
  | "escalado_estagio_1"
  | "escalado_estagio_2"
  | "resolvido"
  | "descartado";

/** Severidades com prazo de 15 minutos para reconhecimento. */
const PRAZO_15: readonly SeveridadeRisco[] = ["ideacao_ativa_com_plano", "tentativa_relatada"];

/** Severidades com prazo de 1 hora para reconhecimento. */
const PRAZO_60: readonly SeveridadeRisco[] = ["ideacao_ativa_sem_plano", "autolesao_recente"];

/**
 * Prazo, em minutos, para reconhecimento humano do alerta (§4.1).
 *
 * O parâmetro `certeza` existe DE PROPÓSITO e é deliberadamente ignorado no
 * cálculo: `certeza: "ambiguo_citado"` NÃO relaxa o prazo (§4.1, última linha
 * da tabela). A ambiguidade só afeta a apresentação do alerta (§2), nunca o
 * tempo. Manter o parâmetro na assinatura torna a regra explícita no ponto de
 * chamada, em vez de deixá-la implícita por omissão.
 */
export function prazoMinutos(severidade: SeveridadeRisco, certeza: CertezaRisco): number {
  void certeza; // intencional: a ambiguidade não relaxa o prazo.
  if (PRAZO_15.includes(severidade)) return 15;
  if (PRAZO_60.includes(severidade)) return 60;
  return 240;
}

/** Rótulo legível do prazo, para exibição ao lado do temporizador. */
export function rotuloPrazo(minutos: number): string {
  if (minutos === 15) return "15 minutos";
  if (minutos === 60) return "1 hora";
  if (minutos === 240) return "4 horas";
  if (minutos < 60) return `${minutos} minutos`;
  const horas = minutos / 60;
  const texto = Number.isInteger(horas) ? String(horas) : horas.toFixed(1).replace(".", ",");
  return `${texto} ${horas === 1 ? "hora" : "horas"}`;
}

/**
 * Declaração obrigatória na UI, ao lado de QUALQUER temporizador de prazo
 * (§4.1). Texto literal — não reescrever, não resumir.
 */
export const DECLARACAO_PRAZOS =
  "Estes prazos regem apenas o envio de alertas dentro do sistema Iris para os gestores da clínica. O Iris não realiza atendimento e não garante a presença de profissionais logados.";

/** Milissegundos restantes até o prazo de reconhecimento (negativo se vencido). */
export function prazoRestanteMs(prazoReconhecimento: Date, agora: Date): number {
  return prazoReconhecimento.getTime() - agora.getTime();
}

/** Verdadeiro quando o prazo de reconhecimento já passou. */
export function vencido(prazoReconhecimento: Date, agora: Date): boolean {
  return prazoRestanteMs(prazoReconhecimento, agora) <= 0;
}

/**
 * Prazo do estágio 2 do escalonamento interno (§4.2): o dobro do prazo
 * original contado da criação — ou seja, o prazo original acrescido de mais um
 * intervalo igual.
 */
export function prazoEstagio2(prazoReconhecimento: Date, prazoEmMinutos: number): Date {
  return new Date(prazoReconhecimento.getTime() + prazoEmMinutos * 60_000);
}
