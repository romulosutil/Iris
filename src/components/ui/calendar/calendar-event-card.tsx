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
      <div
        onClick={onClick}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          "group font-display focus-visible:outline-focus relative flex cursor-pointer items-center justify-between gap-1.5 rounded-[var(--radius-control)] border-2 px-2 py-1 shadow-[var(--shadow-brutal-xs)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--elevation-1)]",
          estilo.bg,
          estilo.border,
          estilo.text,
        )}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--border-brutal)] bg-current" />
          <span className="truncate text-xs font-semibold">
            {pacienteNome}
            {disciplinaNome ? ` · ${disciplinaNome}` : ""}
          </span>
        </div>
        {horarioStr && (
          <span className="shrink-0 font-mono text-xs font-bold opacity-80">
            {horarioStr}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group font-display focus-visible:outline-focus relative flex cursor-pointer flex-col justify-between rounded-[var(--radius-control)] border-2 p-2.5 shadow-[var(--elevation-1)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--elevation-2)]",
        estilo.bg,
        estilo.border,
        estilo.text,
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          {horarioStr && (
            <span className="font-mono text-xs font-bold tracking-tight">
              {horarioStr}
            </span>
          )}
          <span className="h-2.5 w-2.5 rounded-full border border-[var(--border-brutal)] bg-current" />
        </div>
        <h4 className="mt-1 text-sm leading-tight font-bold text-balance">
          {pacienteNome}
        </h4>
        {disciplinaNome && (
          <p className="mt-0.5 font-mono text-xs font-medium uppercase opacity-85">
            {disciplinaNome}
          </p>
        )}
        {terapeutaNome && (
          <p className="font-body mt-1 text-xs text-[var(--text-secondary)]">
            {terapeutaNome}
          </p>
        )}
      </div>

      {acao ? (
        <div
          className="mt-2 hidden transition-all group-hover:block"
          onClick={(e) => e.stopPropagation()}
        >
          {acao}
        </div>
      ) : null}
    </div>
  );
}
