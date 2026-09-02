"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EstadoBadge } from "@/app/(app)/agenda/estado-badge";
import { CheckInButton } from "@/app/(app)/agenda/checkin-button";
import { GerirSessao } from "@/app/(app)/agenda/gerir-sessao";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";

export interface CalendarEventSidebarProps {
  sessao: SessaoDoDia | null;
  aberto: boolean;
  aoFechar: () => void;
  terapeutas?: { id: string; nome: string }[];
  podeGerir?: boolean;
}

function formatarHoraExtensa(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(quando));
}

export function CalendarEventSidebar({
  sessao,
  aberto,
  aoFechar,
  terapeutas = [],
  podeGerir = true,
}: CalendarEventSidebarProps) {
  React.useEffect(() => {
    function aoTeclarEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && aberto) {
        aoFechar();
      }
    }
    window.addEventListener("keydown", aoTeclarEsc);
    return () => window.removeEventListener("keydown", aoTeclarEsc);
  }, [aberto, aoFechar]);

  if (!aberto || !sessao) return null;

  const dataHoraStr = formatarHoraExtensa(sessao.agendadaPara);
  const modalidadeStr = sessao.modalidade;

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-xs transition-opacity duration-200 sm:items-stretch sm:justify-end">
      {/* Overlay Backdrop de fechar */}
      <div className="absolute inset-0" onClick={aoFechar} aria-hidden="true" />

      {/* Drawer / Sidebar Lateral em Desktop vs. Bottom Sheet no Mobile */}
      <aside
        role="dialog"
        aria-label="Detalhes da Sessão"
        className={cn(
          "animate-in relative z-10 flex w-full flex-col justify-between border-black bg-[var(--surface-card,#ffffff)] p-5 shadow-2xl transition-transform duration-200 sm:p-6",
          "slide-in-from-bottom sm:slide-in-from-right max-h-[88vh] rounded-t-2xl border-t-2 sm:rounded-t-none",
          "sm:h-full sm:w-[440px] sm:border-t-0 sm:border-l-2",
        )}
      >
        {/* Handle Visual no Mobile */}
        <div
          className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-gray-300 sm:hidden"
          aria-hidden="true"
        />

        <div className="space-y-5 overflow-y-auto pr-1">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between border-b-2 border-black pb-4">
            <div>
              <span className="font-mono text-xs font-bold tracking-wider text-[var(--text-secondary,#71717A)] uppercase">
                {sessao.disciplina}
              </span>
              <h2 className="font-display text-lg font-bold text-[var(--text-primary,#09090B)] sm:text-xl">
                {sessao.pacienteNome ?? "Paciente não identificado"}
              </h2>
            </div>
            <Button
              type="button"
              variante="neutra"
              size="sm"
              onClick={aoFechar}
              className="h-8 w-8 rounded-full border-2 border-black p-0 font-mono font-bold shadow-[1px_1px_0_#000]"
              aria-label="Fechar painel"
            >
              ✕
            </Button>
          </div>

          {/* Badge de Estado e Data */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border-2 border-black bg-[var(--bg-app,#F8F9FA)] p-3 shadow-[1px_1px_0_#000]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold">Status:</span>
              <EstadoBadge estado={sessao.estado} />
            </div>
            <span className="font-mono text-xs text-[var(--text-secondary)] capitalize">
              {dataHoraStr}
            </span>
          </div>

          {/* Ficha e Detalhes do Profissional */}
          <div className="space-y-3 rounded-[var(--radius-control)] border-2 border-black p-4 shadow-[2px_2px_0_#000]">
            <div>
              <span className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase">
                Profissional Responsável
              </span>
              <p className="font-display font-semibold text-[var(--text-primary)]">
                {sessao.terapeutaNome ?? "Profissional não atribuído"}
              </p>
            </div>

            {modalidadeStr && (
              <div>
                <span className="font-mono text-xs font-bold text-[var(--text-secondary)] uppercase">
                  Modalidade
                </span>
                <p className="font-display font-medium text-[var(--text-primary)] capitalize">
                  {modalidadeStr}
                </p>
              </div>
            )}
          </div>

          {/* Botão de Check-in Instantâneo se agendada */}
          {sessao.estado === "agendada" && podeGerir && (
            <div className="rounded-[var(--radius-control)] border-2 border-black bg-[#e6f4f1] p-4 shadow-[2px_2px_0_#000]">
              <span className="font-mono text-xs font-bold text-[#0a5c54] uppercase">
                Ação Rápida de Recepção
              </span>
              <p className="font-body mt-1 text-xs text-[#0a5c54]/80">
                Confirme a chegada do paciente para liberar a ficha de
                atendimento.
              </p>
              <div className="mt-3">
                <CheckInButton sessionId={sessao.id} />
              </div>
            </div>
          )}

          {/* Formulário de Gestão de Estado da Sessão */}
          {podeGerir && (
            <div className="space-y-3 border-t-2 border-black pt-4">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)] uppercase">
                Gerenciar Status da Sessão
              </h3>
              <GerirSessao sessionId={sessao.id} terapeutas={terapeutas} />
            </div>
          )}
        </div>

        {/* Rodapé com Atalho do Paciente */}
        <div className="mt-4 border-t-2 border-black pt-4">
          <Link href={`/pacientes/${sessao.patientId}`} passHref>
            <Button
              type="button"
              variante="neutra"
              className="font-display w-full justify-between border-2 border-black font-bold shadow-[2px_2px_0_#000]"
            >
              <span>Abrir Cadastro do Paciente</span>
              <span aria-hidden="true">→</span>
            </Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}
