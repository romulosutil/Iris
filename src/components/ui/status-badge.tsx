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

export type BadgesVariantes =
  | "success"
  | "warning"
  | "ai"
  | "info"
  | "brand"
  | "neutral"
  | "Success"
  | "Warning"
  | "AI"
  | "Info";

const estadoToVariante: Record<EstadoDado, BadgesVariantes> = {
  sugerida: "ai",
  aprovada: "success",
  editada: "success",
  descartada: "neutral",
  pendente: "warning",
  reclassificada: "info",
  devolvida: "warning",
};

export const variantStyles: Record<string, string> = {
  success: "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]",
  Success: "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]",
  warning: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]",
  Warning: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]",
  ai: "bg-[var(--ai-tint)] border-[var(--ai-accent)] text-[var(--ai-deep)]",
  AI: "bg-[var(--ai-tint)] border-[var(--ai-accent)] text-[var(--ai-deep)]",
  info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)]",
  Info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)]",
  brand: "bg-[var(--action-primary)] border-[var(--border-brutal)] text-[var(--action-primary-fg)]",
  neutral: "bg-[var(--surface-elevated)] border-[var(--border-brutal)] text-[var(--text-primary)]",
};

const dotColorMap: Record<string, string> = {
  success: "bg-[var(--status-success-border)]",
  Success: "bg-[var(--status-success-border)]",
  warning: "bg-[var(--status-warning-border)]",
  Warning: "bg-[var(--status-warning-border)]",
  ai: "bg-[var(--ai-accent)]",
  AI: "bg-[var(--ai-accent)]",
  info: "bg-[var(--status-info-border)]",
  Info: "bg-[var(--status-info-border)]",
  brand: "bg-[var(--action-primary)]",
  neutral: "bg-[var(--text-secondary)]",
};

type Config = {
  rotulo: string;
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
    Icone: IconeSparkle,
  },
  aprovada: {
    rotulo: "Aprovada",
    Icone: IconeCheck,
  },
  editada: {
    rotulo: "Editada",
    Icone: IconePencil,
  },
  descartada: {
    rotulo: "Descartada",
    Icone: IconeSlash,
  },
  pendente: {
    rotulo: "Pendente",
    Icone: IconeClock,
  },
  reclassificada: {
    rotulo: "Reclassificada",
    Icone: IconeLayers,
  },
  devolvida: {
    rotulo: "Devolvida",
    Icone: IconeUndo,
  },
};

const defaultIcons: Record<string, React.FC> = {
  success: IconeCheck,
  Success: IconeCheck,
  warning: IconeClock,
  Warning: IconeClock,
  ai: IconeSparkle,
  AI: IconeSparkle,
  info: IconeLayers,
  Info: IconeLayers,
  brand: IconeCheck,
  neutral: IconeSlash,
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  estado?: EstadoDado;
  variante?: BadgesVariantes;
  /** Sobrescreve o texto do selo (default: rótulo canônico do estado). */
  children?: React.ReactNode;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  function StatusBadge({ className, estado, variante, children, ...props }, ref) {
    const resolvedVariant = variante ?? (estado ? estadoToVariante[estado] : "neutral");
    const styleClasses = variantStyles[resolvedVariant] ?? variantStyles.neutral;
    
    // Sugerida mantém contorno tracejado
    const borderStyle = (estado === "sugerida" || resolvedVariant === "ai" || resolvedVariant === "AI")
      ? "border-dashed"
      : "border-solid";

    const rotulo = estado ? config[estado].rotulo : String(resolvedVariant);
    const Icone = estado ? config[estado].Icone : (defaultIcons[resolvedVariant] ?? IconeCheck);

    return (
      <span
        ref={ref}
        data-estado={estado}
        className={cn(
          "inline-flex items-center gap-1.5 border-2 px-3 py-0.5 rounded-sm",
          "font-mono text-xs font-semibold tracking-wide uppercase",
          borderStyle,
          styleClasses,
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
  estado?: EstadoDado;
  variante?: BadgesVariantes;
  /** Sobrescreve o texto ao lado do ponto (default: rótulo canônico). */
  children?: React.ReactNode;
}

/**
 * Variante compacta para listas/tabelas densas (coordenador). Ponto + texto
 * SEMPRE juntos — o ponto é reforço, o texto carrega o significado (cor nunca
 * sozinha). O ponto ganha borda âncora para ser visível mesmo em fill pastel.
 */
export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  function StatusDot({ className, estado, variante, children, ...props }, ref) {
    const resolvedVariant = variante ?? (estado ? estadoToVariante[estado] : "neutral");
    const dotStyle = dotColorMap[resolvedVariant] ?? dotColorMap.neutral;
    const rotulo = estado ? config[estado].rotulo : String(resolvedVariant);

    return (
      <span
        ref={ref}
        data-estado={estado}
        className={cn("text-ink inline-flex items-center gap-2 text-sm", className)}
        {...props}
      >
        <span
          aria-hidden
          className={cn("border-ink-anchor size-2.5 shrink-0 border rounded-[length:var(--radius-pill)]", dotStyle)}
        />
        {children ?? rotulo}
      </span>
    );
  },
);
