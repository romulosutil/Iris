"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { SparkleIcon, CheckIcon, ClockIcon } from "./icon";
import { control } from "./primitives/surface";

// Loosely typed SessaoDoDia for ultimate flexibility and 100% compatibility
export type SessaoDoDia = {
  id: string;
  pacienteNome?: string | null;
  terapeutaId?: string | null;
  terapeutaNome?: string | null;
  agendadaPara: Date;
  disciplina: string;
  estado: string;
  duracaoMinutos?: number;
  [key: string]: any; // Allow arbitrary fields
};

export interface AppointmentEvent {
  id: string;
  pacienteNome: string;
  disciplina: string;
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM"
  data: string; // "YYYY-MM-DD"
  estado: "concluido" | "em-andamento" | "sugerido";
}

export interface AgendaCalendarGridProps {
  // New props
  events?: AppointmentEvent[];
  selectedDate?: Date;
  view?: "day" | "week";
  onEventClick?: (event: AppointmentEvent) => void;
  className?: string;

  // Legacy compatibility props
  sessoes?: SessaoDoDia[];
  terapeutas?: { id: string; nome: string }[];
  role?: string;
  userId?: string;
  podeGerir?: boolean;
  onSlotClick?: (terapeutaId: string, horario: string) => void;
}

// Convert "HH:MM" to minutes from midnight safely
function parseTimeToMinutes(timeStr: string): number {
  const parts = (timeStr || "00:00").split(":");
  const h = parts[0] ? Number(parts[0]) : 0;
  const m = parts[1] ? Number(parts[1]) : 0;
  return h * 60 + m;
}

