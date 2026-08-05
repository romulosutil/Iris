"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { CalendarEventCard } from "./calendar-event-card";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";

export type CalendarGridMode = "daily-resources" | "weekly-timeline" | "availability-matrix";

export interface ResourceColumn {
  id: string;
  nome: string;
  subtitulo?: string;
}

export interface CalendarGridProps {
  modo: CalendarGridMode;
  sessoes?: SessaoDoDia[];
  recursos?: ResourceColumn[];
  diasSemana?: { dataISO: string; rotulo: string; diaSemana: number }[];
  abertura?: string;
  fechamento?: string;
  passoMin?: number;
  celulasSelecionadas?: Set<string>;
  onCelulasChange?: (celulas: Set<string>) => void;
  onSlotClick?: (recursoId: string, horarioStr: string, diaSemana?: number) => void;
  onEventClick?: (sessao: SessaoDoDia) => void;
  podeGerir?: boolean;
}

function horaParaMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function minParaHora(m: number): string {
  const hh = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function gerarHorarios(abertura: string, fechamento: string, passoMin: number): string[] {
  const inicio = horaParaMin(abertura);
  const fim = horaParaMin(fechamento);
  const slots: string[] = [];
  for (let m = inicio; m <= fim; m += passoMin) {
    slots.push(minParaHora(m));
  }
  return slots;
}

function obterHorarioSlot(quando: Date, passoMin: number): string {
  const str = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(quando));
  const [hhStr, mmStr] = str.split(":");
  const hh = parseInt(hhStr ?? "0", 10);
  const mm = parseInt(mmStr ?? "0", 10);
  const totalMin = hh * 60 + mm;
  const slotMin = Math.floor(totalMin / passoMin) * passoMin;
  return minParaHora(slotMin);
}

const DIAS_PADRAO = [
  { rotulo: "Segunda", diaSemana: 1 },
  { rotulo: "Terça", diaSemana: 2 },
  { rotulo: "Quarta", diaSemana: 3 },
  { rotulo: "Quinta", diaSemana: 4 },
  { rotulo: "Sexta", diaSemana: 5 },
  { rotulo: "Sábado", diaSemana: 6 },
  { rotulo: "Domingo", diaSemana: 0 },
];

