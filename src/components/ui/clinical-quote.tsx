import * as React from "react";
import { cn } from "@/lib/cn";

export interface ClinicalQuoteProps extends React.HTMLAttributes<HTMLElement> {
  /** Rótulo da citação (ex: "Trecho do relato"). Padrão: "Trecho do relato". */
  rotulo?: React.ReactNode;
  /** Texto completo do relato da sessão. */
  texto?: string;
  /** Trecho específico da evidência a ser destacado em negrito dentro do texto. */
  evidencia?: string;
  /** Conteúdo livre alternativo. */
  children?: React.ReactNode;
}

/**
 * Destaca a evidência dentro do texto do relato clínico, mantendo a integridade literal
 * do texto original sem quebras monoespaçadas.
 */
function renderizarTextoComDestaque(
  texto: string,
  evidencia?: string,
): React.ReactNode {
  if (!evidencia || !evidencia.trim()) {
    return texto;
  }

  const termo = evidencia.trim();
  const index = texto.toLowerCase().indexOf(termo.toLowerCase());

  if (index === -1) {
    return texto;
  }

  const antes = texto.slice(0, index);
  const match = texto.slice(index, index + termo.length);
  const depois = texto.slice(index + termo.length);

  return (
    <>
      {antes}
      <strong className="font-bold text-[var(--text-primary)]">{match}</strong>
      {renderizarTextoComDestaque(depois, evidencia)}
    </>
  );
}

/**
 * ClinicalQuote — Citação corrida para trechos literais de relatos clínicos.
 * Substitui caixas monoespaçadas por tipografia legível, com suporte a realce de evidências.
 */
export const ClinicalQuote = React.forwardRef<HTMLElement, ClinicalQuoteProps>(
  function ClinicalQuote(
    {
      className,
      rotulo = "Trecho do relato",
      texto,
      evidencia,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <figure
        ref={ref}
        className={cn("m-0 flex flex-col gap-1.5", className)}
        {...props}
      >
        {rotulo ? (
          <figcaption className="text-xs font-semibold text-[var(--text-secondary)]">
            {rotulo}
          </figcaption>
        ) : null}
        <blockquote className="m-0 rounded-[var(--radius-control)] border-2 border-l-[4px] border-[var(--border-brutal)] border-l-[var(--action-primary)] bg-[var(--surface-elevated)] p-3.5 text-sm leading-relaxed text-[var(--text-primary)]">
          {children ??
            (texto ? renderizarTextoComDestaque(texto, evidencia) : null)}
        </blockquote>
      </figure>
    );
  },
);
