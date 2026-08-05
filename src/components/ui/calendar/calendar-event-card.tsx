"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { CheckInButton } from "@/app/(app)/agenda/checkin-button";
import type { SessionEstado } from "@/app/(app)/agenda/actions";

export interface CalendarEventCardProps {
  id: string;
  pacienteNome: string;
  disciplinaNome?: string;
  horarioStr?: string;
  estado: SessionEstado;
  terapeutaNome?: string;
  variante?: "compacta" | "detalhada";
  onClick?: () => void;
  podeGerir?: boolean;
}

const ESTADO_ESTILOS: Record<SessionEstado, { bg: string; border: string; text: string }> = {
  agendada: {
    bg: "bg-[#f1e9f6]",
    border: "border-black",
    text: "text-[#45286e]",
  },
  realizada: {
    bg: "bg-[#e6f4f1]",
    border: "border-black",
    text: "text-[#0a5c54]",
  },
  falta_paciente: {
    bg: "bg-[#fbe9e9]",
    border: "border-black",
    text: "text-[#7e1f16]",
  },
  falta_terapeuta: {
    bg: "bg-[#fbe9e9]",
    border: "border-black",
    text: "text-[#7e1f16]",
  },
  cancelada: {
    bg: "bg-gray-200",
    border: "border-black",
    text: "text-gray-600",
  },
};

export function CalendarEventCard({
  id,
  pacienteNome,
  disciplinaNome,
  horarioStr,
  estado,
  terapeutaNome,
  variante = "detalhada",
  onClick,
  podeGerir = true,
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
          "group relative flex items-center justify-between gap-1.5 rounded-[var(--radius-control)] border-2 px-2 py-1 font-display transition-all cursor-pointer shadow-[1px_1px_0_#000] hover:shadow-[2px_2px_0_#000] hover:-translate-y-0.5 focus-visible:outline-focus",
          estilo.bg,
          estilo.border,
          estilo.text
        )}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className="h-2 w-2 shrink-0 rounded-full border border-black bg-current" />
          <span className="truncate font-semibold text-xs">{pacienteNome}</span>
        </div>
        {horarioStr && (
          <span className="font-mono text-[10px] font-bold opacity-80 shrink-0">{horarioStr}</span>
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
        "group relative flex flex-col justify-between rounded-[var(--radius-control)] border-2 p-2.5 font-display transition-all cursor-pointer shadow-[2px_2px_0_#000] hover:shadow-[3px_3px_0_#000] hover:-translate-y-0.5 focus-visible:outline-focus",
        estilo.bg,
        estilo.border,
        estilo.text
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          {horarioStr && (
            <span className="font-mono text-xs font-bold tracking-tight">{horarioStr}</span>
          )}
          <span className="h-2.5 w-2.5 rounded-full border border-black bg-current" />
        </div>
        <h4 className="mt-1 font-bold text-sm leading-tight text-balance">{pacienteNome}</h4>
        {disciplinaNome && (
          <p className="mt-0.5 font-mono text-[11px] font-medium opacity-85 uppercase">
            {disciplinaNome}
          </p>
        )}
        {terapeutaNome && (
          <p className="mt-1 font-body text-xs text-[var(--text-secondary)]">{terapeutaNome}</p>
        )}
      </div>

      {/* Botão de Check-in em 1-Clique no Hover (se agendada) */}
      {estado === "agendada" && podeGerir && (
        <div
          className="mt-2 hidden group-hover:block transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <CheckInButton sessionId={id} />
        </div>
      )}
    </div>
  );
}