export function CalendarGrid({
  modo,
  sessoes = [],
  recursos = [],
  diasSemana,
  abertura = "07:00",
  fechamento = "20:00",
  passoMin = 60,
  celulasSelecionadas,
  onCelulasChange,
  onSlotClick,
  onEventClick,
  podeGerir = true,
}: CalendarGridProps) {
  const horarios = React.useMemo(
    () => gerarHorarios(abertura, fechamento, passoMin),
    [abertura, fechamento, passoMin]
  );

  const mapaSessoes = React.useMemo(() => {
    const map = new Map<string, SessaoDoDia[]>();
    for (const s of sessoes) {
      const h = obterHorarioSlot(s.agendadaPara, passoMin);
      const rId = s.terapeutaId ?? "sem-terapeuta";
      const dt = new Date(s.agendadaPara);
      const diaSemana = dt.getDay();

      const key = modo === "daily-resources" ? `${rId}_${h}` : `${diaSemana}_${h}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessoes, passoMin, modo]);

  const recursosVisiveis = React.useMemo(() => {
    if (recursos.length > 0) return recursos;
    const idsUnicos = Array.from(new Set(sessoes.map((s) => s.terapeutaId ?? "sem-terapeuta")));
    return idsUnicos.map((id) => {
      const sessao = sessoes.find((s) => s.terapeutaId === id);
      return { id, nome: sessao?.terapeutaNome ?? "Profissional não atribuído" };
    });
  }, [recursos, sessoes]);

  function toggleMatrizCelula(diaSemana: number, horarioStr: string) {
    if (!celulasSelecionadas || !onCelulasChange) return;
    const chave = `${diaSemana}_${horarioStr}`;
    const novoSet = new Set(celulasSelecionadas);
    if (novoSet.has(chave)) {
      novoSet.delete(chave);
    } else {
      novoSet.add(chave);
    }
    onCelulasChange(novoSet);
  }

  // RENDERIZAÇÃO: Modo 1 - Diário Multi-Recurso (Vertical Hours, Horizontal Resources)
  if (modo === "daily-resources") {
    return (
      <div
        role="grid"
        aria-label="Grade de Agenda Geral da Clínica"
        className="w-full overflow-x-auto overflow-y-auto max-h-[75vh] rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] shadow-[var(--elevation-2)] touch-pan-x touch-pan-y"
      >
        <table className="w-full border-collapse text-left min-w-[650px] sm:min-w-[700px]">
          <thead className="sticky top-0 z-20 bg-[var(--surface-elevated,#ffffff)] border-b-2 border-black">
            <tr role="row">
              <th className="sticky left-0 z-30 w-20 sm:w-24 p-2 sm:p-3 bg-[var(--surface-elevated,#ffffff)] border-r-2 border-black font-display text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Horário
              </th>
              {recursosVisiveis.map((r) => {
                const sessoesRecurso = sessoes.filter((s) => s.terapeutaId === r.id);
                const concluidas = sessoesRecurso.filter((s) => s.estado === "realizada").length;
                return (
                  <th key={r.id} className="p-2 sm:p-3 border-r-2 border-black min-w-[180px] sm:min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-black bg-[#f2b705] font-display text-xs font-bold shrink-0">
                        {r.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-display text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                          {r.nome}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--text-secondary)] truncate">
                          {sessoesRecurso.length} sessões ({concluidas} ok)
                        </p>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {horarios.map((h) => (
              <tr key={h} className="border-b border-gray-300 hover:bg-gray-50/50">
                <td className="sticky left-0 z-10 w-20 sm:w-24 p-2 sm:p-3 bg-[var(--surface-card,#ffffff)] border-r-2 border-black font-mono text-xs font-bold text-[var(--text-primary)]">
                  {h}
                </td>
                {recursosVisiveis.map((r) => {
                  const key = `${r.id}_${h}`;
                  const sessoesSlot = mapaSessoes.get(key) ?? [];
                  return (
                    <td
                      key={r.id}
                      onClick={() => {
                        if (sessoesSlot.length === 0) {
                          onSlotClick?.(r.id, h);
                        }
                      }}
                      className={cn(
                        "p-1.5 sm:p-2 border-r-2 border-black align-top transition-colors min-h-[56px] min-w-[180px] sm:min-w-[220px]",
                        sessoesSlot.length === 0 && "cursor-pointer hover:bg-[#fff6db]/30"
                      )}
                    >
                      <div className="space-y-1.5">
                        {sessoesSlot.map((s) => (
                          <CalendarEventCard
                            key={s.id}
                            id={s.id}
                            pacienteNome={s.pacienteNome ?? "Paciente"}
                            disciplinaNome={s.disciplina}
                            horarioStr={obterHorarioSlot(s.agendadaPara, passoMin)}
                            estado={s.estado}
                            onClick={() => onEventClick?.(s)}
                            podeGerir={podeGerir}
                          />
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // RENDERIZAÇÃO: Modo 2 & 3 - Semanal / Matriz de Disponibilidade (Vertical Days, Horizontal Hours)
  const listaDias = diasSemana ?? DIAS_PADRAO.map((d) => ({ dataISO: "", rotulo: d.rotulo, diaSemana: d.diaSemana }));

  return (
    <div
      role="grid"
      aria-label="Grade Semanal de Agendamentos"
      className="w-full overflow-x-auto overflow-y-auto max-h-[75vh] rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] shadow-[var(--elevation-2)] touch-pan-x touch-pan-y"
    >
      <table className="w-full border-collapse text-left min-w-[700px] sm:min-w-[800px]">
        <thead className="sticky top-0 z-20 bg-[var(--surface-elevated,#ffffff)] border-b-2 border-black">
          <tr role="row">
            <th className="sticky left-0 z-30 w-24 sm:w-32 p-2 sm:p-3 bg-[var(--surface-elevated,#ffffff)] border-r-2 border-black font-display text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Dia / Data
            </th>
            {horarios.map((h) => (
              <th key={h} className="p-2 sm:p-3 border-r border-gray-300 min-w-[75px] sm:min-w-[90px] text-center font-mono text-xs font-bold text-[var(--text-primary)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {listaDias.map((d, idx) => (
            <tr key={`${d.diaSemana}-${d.rotulo}-${idx}`} className="border-b border-gray-300">
              <td className="sticky left-0 z-10 w-24 sm:w-32 p-2 sm:p-3 bg-[var(--surface-card,#ffffff)] border-r-2 border-black font-display text-xs font-bold text-[var(--text-primary)]">
                <div>{d.rotulo}</div>
                {d.dataISO && (
                  <div className="font-mono text-[10px] text-[var(--text-secondary)]">{d.dataISO}</div>
                )}
              </td>
              {horarios.map((h) => {
                const key = `${d.diaSemana}_${h}`;
                const sessoesSlot = mapaSessoes.get(key) ?? [];
                const selecionadaMatriz = celulasSelecionadas?.has(key);

                if (modo === "availability-matrix") {
                  return (
                    <td
                      key={h}
                      onClick={() => toggleMatrizCelula(d.diaSemana, h)}
                      className={cn(
                        "p-2 border-r border-gray-300 text-center cursor-pointer transition-all min-h-[44px]",
                        selecionadaMatriz
                          ? "bg-[#f2b705] border-2 border-black shadow-[1px_1px_0_#000]"
                          : "hover:bg-[#fff6db]/40"
                      )}
                    >
                      {selecionadaMatriz && <span className="font-mono text-xs font-bold">✓</span>}
                    </td>
                  );
                }

                return (
                  <td
                    key={h}
                    onClick={() => {
                      if (sessoesSlot.length === 0) {
                        onSlotClick?.("", h, d.diaSemana);
                      }
                    }}
                    className={cn(
                      "p-1 sm:p-1.5 border-r border-gray-300 align-top transition-colors min-h-[50px]",
                      sessoesSlot.length === 0 && "cursor-pointer hover:bg-[#fff6db]/30"
                    )}
                  >
                    <div className="space-y-1">
                      {sessoesSlot.map((s) => (
                        <CalendarEventCard
                          key={s.id}
                          id={s.id}
                          pacienteNome={s.pacienteNome ?? "Paciente"}
                          disciplinaNome={s.disciplina}
                          estado={s.estado}
                          variante="compacta"
                          onClick={() => onEventClick?.(s)}
                          podeGerir={podeGerir}
                        />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
