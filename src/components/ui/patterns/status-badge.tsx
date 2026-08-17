import * as React from "react";
import { cn } from "@/lib/cn";
import {
  SparkleIcon,
  CheckIcon,
  LayersIcon,
  UndoIcon,
  PencilIcon,
  DiscardIcon,
  AlertTriangleIcon,
  ClockIcon,
} from "@/components/ui/icon";

/**
 * Selo persistente do estado do dado clínico (princípio 1: honestidade visual =
 * honestidade epistêmica). "Sugerida" NUNCA se parece com um fato: a diferença
 * é estrutural (contorno tracejado sem fill vs fill sólido), reforçada por ícone
 * e texto — nunca cor sozinha (§4C). Selo sempre visível, nunca só um matiz.
 *
 * Vocabulário ÚNICO (D4 do refactor): alinhado a `extraction_estado` da Fase 3
 * (sugerida/aprovada/editada/descartada/pendente) + estados de governança da
 * Fase 5 (reclassificada/devolvida).
 */
export type EstadoDado =
  | "sugerida" // candidato da IA — tentativo, ainda não é evidência
  | "aprovada" // terapeuta aprovou — virou fato
  | "editada" // terapeuta editou e aprovou — fato, com ajuste humano
  | "descartada" // terapeuta rejeitou — não vira registro
  | "pendente" // extração pendente de reprocessamento
  | "reclassificada" // coordenador criou nova versão (governança, Fase 5)
  | "devolvida"; // coordenador devolveu ao terapeuta — pede ação

export type BadgesVariantes =
  | "success"
  | "warning"
  | "error"
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

const variantStyles: Record<string, string> = {
  success:
    "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]",
  Success:
    "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[var(--status-success-fg)]",
  warning:
    "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]",
  Warning:
    "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]",
  error:
    "bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[var(--status-error-fg)]",
  ai: "bg-[var(--status-ia-bg)] border-[var(--status-ia-border)] text-[var(--status-ia-fg)]",
  AI: "bg-[var(--status-ia-bg)] border-[var(--status-ia-border)] text-[var(--status-ia-fg)]",
  info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)]",
  Info: "bg-[var(--status-info-bg)] border-[var(--status-info-border)] text-[var(--status-info-fg)]",
  brand:
    "bg-[var(--action-primary)] border-[var(--border-brutal)] text-[var(--action-primary-fg)]",
  neutral:
    "bg-[var(--surface-elevated)] border-[var(--border-brutal)] text-[var(--text-primary)]",
};

const dotColorMap: Record<string, string> = {
  success: "bg-[var(--status-success-border)]",
  Success: "bg-[var(--status-success-border)]",
  warning: "bg-[var(--status-warning-border)]",
  Warning: "bg-[var(--status-warning-border)]",
  error: "bg-[var(--status-error-border)]",
  ai: "bg-[var(--status-ia-border)]",
  AI: "bg-[var(--status-ia-border)]",
  info: "bg-[var(--status-info-border)]",
  Info: "bg-[var(--status-info-border)]",
  brand: "bg-[var(--action-primary)]",
  neutral: "bg-[var(--text-secondary)]",
};

type Config = {
  rotulo: string;
  Icone: React.ComponentType<{ size?: number | string; className?: string }>;
};

const config: Record<EstadoDado, Config> = {
  sugerida: {
    rotulo: "Sugerida",
    Icone: SparkleIcon,
  },
  aprovada: {
    rotulo: "Aprovada",
    Icone: CheckIcon,
  },
  editada: {
    rotulo: "Editada",
    Icone: PencilIcon,
  },
  descartada: {
    rotulo: "Descartada",
    Icone: DiscardIcon,
  },
  pendente: {
    rotulo: "Pendente",
    Icone: ClockIcon,
  },
  reclassificada: {
    rotulo: "Reclassificada",
    Icone: LayersIcon,
  },
  devolvida: {
    rotulo: "Devolvida",
    Icone: UndoIcon,
  },
};

const defaultIcons: Record<
  string,
  React.ComponentType<{ size?: number | string; className?: string }>
> = {
  success: CheckIcon,
  Success: CheckIcon,
  warning: ClockIcon,
  Warning: ClockIcon,
  error: AlertTriangleIcon,
  ai: SparkleIcon,
  AI: SparkleIcon,
  info: LayersIcon,
  Info: LayersIcon,
  brand: CheckIcon,
  neutral: DiscardIcon,
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  estado?: EstadoDado;
  variante?: BadgesVariantes;
  /** Sobrescreve o texto do selo (default: rótulo canônico do estado). */
  children?: React.ReactNode;
}

/**
 * StatusBadge — Selo semântico de estado com par obrigatório Ícone + Rótulo Textual (§4C).
 */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  function StatusBadge(
    { className, estado, variante, children, ...props },
    ref,
  ) {
    const resolvedVariant =
      variante ?? (estado ? estadoToVariante[estado] : "neutral");
    const styleClasses =
      variantStyles[resolvedVariant] ?? variantStyles.neutral;

    const borderStyle =
      estado === "sugerida" ||
      resolvedVariant === "ai" ||
      resolvedVariant === "AI"
        ? "border-dashed"
        : "border-solid";

    const rotulo = estado ? config[estado].rotulo : String(resolvedVariant);
    const Icone = estado
      ? config[estado].Icone
      : (defaultIcons[resolvedVariant] ?? CheckIcon);

    return (
      <span
        ref={ref}
        data-estado={estado}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border-2 px-3 py-0.5",
          "font-mono text-xs font-semibold tracking-wide uppercase",
          borderStyle,
          styleClasses,
          className,
        )}
        {...props}
      >
        <span className="inline-flex shrink-0 items-center justify-center">
          <Icone size={14} />
        </span>
        <span>{children ?? rotulo}</span>
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

export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  function StatusDot({ className, estado, variante, children, ...props }, ref) {
    const resolvedVariant =
      variante ?? (estado ? estadoToVariante[estado] : "neutral");
    const dotStyle = dotColorMap[resolvedVariant] ?? dotColorMap.neutral;
    const rotulo = estado ? config[estado].rotulo : String(resolvedVariant);

    return (
      <span
        ref={ref}
        data-estado={estado}
        className={cn(
          "inline-flex items-center gap-2 text-sm text-[var(--text-primary)]",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-[length:var(--radius-pill)] border border-[var(--border-brutal)]",
            dotStyle,
          )}
        />
        {children ?? rotulo}
      </span>
    );
  },
);
