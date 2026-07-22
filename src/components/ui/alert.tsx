import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Alerta redundante: significado NUNCA depende só de cor — ícone + texto
 * sempre presentes. Sem listras/xadrez de alto contraste (gatilho
 * fotossensível): fundo sólido tonal + borda cheia + um ícone estático.
 */
type Severidade = "erro" | "info" | "sucesso" | "error" | "warning" | "success";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  severidade?: Severidade;
  titulo?: React.ReactNode;
  /** Se true, aplica bordas mais espessas, sombra tridimensional e padding generoso (para empty states) */
  destacado?: boolean;
}

const estilo: Record<string, {
  fundo: string;
  bordaEsquerda: string;
  bordaOutras: string;
  texto: string;
  iconeBg: string;
  rotulo: string;
}> = {
  erro: {
    fundo: "bg-[var(--status-error-bg)]",
    bordaEsquerda: "border-l-[var(--status-error-border)]",
    bordaOutras: "border-y-[var(--status-error-border)]/40 border-r-[var(--status-error-border)]/40",
    texto: "text-[var(--status-error-fg)]",
    iconeBg: "bg-[var(--status-error-border)] text-white",
    rotulo: "Erro",
  },
  error: {
    fundo: "bg-[var(--status-error-bg)]",
    bordaEsquerda: "border-l-[var(--status-error-border)]",
    bordaOutras: "border-y-[var(--status-error-border)]/40 border-r-[var(--status-error-border)]/40",
    texto: "text-[var(--status-error-fg)]",
    iconeBg: "bg-[var(--status-error-border)] text-white",
    rotulo: "Erro",
  },
  warning: {
    fundo: "bg-[var(--status-warning-bg)]",
    bordaEsquerda: "border-l-[var(--status-warning-border)]",
    bordaOutras: "border-y-[var(--status-warning-border)]/40 border-r-[var(--status-warning-border)]/40",
    texto: "text-[var(--status-warning-fg)]",
    iconeBg: "bg-[var(--status-warning-border)] text-white",
    rotulo: "Aviso",
  },
  info: {
    fundo: "bg-[var(--status-info-bg)]",
    bordaEsquerda: "border-l-[var(--status-info-border)]",
    bordaOutras: "border-y-[var(--status-info-border)]/40 border-r-[var(--status-info-border)]/40",
    texto: "text-[var(--status-info-fg)]",
    iconeBg: "bg-[var(--status-info-border)] text-white",
    rotulo: "Informação",
  },
  sucesso: {
    fundo: "bg-[var(--status-success-bg)]",
    bordaEsquerda: "border-l-[var(--status-success-border)]",
    bordaOutras: "border-y-[var(--status-success-border)]/40 border-r-[var(--status-success-border)]/40",
    texto: "text-[var(--status-success-fg)]",
    iconeBg: "bg-[var(--status-success-border)] text-white",
    rotulo: "Sucesso",
  },
  success: {
    fundo: "bg-[var(--status-success-bg)]",
    bordaEsquerda: "border-l-[var(--status-success-border)]",
    bordaOutras: "border-y-[var(--status-success-border)]/40 border-r-[var(--status-success-border)]/40",
    texto: "text-[var(--status-success-fg)]",
    iconeBg: "bg-[var(--status-success-border)] text-white",
    rotulo: "Sucesso",
  },
};
 
function Icone({ severidade }: { severidade: Severidade }) {
  const comum = {
    width: 14,
    height: 14,
    "aria-hidden": true,
    focusable: false,
  };
  if (severidade === "sucesso" || severidade === "success") {
    return (
      <svg {...comum} viewBox="0 0 20 20" fill="none">
        <path
          d="M4 10.5l4 4 8-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  if (severidade === "info") {
    return (
      <svg {...comum} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="5" r="1.5" fill="currentColor" />
        <path
          d="M10 9v7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  return (
    <svg {...comum} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 4v8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
      />
      <circle cx="10" cy="15.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
 
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  function Alert(
    { className, severidade = "erro", titulo, destacado = false, children, ...props },
    ref,
  ) {
    const activeStyle = estilo[severidade] ?? estilo.erro!;
    const { fundo, bordaEsquerda, bordaOutras, texto, iconeBg, rotulo } = activeStyle;
    return (
      <div
        ref={ref}
        role={severidade === "erro" || severidade === "error" ? "alert" : "status"}
        className={cn(
          "flex items-start gap-4 p-4 rounded-md border-2 border-[var(--border-brutal)]",
          "border-l-[4px]",
          destacado && "shadow-[var(--shadow-brutal)] p-8 md:p-12 text-lg font-medium",
          fundo,
          bordaEsquerda,
          bordaOutras,
          texto,
          className,
        )}
        {...props}
      >
        <span className={cn("mt-0.5 shrink-0 flex items-center justify-center rounded-[length:var(--radius-pill)] w-7 h-7 text-white", iconeBg)}>
          <Icone severidade={severidade} />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="sr-only">{rotulo}: </span>
          {titulo ? (
            <p className="font-display text-sm font-semibold">{titulo}</p>
          ) : null}
          {children ? <div className="text-sm opacity-95">{children}</div> : null}
        </div>
      </div>
    );
  },
);

