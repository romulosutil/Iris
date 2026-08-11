"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/primitives/pill";
import { SparkleIcon, CheckIcon, ClockIcon } from "@/components/ui/icon";

export type SessionSemanticStatus =
  | "concluida"
  | "em_andamento"
  | "sugerida_ia"
  | "agendada"
  | "cancelada";

export interface AgendaSessaoItem {
  id: string;
  agendadaPara: Date | string;
  duracaoMin?: number;
  estado?: string;
  statusSemantico?: SessionSemanticStatus;
  terapeutaId: string;
  terapeutaNome?: string | null;
  pacienteNome?: string | null;
  disciplina?: string;
  modalidade?: string;
  isAISuggestion?: boolean;
}

export interface AgendaCalendarGridProps {
  sessoes: AgendaSessaoItem[];
  terapeutas: { id: string; nome: string; disciplina?: string }[];
  view?: "day" | "week";
  dataReferencia?: Date | string;
  role?: string;
  userId?: string;
  podeGerir?: boolean;
  abertura?: string; // Ex: "07:00"
  fechamento?: string; // Ex: "19:00"
  passoMin?: number; // Ex: 60 ou 30
  onSlotClick?: (terapeutaId: string, horario: string) => void;
  onSessaoClick?: (sessao: AgendaSessaoItem) => void;
  className?: string;
}

