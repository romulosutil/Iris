import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Alerta redundante: significado NUNCA depende só de cor — ícone + texto
 * sempre presentes (§4C). Sem listras/xadrez de alto contraste (gatilho
 * fotossensível): fundo sólido tonal + borda cheia + um ícone estático.
 * Copy literal e sem culpa: "o áudio não foi enviado — toque para tentar de
 * novo", nunca "algo deu errado!".
 */
type Severidade = "erro" | "info" | "sucesso";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  severidade?: Severidade;
  titulo?: React.ReactNode;
  /** Se true, aplica bordas mais espessas, sombra tridimensional e padding generoso (para empty states) */
  destacado?: boolean;
}

const estilo: Record<Severidade, { fundo: string; texto: string; rotulo: string }> = {
  erro: { fundo: "bg-status-error-bg", texto: "text-status-error-text", rotulo: "Erro" },
  info: { fundo: "bg-status-info-bg", texto: "text-status-info-text", rotulo: "Informação" },
  sucesso: { fundo: "bg-status-success-bg", texto: "text-status-success-text", rotulo: "Sucesso" },
};
 
function Icone({ severidade }: { severidade: Severidade }) {
  const comum = {
    width: 20,
    height: 20,
    "aria-hidden": true,
    focusable: false,
  };
  if (severidade === "sucesso") {
    return (
      <svg {...comum} viewBox="0 0 20 20" fill="none">
        <path
          d="M4 10.5l4 4 8-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  if (severidade === "info") {
    return (
      <svg {...comum} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="5" r="1.4" fill="currentColor" />
        <path
          d="M10 9v7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  return (
    <svg {...comum} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 3v9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
      <path
        d="M10 16v.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  );
}
 
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  function Alert(
    { className, severidade = "erro", titulo, destacado = false, children, ...props },
    ref,
  ) {
    const { fundo, texto, rotulo } = estilo[severidade];
    return (
      <div
        ref={ref}
        role={severidade === "erro" ? "alert" : "status"}
        className={cn(
          "border-border-brutal flex items-start gap-3",
          destacado
            ? "border-4 shadow-[var(--ds-shadow)] p-8 md:p-12 text-lg font-medium"
            : "border-2 p-4",
          fundo,
          texto,
          className,
        )}
        {...props}
      >
        <span className="mt-0.5 shrink-0">
          <Icone severidade={severidade} />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="sr-only">{rotulo}: </span>
          {titulo ? (
            <p className="font-display text-sm font-semibold">{titulo}</p>
          ) : null}
          {children ? <div className="text-sm">{children}</div> : null}
        </div>
      </div>
    );
  },
);
