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
    fundo: "bg-[color:var(--warning-tint)]",
    bordaEsquerda: "border-l-[color:var(--warning-accent)]",
    bordaOutras: "border-y-[color:var(--warning-accent)]/30 border-r-[color:var(--warning-accent)]/30",
    texto: "text-[color:var(--warning-deep)]",
    iconeBg: "bg-[color:var(--warning-accent)]",
    rotulo: "Erro",
  },
  error: {
    fundo: "bg-[color:var(--warning-tint)]",
    bordaEsquerda: "border-l-[color:var(--warning-accent)]",
    bordaOutras: "border-y-[color:var(--warning-accent)]/30 border-r-[color:var(--warning-accent)]/30",
    texto: "text-[color:var(--warning-deep)]",
    iconeBg: "bg-[color:var(--warning-accent)]",
    rotulo: "Erro",
  },
  warning: {
    fundo: "bg-[color:var(--warning-tint)]",
    bordaEsquerda: "border-l-[color:var(--warning-accent)]",
    bordaOutras: "border-y-[color:var(--warning-accent)]/30 border-r-[color:var(--warning-accent)]/30",
    texto: "text-[color:var(--warning-deep)]",
    iconeBg: "bg-[color:var(--warning-accent)]",
    rotulo: "Aviso",
  },
  info: {
    fundo: "bg-[color:var(--info-tint)]",
    bordaEsquerda: "border-l-[color:var(--info-accent)]",
    bordaOutras: "border-y-[color:var(--info-accent)]/30 border-r-[color:var(--info-accent)]/30",
    texto: "text-[color:var(--info-deep)]",
    iconeBg: "bg-[color:var(--info-accent)]",
    rotulo: "Informação",
  },
  sucesso: {
    fundo: "bg-[color:var(--success-tint)]",
    bordaEsquerda: "border-l-[color:var(--success-accent)]",
    bordaOutras: "border-y-[color:var(--success-accent)]/30 border-r-[color:var(--success-accent)]/30",
    texto: "text-[color:var(--success-deep)]",
    iconeBg: "bg-[color:var(--success-accent)]",
    rotulo: "Sucesso",
  },
  success: {
    fundo: "bg-[color:var(--success-tint)]",
    bordaEsquerda: "border-l-[color:var(--success-accent)]",
    bordaOutras: "border-y-[color:var(--success-accent)]/30 border-r-[color:var(--success-accent)]/30",
    texto: "text-[color:var(--success-deep)]",
    iconeBg: "bg-[color:var(--success-accent)]",
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
          "flex items-start gap-4 p-4",
          "border-y-[length:var(--border-brutal)] border-r-[length:var(--border-brutal)] border-l-[4px]",
          destacado && "shadow-[var(--ds-shadow)] p-8 md:p-12 text-lg font-medium",
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