function parseHora(horarioStr: string): number {
  const [h, m] = horarioStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function resolverStatusSemantico(sessao: AgendaSessaoItem): SessionSemanticStatus {
  if (sessao.statusSemantico) return sessao.statusSemantico;
  if (sessao.isAISuggestion) return "sugerida_ia";
  if (sessao.estado === "realizada") return "concluida";
  if (sessao.estado === "em_andamento") return "em_andamento";
  if (sessao.estado === "cancelada" || sessao.estado === "falta") return "cancelada";
  return "agendada";
}

/**
 * AgendaCalendarGrid — Grade de Horários da Agenda Clínica (Fases 1 e 3).
 * Suporta visualização diária e semanal, slots compactos <30min, colisão visual e estados de IA.
 */
export function AgendaCalendarGrid({
  sessoes,
  terapeutas,
  view = "day",
  dataReferencia = new Date(),
  abertura = "08:00",
  fechamento = "18:00",
  passoMin = 60,
  onSlotClick,
  onSessaoClick,
  className,
}: AgendaCalendarGridProps) {
  const refDate = React.useMemo(
    () => (typeof dataReferencia === "string" ? new Date(dataReferencia) : dataReferencia),
    [dataReferencia],
  );

  const horaInicioMin = parseHora(abertura);
  const horaFimMin = parseHora(fechamento);

  const slotsHorarios = React.useMemo(() => {
    const slots: string[] = [];
    for (let m = horaInicioMin; m < horaFimMin; m += passoMin) {
      slots.push(formatHora(m));
    }
    return slots;
  }, [horaInicioMin, horaFimMin, passoMin]);

  // Agrupamento por terapeuta
  const sessoesPorTerapeuta = React.useMemo(() => {
    const map = new Map<string, AgendaSessaoItem[]>();
    for (const t of terapeutas) {
      map.set(t.id, []);
    }
    for (const s of sessoes) {
      const list = map.get(s.terapeutaId);
      if (list) {
        list.push(s);
      } else {
        map.set(s.terapeutaId, [s]);
      }
    }
    return map;
  }, [sessoes, terapeutas]);

  const dataFormatada = React.useMemo(() => {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(refDate);
  }, [refDate]);

  if (terapeutas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-control)] border-2 border-dashed border-border-brutal p-8 text-center bg-surface-card">
        <p className="font-display font-semibold text-text-primary">Nenhum profissional cadastrado.</p>
        <p className="text-xs text-text-secondary mt-1">Cadastre terapeutas na aba Equipe para visualizar a grade.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3 font-body", className)}>
      {/* Cabeçalho da grade */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-brutal/30 pb-2">
        <div>
          <h3 className="font-display text-base font-bold capitalize text-text-primary">
            {dataFormatada}
          </h3>
          <span className="text-xs text-text-secondary">
            Visão {view === "day" ? "Diária (1 coluna/recurso)" : "Semanal Multi-recurso"} · {slotsHorarios.length} horários
          </span>
        </div>
      </div>

      {/* Grade com rolagem horizontal no mobile */}
      <div className="overflow-x-auto rounded-[var(--radius-control)] border-2 border-border-brutal bg-surface-card shadow-[var(--ds-shadow)]">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `80px repeat(${terapeutas.length}, minmax(160px, 1fr))`,
          }}
        >
          {/* Header row: Horário + Terapeutas */}
          <div className="sticky top-0 z-10 flex min-h-11 items-center justify-center border-b-2 border-r-2 border-border-brutal bg-surface-elevated font-mono text-xs font-bold uppercase text-text-secondary">
            Hora
          </div>

          {terapeutas.map((t) => (
            <div
              key={t.id}
              className="sticky top-0 z-10 flex min-h-11 flex-col justify-center border-b-2 border-r border-border-brutal bg-surface-elevated px-3 py-1 text-left"
            >
              <span className="truncate font-display text-xs font-bold text-text-primary" title={t.nome}>
                {t.nome}
              </span>
              {t.disciplina && (
                <span className="truncate font-mono text-[10px] uppercase text-text-secondary" title={t.disciplina}>
                  {t.disciplina}
                </span>
              )}
            </div>
          ))}

          {/* Linhas de Horário */}
          {slotsHorarios.map((slot) => {
            const slotMin = parseHora(slot);

            return (
              <React.Fragment key={slot}>
                {/* Coluna de Horário */}
                <div className="flex min-h-11 items-center justify-center border-b border-r-2 border-border-brutal/40 bg-surface-elevated/30 font-mono text-xs font-semibold text-text-secondary">
                  {slot}
                </div>

                {/* Células para cada terapeuta no horário */}
                {terapeutas.map((t) => {
                  const sessoesTerapeuta = sessoesPorTerapeuta.get(t.id) ?? [];
                  const sessoesNoSlot = sessoesTerapeuta.filter((s) => {
                    const d = typeof s.agendadaPara === "string" ? new Date(s.agendadaPara) : s.agendadaPara;
                    const horaSessaoMin = d.getHours() * 60 + d.getMinutes();
                    return horaSessaoMin >= slotMin && horaSessaoMin < slotMin + passoMin;
                  });

                  const temSessoes = sessoesNoSlot.length > 0;

                  return (
                    <div
                      key={`${t.id}-${slot}`}
                      onClick={() => {
                        if (!temSessoes) onSlotClick?.(t.id, slot);
                      }}
                      className={cn(
                        "relative flex min-h-11 flex-col gap-1 border-b border-r border-border-brutal/20 p-1 transition-colors",
                        !temSessoes && "cursor-pointer hover:bg-surface-elevated/40",
                      )}
                    >
                      {sessoesNoSlot.map((sessao) => {
                        const status = resolverStatusSemantico(sessao);
                        const duracao = sessao.duracaoMin ?? 50;
                        const isCurto = duracao < 30;

                        // Estilos semânticos do bloco
                        let blockStyle = "bg-surface-card border-border-brutal text-text-primary";
                        let statusIcon = <ClockIcon size={12} />;

                        if (status === "concluida") {
                          blockStyle = "bg-status-success-bg border-border-brutal text-status-success-fg font-medium";
                          statusIcon = <CheckIcon size={12} />;
                        } else if (status === "em_andamento") {
                          blockStyle = "bg-status-warning-bg border-border-brutal shadow-[2px_2px_0px_#1A1A1A] text-status-warning-fg font-bold";
                          statusIcon = <ClockIcon size={12} />;
                        } else if (status === "sugerida_ia") {
                          blockStyle = "bg-status-ia-bg/25 border-dashed border-status-ia-border text-status-ia-fg";
                          statusIcon = <SparkleIcon size={12} />;
                        }

                        return (
                          <button
                            key={sessao.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSessaoClick?.(sessao);
                            }}
                            className={cn(
                              "group relative w-full text-left rounded border p-1.5 transition-all select-none",
                              "min-h-11 min-w-11",
                              "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
                              "hover:-translate-x-px hover:-translate-y-px",
                              blockStyle,
                              isCurto ? "flex items-center gap-1.5 py-0.5" : "flex flex-col gap-0.5",
                            )}
                          >
                            <div className="flex w-full items-center justify-between gap-1">
                              <span
                                className="truncate text-xs font-bold text-text-primary"
                                title={sessao.pacienteNome ?? "Paciente"}
                              >
                                {sessao.pacienteNome ?? "Paciente"}
                              </span>
                              <span className="shrink-0">{statusIcon}</span>
                            </div>

                            {!isCurto && (
                              <div className="flex items-center justify-between gap-1 text-[10px] text-text-secondary">
                                <span className="truncate" title={sessao.disciplina ?? ""}>
                                  {sessao.disciplina ?? "Atendimento"}
                                </span>
                                {status === "sugerida_ia" && (
                                  <Pill variant="inset" colorScheme="violeta" size="sm">
                                    IA
                                  </Pill>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
