"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/primitives/pill";
import { SparkleIcon, CheckIcon, ClockIcon } from "@/components/ui/icon";

export type SessionSemanticStatus =
  "concluida" | "em_andamento" | "sugerida_ia" | "agendada" | "cancelada";

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
  dataReferencia?: Date | string;
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

function resolverStatusSemantico(
  sessao: AgendaSessaoItem,
): SessionSemanticStatus {
  if (sessao.statusSemantico) return sessao.statusSemantico;
  if (sessao.isAISuggestion) return "sugerida_ia";
  if (sessao.estado === "realizada") return "concluida";
  if (sessao.estado === "em_andamento") return "em_andamento";
  if (sessao.estado === "cancelada" || sessao.estado === "falta")
    return "cancelada";
  return "agendada";
}

/**
 * AgendaCalendarGrid — Grade de Horários da Agenda Clínica (Fases 1 e 3).
 * Grade diária de um dia (coluna por recurso), slots compactos <30min, colisão visual e estados de IA.
 */
export function AgendaCalendarGrid({
  sessoes,
  terapeutas,
  dataReferencia = new Date(),
  abertura = "08:00",
  fechamento = "18:00",
  passoMin = 60,
  onSlotClick,
  onSessaoClick,
  className,
}: AgendaCalendarGridProps) {
  const refDate = React.useMemo(
    () =>
      typeof dataReferencia === "string"
        ? new Date(dataReferencia)
        : dataReferencia,
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

  // Pré-bucketing por célula (terapeuta × slot): cada sessão é parseada e
  // classificada uma única vez, em vez de refiltrar a lista inteira por célula
  // a cada render (O(slots × terapeutas × sessões)).
  const sessoesPorCelula = React.useMemo(() => {
    const map = new Map<string, AgendaSessaoItem[]>();
    for (const s of sessoes) {
      const d =
        typeof s.agendadaPara === "string"
          ? new Date(s.agendadaPara)
          : s.agendadaPara;
      const minutoSessao = d.getHours() * 60 + d.getMinutes();
      if (minutoSessao < horaInicioMin) continue;
      const inicioSlot =
        horaInicioMin +
        Math.floor((minutoSessao - horaInicioMin) / passoMin) * passoMin;
      if (inicioSlot >= horaFimMin) continue; // fora dos slots gerados
      const chave = `${s.terapeutaId}|${formatHora(inicioSlot)}`;
      const list = map.get(chave);
      if (list) {
        list.push(s);
      } else {
        map.set(chave, [s]);
      }
    }
    return map;
  }, [sessoes, horaInicioMin, horaFimMin, passoMin]);

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
      <div className="border-border-brutal bg-surface-card flex flex-col items-center justify-center rounded-[var(--radius-control)] border-2 border-dashed p-8 text-center">
        <p className="font-display text-text-primary font-semibold">
          Nenhum profissional cadastrado.
        </p>
        <p className="text-text-secondary mt-1 text-xs">
          Cadastre terapeutas na aba Equipe para visualizar a grade.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("font-body flex flex-col gap-3", className)}>
      {/* Cabeçalho da grade */}
      <div className="border-border-brutal/30 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div>
          <h3 className="font-display text-text-primary text-base font-bold capitalize">
            {dataFormatada}
          </h3>
          <span className="text-text-secondary text-xs">
            Visão diária (1 coluna/recurso) · {slotsHorarios.length} horários
          </span>
        </div>
      </div>

      {/* Grade com rolagem horizontal no mobile */}
      <div className="border-border-brutal bg-surface-card overflow-x-auto rounded-[var(--radius-control)] border-2 shadow-[var(--ds-shadow)]">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `80px repeat(${terapeutas.length}, minmax(160px, 1fr))`,
          }}
        >
          {/* Header row: Horário + Terapeutas */}
          <div className="border-border-brutal bg-surface-elevated text-text-secondary sticky top-0 z-10 flex min-h-11 items-center justify-center border-r-2 border-b-2 font-mono text-xs font-bold uppercase">
            Hora
          </div>

          {terapeutas.map((t) => (
            <div
              key={t.id}
              className="border-border-brutal bg-surface-elevated sticky top-0 z-10 flex min-h-11 flex-col justify-center border-r border-b-2 px-3 py-1 text-left"
            >
              <span
                className="font-display text-text-primary truncate text-xs font-bold"
                title={t.nome}
              >
                {t.nome}
              </span>
              {t.disciplina && (
                <span
                  className="text-text-secondary truncate font-mono text-[10px] uppercase"
                  title={t.disciplina}
                >
                  {t.disciplina}
                </span>
              )}
            </div>
          ))}

          {/* Linhas de Horário */}
          {slotsHorarios.map((slot) => {
            return (
              <React.Fragment key={slot}>
                {/* Coluna de Horário */}
                <div className="border-border-brutal/40 bg-surface-elevated/30 text-text-secondary flex min-h-11 items-center justify-center border-r-2 border-b font-mono text-xs font-semibold">
                  {slot}
                </div>

                {/* Células para cada terapeuta no horário */}
                {terapeutas.map((t) => {
                  const sessoesNoSlot =
                    sessoesPorCelula.get(`${t.id}|${slot}`) ?? [];
                  const temSessoes = sessoesNoSlot.length > 0;
                  const slotClicavel = !temSessoes && Boolean(onSlotClick);

                  return (
                    <div
                      key={`${t.id}-${slot}`}
                      onClick={
                        slotClicavel
                          ? () => onSlotClick?.(t.id, slot)
                          : undefined
                      }
                      className={cn(
                        "border-border-brutal/20 relative flex min-h-11 flex-col gap-1 border-r border-b p-1 transition-colors",
                        slotClicavel &&
                          "hover:bg-surface-elevated/40 cursor-pointer",
                      )}
                    >
                      {sessoesNoSlot.map((sessao) => {
                        const status = resolverStatusSemantico(sessao);
                        const duracao = sessao.duracaoMin ?? 50;
                        const isCurto = duracao < 30;

                        // Estilos semânticos do bloco
                        let blockStyle =
                          "bg-surface-card border-border-brutal text-text-primary";
                        let statusIcon = <ClockIcon size={12} />;

                        if (status === "concluida") {
                          blockStyle =
                            "bg-status-success-bg border-border-brutal text-status-success-fg font-medium";
                          statusIcon = <CheckIcon size={12} />;
                        } else if (status === "em_andamento") {
                          blockStyle =
                            "bg-status-warning-bg border-border-brutal shadow-[2px_2px_0px_#1A1A1A] text-status-warning-fg font-bold";
                          statusIcon = <ClockIcon size={12} />;
                        } else if (status === "sugerida_ia") {
                          blockStyle =
                            "bg-status-ia-bg/25 border-dashed border-status-ia-border text-status-ia-fg";
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
                              "group relative w-full rounded border p-1.5 text-left transition-all select-none",
                              "min-h-11 min-w-11",
                              "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
                              "hover:-translate-x-px hover:-translate-y-px",
                              blockStyle,
                              isCurto
                                ? "flex items-center gap-1.5 py-0.5"
                                : "flex flex-col gap-0.5",
                            )}
                          >
                            <div className="flex w-full items-center justify-between gap-1">
                              <span
                                className="text-text-primary truncate text-xs font-bold"
                                title={sessao.pacienteNome ?? "Paciente"}
                              >
                                {sessao.pacienteNome ?? "Paciente"}
                              </span>
                              <span className="shrink-0">{statusIcon}</span>
                            </div>

                            {!isCurto && (
                              <div className="text-text-secondary flex items-center justify-between gap-1 text-[10px]">
                                <span
                                  className="truncate"
                                  title={sessao.disciplina ?? ""}
                                >
                                  {sessao.disciplina ?? "Atendimento"}
                                </span>
                                {status === "sugerida_ia" && (
                                  <Pill
                                    variant="inset"
                                    colorScheme="violeta"
                                    size="sm"
                                  >
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
