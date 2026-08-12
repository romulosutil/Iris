"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";

interface CalendarMetrics {
  total: number;
  realizadas: number;
  agendadas: number;
  faltas: number;
}

export interface CalendarHeaderProps {
  titulo?: string;
  subtitulo?: string;
  metricas?: CalendarMetrics;
  visoes?: { id: string; label: string }[];
  visaoAtiva?: string;
  aoMudarVisao?: (visaoId: string) => void;
  children?: React.ReactNode;
}

export function CalendarHeader({
  titulo = "Agenda Geral da Clínica",
  subtitulo = "Visão Unificada de Atendimentos",
  metricas,
  visoes,
  visaoAtiva,
  aoMudarVisao,
  children,
}: CalendarHeaderProps) {
  return (
    <div className="w-full space-y-4 rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] p-4 shadow-[var(--elevation-2)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Título e Fuso */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {titulo}
            </h1>
            <span className="rounded-full border border-black bg-[#fff6db] px-2 py-0.5 font-mono text-[10px] font-bold text-[#664d00]">
              {FUSO_CLINICA}
            </span>
          </div>
          {subtitulo && (
            <p className="font-body text-xs text-[var(--text-secondary)]">{subtitulo}</p>
          )}
        </div>

        {/* Abas / Seletores de Visão Brutalistas */}
        {visoes && visoes.length > 0 && (
          <div className="flex items-center rounded-[var(--radius-control)] border-2 border-black bg-[var(--bg-app,#F8F9FA)] p-1 shadow-[2px_2px_0_#000]">
            {visoes.map((v) => {
              const ativo = v.id === visaoAtiva;
              return (
                <button
                  key={v.id}
                  onClick={() => aoMudarVisao?.(v.id)}
                  className={cn(
                    "px-3 py-1.5 font-display text-xs font-bold transition-all rounded-[var(--radius-xs)]",
                    ativo
                      ? "bg-[var(--action-primary,#f2b705)] text-black border border-black shadow-[1px_1px_0_#000]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Métricas Operacionais (se fornecidas) */}
      {metricas && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t-2 border-black pt-3">
          <div className="rounded-[var(--radius-control)] border-2 border-black bg-[var(--bg-app)] p-2.5 shadow-[1px_1px_0_#000]">
            <span className="font-mono text-[10px] font-bold uppercase text-[var(--text-secondary)]">Total Sessões</span>
            <p className="font-display text-lg font-bold text-[var(--text-primary)]">{metricas.total}</p>
          </div>
          <div className="rounded-[var(--radius-control)] border-2 border-black bg-[#e6f4f1] p-2.5 shadow-[1px_1px_0_#000]">
            <span className="font-mono text-[10px] font-bold uppercase text-[#0a5c54]">Realizadas</span>
            <p className="font-display text-lg font-bold text-[#0a5c54]">{metricas.realizadas}</p>
          </div>
          <div className="rounded-[var(--radius-control)] border-2 border-black bg-[#e7f0fb] p-2.5 shadow-[1px_1px_0_#000]">
            <span className="font-mono text-[10px] font-bold uppercase text-[#124a78]">Agendadas</span>
            <p className="font-display text-lg font-bold text-[#124a78]">{metricas.agendadas}</p>
          </div>
          <div className="rounded-[var(--radius-control)] border-2 border-black bg-[#fbe9e9] p-2.5 shadow-[1px_1px_0_#000]">
            <span className="font-mono text-[10px] font-bold uppercase text-[#7e1f16]">Faltas / Canceladas</span>
            <p className="font-display text-lg font-bold text-[#7e1f16]">{metricas.faltas}</p>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
