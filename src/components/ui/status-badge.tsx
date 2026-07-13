import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Selo persistente do estado do dado clínico (princípio 1: honestidade visual =
 * honestidade epistêmica). "Sugerida" NUNCA se parece com um fato: a diferença
 * é estrutural (contorno tracejado sem fill vs fill sólido), reforçada por ícone
 * e texto — nunca cor sozinha (§4C). Selo sempre visível, nunca só um matiz.
 *
 * Vocabulário ÚNICO (D4 do refactor): alinhado a `extraction_estado` da Fase 3
 * (sugerida/aprovada/editada/descartada/pendente) + estados de governança da
 * Fase 5 (reclassificada/devolvida). Antes o Card falava outro vocabulário
 * (conquistado/candidato) — agora Card = candidatura de marco (Fase 4), Badge =
 * desfecho de revisão. Sem mais dois dicionários para "a IA sugeriu isto".
 */
export type EstadoDado =
  | "sugerida" // candidato da IA — tentativo, ainda não é evidência
  | "aprovada" // terapeuta aprovou — virou fato
  | "editada" // terapeuta editou e aprovou — fato, com ajuste humano
  | "descartada" // terapeuta rejeitou — não vira registro
  | "pendente" // extração pendente de reprocessamento (falha do pipeline, flow 2.4)
  | "reclassificada" // coordenador criou nova versão (governança, Fase 5)
  | "devolvida"; // coordenador devolveu ao terapeuta — pede ação

type Config = {
  rotulo: string;
  /** Estrutura do selo. Sugerida = contorno tracejado violeta, sem fill. */
  selo: string;
  /** Cor do ponto no StatusDot (visível com borda âncora redundante). */
  dot: string;
  Icone: React.FC;
};

function IconeSparkle() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        d="M8 1.5l1.4 3.7L13 6.6l-3.6 1.4L8 11.7 6.6 8 3 6.6l3.6-1.4L8 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}
function IconeCheck() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}
function IconeLayers() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M8 2l6 3-6 3-6-3 6-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M2 9l6 3 6-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function IconeUndo() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M6 3L2.5 6.5 6 10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="round" />
      <path d="M2.5 6.5H10a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
function IconePencil() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M10.5 2.5l3 3L6 13l-3.5.5L3 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function IconeSlash() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}
function IconeClock() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 5v3.2l2.2 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const config: Record<EstadoDado, Config> = {
  sugerida: {
    rotulo: "Sugerida",
    // Contorno tracejado violeta, SEM fill sólido — o "ainda-não-fato" da IA.
    // (A profundidade "afunda" mora no Card/ConfidenceCard; o selo é rótulo.)
    selo: "border-dashed border-[color:var(--color-suggested)] bg-canvas text-[color:var(--color-suggested)]",
    dot: "bg-[color:var(--color-suggested)]",
    Icone: IconeSparkle,
  },
  aprovada: {
    rotulo: "Aprovada",
    selo: "border-ink-anchor bg-mint text-ink-anchor",
    dot: "bg-mint",
    Icone: IconeCheck,
  },
  editada: {
    rotulo: "Editada",
    // Fato, com ajuste humano — mesmo fill de "aprovada" (é fato), ícone lápis.
    selo: "border-ink-anchor bg-mint text-ink-anchor",
    dot: "bg-mint",
    Icone: IconePencil,
  },
  descartada: {
    rotulo: "Descartada",
    // Rejeitada — baixa ênfase, sem fill forte (não é fato, saiu do fluxo).
    selo: "border-graphite bg-canvas text-graphite",
    dot: "bg-graphite",
    Icone: IconeSlash,
  },
  pendente: {
    rotulo: "Pendente",
    // Extração pendente de reprocessamento (falha do pipeline) — pede atenção.
    selo: "border-ink-anchor bg-terracotta text-ink-anchor",
    dot: "bg-terracotta",
    Icone: IconeClock,
  },
  reclassificada: {
    rotulo: "Reclassificada",
    selo: "border-ink-anchor bg-blue text-ink-anchor",
    dot: "bg-blue",
    Icone: IconeLayers,
  },
  devolvida: {
    rotulo: "Devolvida",
    selo: "border-ink-anchor bg-terracotta text-ink-anchor",
    dot: "bg-terracotta",
    Icone: IconeUndo,
  },
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  estado: EstadoDado;
  /** Sobrescreve o texto do selo (default: rótulo canônico do estado). */
  children?: React.ReactNode;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  function StatusBadge({ className, estado, children, ...props }, ref) {
    const { rotulo, selo, Icone } = config[estado];
    return (
      <span
        ref={ref}
        data-estado={estado}
        className={cn(
          "inline-flex items-center gap-1.5 border-2 px-2 py-0.5",
          "font-display text-xs font-semibold tracking-wide uppercase",
          selo,
          className,
        )}
        {...props}
      >
        <span className="shrink-0">
          <Icone />
        </span>
        {children ?? rotulo}
      </span>
    );
  },
);

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  estado: EstadoDado;
  /** Sobrescreve o texto ao lado do ponto (default: rótulo canônico). */
  children?: React.ReactNode;
}

/**
 * Variante compacta para listas/tabelas densas (coordenador). Ponto + texto
 * SEMPRE juntos — o ponto é reforço, o texto carrega o significado (cor nunca
 * sozinha). O ponto ganha borda âncora para ser visível mesmo em fill pastel.
 */
export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  function StatusDot({ className, estado, children, ...props }, ref) {
    const { rotulo, dot } = config[estado];
    return (
      <span
        ref={ref}
        data-estado={estado}
        className={cn("text-ink inline-flex items-center gap-2 text-sm", className)}
        {...props}
      >
        <span
          aria-hidden
          className={cn("border-ink-anchor size-2.5 shrink-0 border", dot)}
        />
        {children ?? rotulo}
      </span>
    );
  },
);