export function AgendaCalendarGrid({
  events,
  selectedDate = new Date("2026-07-13"), // Default anchor date for clinical dev
  view = "week",
  onEventClick,
  className,

  // Legacy props
  sessoes,
  terapeutas,
  role,
  userId,
  podeGerir,
  onSlotClick,
}: AgendaCalendarGridProps) {
  // Focus ring class
  const focusRing = "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-[#2274A5] outline-none";

  // Convert legacy sessoes to events if provided
  const resolvedEvents = React.useMemo(() => {
    if (events && events.length > 0) return events;
    if (!sessoes) return [];

    return sessoes.map((s) => {
      const dateObj = new Date(s.agendadaPara);

      // Calculate start HH:MM in America/Sao_Paulo
      const formatTime = (d: Date) => {
        const str = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
        }).format(d);
        const parts = str.split(":");
        return `${parts[0] || "08"}:${parts[1] || "00"}`;
      };

      const inicioStr = formatTime(dateObj);
      const duracaoMinutos = s.duracaoMinutos ?? 60;

      // Calculate end date
      const endDateObj = new Date(dateObj.getTime() + duracaoMinutos * 60 * 1000);
      const fimStr = formatTime(endDateObj);

      // YYYY-MM-DD in America/Sao_Paulo
      const datePartsStr = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dateObj); // returns DD/MM/YYYY or DD-MM-YYYY depending on environment
      const dateParts = datePartsStr.includes("/") ? datePartsStr.split("/") : datePartsStr.split("-");
      const dataStr = `${dateParts[2] || "2026"}-${dateParts[1] || "07"}-${dateParts[0] || "13"}`;

      let estado: "concluido" | "em-andamento" | "sugerido" = "sugerido";
      if (s.estado === "realizada") {
        estado = "concluido";
      } else if (s.estado === "agendada") {
        estado = "em-andamento";
      }

      return {
        id: s.id,
        pacienteNome: s.pacienteNome ?? "Acesso Restrito",
        disciplina: s.disciplina,
        inicio: inicioStr,
        fim: fimStr,
        data: dataStr,
        estado,
      } as AppointmentEvent;
    });
  }, [events, sessoes]);

  // Days of the week to display (Monday to Friday)
  const getWeekDays = (anchor: Date) => {
    const days: Date[] = [];
    const dayOfWeek = anchor.getDay(); // 0 is Sunday
    // Calculate Monday of the current week
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + mondayOffset);

    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = React.useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const activeDays = React.useMemo(() => view === "day" ? [selectedDate] : weekDays, [view, selectedDate, weekDays]);

  // Grid Hours from 08:00 to 18:00
  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8 to 18
  const startMinutes = 8 * 60; // 480 min
  const endMinutes = 18 * 60; // 1080 min
  const totalMinutes = endMinutes - startMinutes; // 600 min

  // Format date native helpers
  const formatDayName = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date);
  };

  const formatDayNum = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", { day: "numeric" }).format(date);
  };

  const formatFullDate = (date: Date) => {
    return date.toISOString().split("T")[0];
  };

  // Group events by date and process overlaps
  const positionedEvents = React.useMemo(() => {
    const result: (AppointmentEvent & {
      top: number;
      height: number;
      widthPercent: number;
      leftPercent: number;
      isCompact: boolean;
    })[] = [];

    // Filter events to active days
    const activeDatesStrs = activeDays.map(formatFullDate);
    const dayEvents = resolvedEvents.filter((e) => activeDatesStrs.includes(e.data));

    // Group events by day to calculate collisions per day
    const eventsByDay: Record<string, AppointmentEvent[]> = {};
    dayEvents.forEach((e) => {
      if (!eventsByDay[e.data]) {
        eventsByDay[e.data] = [];
      }
      eventsByDay[e.data]?.push(e);
    });

    Object.keys(eventsByDay).forEach((dayStr) => {
      const dayEvs = eventsByDay[dayStr] || [];
      // Sort by start time
      dayEvs.sort((a, b) => parseTimeToMinutes(a.inicio) - parseTimeToMinutes(b.inicio));

      // Resolve collision overlaps (using interval graph coloring approach)
      const columns: AppointmentEvent[][] = [];
      dayEvs.forEach((ev) => {
        let placed = false;
        const evStart = parseTimeToMinutes(ev.inicio);

        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
          const colEvents = columns[colIdx] || [];
          const lastInCol = colEvents[colEvents.length - 1];
          if (lastInCol) {
            const lastEnd = parseTimeToMinutes(lastInCol.fim);
            if (evStart >= lastEnd) {
              colEvents.push(ev);
              placed = true;
              break;
            }
          }
        }

        if (!placed) {
          columns.push([ev]);
        }
      });

      // Calculate width and left offsets based on columns
      const totalColumns = columns.length;
      columns.forEach((col, colIdx) => {
        col.forEach((ev) => {
          const evStart = parseTimeToMinutes(ev.inicio);
          const evEnd = parseTimeToMinutes(ev.fim);
          const duration = evEnd - evStart;

          // Calculate top and height percentage relative to grid
          const topPercent = ((evStart - startMinutes) / totalMinutes) * 100;
          const heightPercent = (duration / totalMinutes) * 100;

          // Compact layout for slots < 30min
          const isCompact = duration < 30;

          result.push({
            ...ev,
            top: Math.max(0, topPercent),
            height: Math.max(8, heightPercent), // minimum height for touch/text
            widthPercent: 100 / totalColumns,
            leftPercent: colIdx * (100 / totalColumns),
            isCompact,
          });
        });
      });
    });

    return result;
  }, [resolvedEvents, activeDays, startMinutes, totalMinutes]);

  const handleEventClick = (ev: AppointmentEvent) => {
    if (onEventClick) {
      onEventClick(ev);
    } else if (onSlotClick && sessoes) {
      // Find matching session and trigger legacy callback
      const originalSession = sessoes.find((s) => s.id === ev.id);
      if (originalSession && originalSession.terapeutaId) {
        onSlotClick(originalSession.terapeutaId, ev.inicio);
      }
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col w-full border-[3px] border-black bg-white rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] overflow-hidden",
        className
      )}
    >
      {/* Header do Calendário */}
      <div className="flex items-center justify-between p-4 bg-black text-white border-b-[3px] border-black">
        <h2 className="font-display font-black text-lg sm:text-xl uppercase tracking-wide">
          {view === "day" ? "Agenda do Dia" : "Agenda Semanal"}
        </h2>
        <span className="font-mono text-sm bg-zinc-800 px-3 py-1 border border-zinc-700 rounded-sm">
          {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(selectedDate)}
        </span>
      </div>

      {/* Grid Container */}
      <div className="flex flex-1 overflow-x-auto">
        {/* Coluna de Horários (Timeline) */}
        <div className="w-16 sm:w-20 border-r-2 border-black flex flex-col shrink-0 bg-gray-50 select-none">
          {/* Header empty space corner */}
          <div className="h-12 border-b-2 border-black flex items-center justify-center font-mono text-[10px] text-gray-400 font-bold uppercase">
            Hora
          </div>
          <div className="relative flex-1 h-[500px]">
            {hours.map((hour) => {
              const topPercent = (((hour * 60) - startMinutes) / totalMinutes) * 100;
              return (
                <div
                  key={hour}
                  style={{ top: `${topPercent}%` }}
                  className="absolute left-0 right-0 -translate-y-1/2 text-right pr-2 sm:pr-3"
                >
                  <span className="font-mono text-xs font-black text-black">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Colunas dos Dias */}
        <div className="flex-1 grid grid-cols-1 md:grid-flow-col auto-cols-fr min-w-[280px]">
          {activeDays.map((day) => {
            const dayStr = formatFullDate(day);
            const dayEvs = positionedEvents.filter((e) => e.data === dayStr);

            return (
              <div
                key={dayStr}
                className={cn(
                  "flex flex-col relative border-r-2 border-black last:border-r-0",
                  view === "day" ? "w-full" : ""
                )}
              >
                {/* Header do Dia */}
                <div className="h-12 border-b-2 border-black flex flex-col items-center justify-center bg-gray-50 py-1">
                  <span className="font-display font-black text-xs uppercase text-gray-500">
                    {formatDayName(day)}
                  </span>
                  <span className="font-mono font-bold text-sm text-black">
                    {formatDayNum(day)}
                  </span>
                </div>

                {/* Bloco de Horários com os Eventos Absolutos */}
                <div className="relative flex-1 h-[500px] bg-white bg-[radial-gradient(#e5e7eb_1.5px,transparent_1.5px)] [background-size:16px_16px]">
                  {/* Linhas de grade horizontais */}
                  {hours.map((hour) => {
                    const topPercent = (((hour * 60) - startMinutes) / totalMinutes) * 100;
                    return (
                      <div
                        key={hour}
                        style={{ top: `${topPercent}%` }}
                        className="absolute left-0 right-0 border-t border-gray-200 pointer-events-none"
                      />
                    );
                  })}

                  {/* Renderização dos Eventos */}
                  {dayEvs.map((ev) => {
                    // Determinação do estilo semântico
                    let stateClasses = "";
                    let Icon = ClockIcon;

                    if (ev.estado === "concluido") {
                      stateClasses = "bg-[#B2DFDB] text-[#1A1A1A] border-solid border-2 border-black";
                      Icon = CheckIcon;
                    } else if (ev.estado === "em-andamento") {
                      stateClasses = "bg-[#F2B705] text-black border-2 border-black shadow-[3px_3px_0px_#1A1A1A]";
                      Icon = ClockIcon;
                    } else {
                      // sugerido
                      stateClasses = "bg-[#f3e8ff] text-[#6A4C93] border-2 border-dashed border-[#6A4C93]";
                      Icon = SparkleIcon;
                    }

                    return (
                      <button
                        key={ev.id}
                        onClick={() => handleEventClick(ev)}
                        style={{
                          top: `${ev.top}%`,
                          height: `${ev.height}%`,
                          left: `${ev.leftPercent}%`,
                          width: `${ev.widthPercent}%`,
                        }}
                        className={cn(
                          control("sm"), // Alvo de toque >= 44px
                          "absolute p-2 flex overflow-hidden rounded-[var(--radius-sm)] transition-all",
                          "hover:scale-[1.01] hover:z-20 cursor-pointer text-left",
                          stateClasses,
                          focusRing
                        )}
                        title={`${ev.pacienteNome} - ${ev.disciplina} (${ev.inicio} - ${ev.fim})`}
                      >
                        {ev.isCompact ? (
                          /* Slots Curtos < 30min: Layout compacto flex-row */
                          <div className="flex flex-row items-center justify-between w-full h-full gap-2 text-xs font-bold leading-none">
                            <span className="truncate flex-1" title={ev.pacienteNome}>
                              {ev.pacienteNome} <span className="font-normal opacity-75">({ev.disciplina})</span>
                            </span>
                            <span className="shrink-0 flex items-center gap-1">
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-mono text-[10px]">{ev.inicio}</span>
                            </span>
                          </div>
                        ) : (
                          /* Slots Normais >= 30min: Layout vertical */
                          <div className="flex flex-col h-full w-full justify-between gap-1 text-xs">
                            <div className="flex flex-col leading-tight min-h-0">
                              <span className="font-black truncate block text-sm" title={ev.pacienteNome}>
                                {ev.pacienteNome}
                              </span>
                              <span className="font-mono text-[10px] font-bold opacity-80 uppercase tracking-wide truncate block" title={ev.disciplina}>
                                {ev.disciplina}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-black/10 shrink-0">
                              <span className="font-mono text-[10px] font-bold">
                                {ev.inicio} - {ev.fim}
                              </span>
                              <Icon className="h-4 w-4 shrink-0" />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
