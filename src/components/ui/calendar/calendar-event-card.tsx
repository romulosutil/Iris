"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/** Estados que a grade sabe pintar. Espelha `session_estado` do banco. */
export type CalendarEventoEstado =
  "agendada" | "realizada" | "falta_paciente" | "falta_terapeuta" | "cancelada";

export interface CalendarEventCardProps {
  pacienteNome: string;
  disciplinaNome?: string | null;
  horarioStr?: string;
  estado: CalendarEventoEstado;
  terapeutaNome?: string;
  variante?: "compacta" | "detalhada";
  onClick?: () => void;
  /**
   * Slot de ação do app (ex.: botão de check-in). O DS não sabe o que é uma
   * sessão nem o que é check-in — antes este card importava `CheckInButton`
   * de `@/app`, invertendo a camada (A-01, #538). Aparece no hover, só na
   * variante detalhada.
   */
  acao?: React.ReactNode;
}

const ESTADO_ESTILOS: Record<
  CalendarEventoEstado,
  { bg: string; border: string; text: string }
> = {
  agendada: {
    bg: "bg-[#f1e9f6]",
    border: "border-[var(--border-brutal)]",
    text: "text-[#45286e]",
  },
  realizada: {
    bg: "bg-[#e6f4f1]",
    border: "border-[var(--border-brutal)]",
    text: "text-[#0a5c54]",
  },
  falta_paciente: {
    bg: "bg-[#fbe9e9]",
    border: "border-[var(--border-brutal)]",
    text: "text-[#7e1f16]",
  },
  falta_terapeuta: {
    bg: "bg-[#fbe9e9]",
    border: "border-[var(--border-brutal)]",
    text: "text-[#7e1f16]",
  },
  cancelada: {
    bg: "bg-[var(--surface-muted)]",
    border: "border-[var(--border-brutal)]",
    text: "text-[var(--text-secondary)]",
  },
};

/**
 * CalendarEventCard — card puro de evento da grade (DS). Sem dependência do
 * app: o que é do app entra por `acao`.
 */
export function CalendarEventCard({
  pacienteNome,
  disciplinaNome,
  horarioStr,
  estado,
  terapeutaNome,
  variante = "detalhada",
  onClick,
  acao,
}: CalendarEventCardProps) {
  const estilo = ESTADO_ESTILOS[estado] ?? ESTADO_ESTILOS.agendada;

  if (variante === "compacta") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group font-display focus-visible:outline-focus relative flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-[var(--radius-control)] border-2 px-2 py-1 text-left shadow-[var(--shadow-brutal-xs)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--elevation-1)]",
          estilo.bg,
          estilo.border,
          estilo.text,
        )}
      >
        <span className="flex items-center gap-1.5 overflow-hidden">
          <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--border-brutal)] bg-current" />
          <span className="truncate text-xs font-semibold">
            {pacienteNome}
            {disciplinaNome ? ` · ${disciplinaNome}` : ""}
          </span>
        </span>
        {horarioStr && (
          <span className="shrink-0 font-mono text-xs font-bold opacity-80">
            {horarioStr}
          </span>
        )}
      </button>
    );
  }

  return (
    // #283: o card é o container; quem é clicável é o <button> interno. Antes o
    // container inteiro era `role="button"` e a `acao` (check-in) ficava DENTRO
    // dele — controle aninhado em controle, violação `nested-interactive`
    // (WCAG 4.1.2, axe "serious") nas duas variantes da escala Dia.
    <div
      className={cn(
        "group font-display relative flex flex-col justify-between rounded-[var(--radius-control)] border-2 p-2.5 shadow-[var(--elevation-1)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--elevation-2)]",
        estilo.bg,
        estilo.border,
        estilo.text,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="focus-visible:outline-focus flex w-full cursor-pointer flex-col text-left"
      >
        <span className="flex w-full items-center justify-between gap-2">
          {horarioStr && (
            <span className="font-mono text-xs font-bold tracking-tight">
              {horarioStr}
            </span>
          )}
          <span className="h-2.5 w-2.5 rounded-full border border-[var(--border-brutal)] bg-current" />
        </span>
        {/* Era um <h4>: conteúdo de fluxo dentro de botão é HTML inválido, e o
            texto do card nomeia o controle — não é cabeçalho de seção. */}
        <span className="mt-1 text-sm leading-tight font-bold text-balance">
          {pacienteNome}
        </span>
        {disciplinaNome && (
          <span className="mt-0.5 font-mono text-xs font-medium uppercase opacity-85">
            {disciplinaNome}
          </span>
        )}
        {terapeutaNome && (
          <span className="font-body mt-1 text-xs text-[var(--text-secondary)]">
            {terapeutaNome}
          </span>
        )}
      </button>

      {acao ? (
        // #283: revelar no hover deixa a ação inalcançável em toque — mobile
        // não tem hover. Abaixo de `md` (mesmo corte do R-30, onde a escala Dia
        // vira lista) a ação fica sempre visível; no desktop segue no hover,
        // agora também no foco de teclado (antes era inalcançável por Tab).
        <div className="mt-2 transition-all md:hidden md:group-focus-within:block md:group-hover:block">
          {acao}
        </div>
      ) : null}
    </div>
  );
}
