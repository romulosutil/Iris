import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * SourceAttributionBadge — procedência de um trecho recuperado pelo RAG
 * (#260 / D11, T5).
 *
 * ## Por que este componente existe
 *
 * O guardrail 4 da #260: "todo trecho recuperado pelo RAG e utilizado em
 * sugestões clínicas deve manter a referência direta ao `session_note_id` e
 * timestamp original da sessão". Um trecho de prontuário exibido sem dizer
 * DE QUAL SESSÃO veio é indistinguível de texto gerado — e o princípio de
 * honestidade epistêmica do produto (`AGENTS.md` §2) proíbe exatamente isso.
 *
 * ## Decisões de forma, e o porquê de cada uma
 *
 * - **Paleta de IA (violeta `--status-ia-*`), não a de "aprovado" (verde).** O
 *   trecho é MATERIAL RECUPERADO, não dado validado por humano. Vestir de verde
 *   seria mentir sobre o estado epistêmico. Mesma família de token que `Chip`
 *   variante `ai` e `EvidenceTimeline` usam para sugestão.
 * - **Data legível ao lado de `<time dateTime>`.** A data por extenso é para o
 *   terapeuta; o `dateTime` em ISO é para leitor de tela e para qualquer
 *   ferramenta que raspe a página. Uma coisa não substitui a outra.
 * - **`session_note_id` NÃO é exibido cru.** O UUID inteiro não diz nada a um
 *   humano e polui a linha; o que ele faz é ser rastreável. Fica no atributo
 *   `data-session-note-id` (e em `title`, num prefixo curto), que é o que uma
 *   auditoria ou um suporte precisam. Se um dia a UI ganhar link para a nota,
 *   é este atributo que vira `href`.
 * - **Sem `aria-label` substituindo o texto.** O conteúdo visível já é o texto
 *   acessível; um label paralelo criaria duas verdades que divergem na próxima
 *   edição de copy.
 */

/** Formata a data no padrão pt-BR curto: "10/03/2026". */
function formatarData(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(quando);
}

export interface SourceAttributionBadgeProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "children"
> {
  /** `session_note_id` da nota de onde o trecho foi recuperado. */
  sessionNoteId: string;
  /**
   * Timestamp ORIGINAL da sessão (`patient_record_embeddings.sessao_em`), não o
   * momento da recuperação. É a data que o terapeuta reconhece.
   */
  sessaoEm: Date | string;
  /**
   * Número sequencial da sessão, quando conhecido ("sessão 45"). Opcional: nem
   * toda nota tem `numero_sequencial_paciente` populado, e inventar um número
   * seria pior que omiti-lo.
   */
  numeroSessao?: number | null;
  /** Rótulo antes da procedência. Padrão: "Recuperado de". */
  rotulo?: string;
}

export const SourceAttributionBadge = React.forwardRef<
  HTMLElement,
  SourceAttributionBadgeProps
>(function SourceAttributionBadge(
  {
    className,
    sessionNoteId,
    sessaoEm,
    numeroSessao,
    rotulo = "Recuperado de",
    ...props
  },
  ref,
) {
  const quando = sessaoEm instanceof Date ? sessaoEm : new Date(sessaoEm);
  const iso = Number.isNaN(quando.getTime()) ? undefined : quando.toISOString();
  const legivel = iso ? formatarData(quando) : "data indisponível";

  return (
    <span
      ref={ref}
      data-session-note-id={sessionNoteId}
      title={`Nota de sessão ${sessionNoteId.slice(0, 8)}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border-2 border-dashed",
        "border-[var(--status-ia-border)] bg-[var(--status-ia-bg)]",
        "px-2 py-0.5 font-mono text-xs text-[var(--status-ia-fg)]",
        className,
      )}
      {...props}
    >
      <span className="font-semibold uppercase">{rotulo}</span>
      {typeof numeroSessao === "number" ? (
        <span>sessão {numeroSessao} ·</span>
      ) : null}
      {iso ? <time dateTime={iso}>{legivel}</time> : <span>{legivel}</span>}
    </span>
  );
});
