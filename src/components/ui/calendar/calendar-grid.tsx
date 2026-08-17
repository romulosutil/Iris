"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { CalendarEventCard } from "./calendar-event-card";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";

type CalendarGridMode =
  "daily-resources" | "weekly-timeline" | "availability-matrix";

interface ResourceColumn {
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
  onSlotClick?: (
    recursoId: string,
    horarioStr: string,
    diaSemana?: number,
  ) => void;
  onEventClick?: (sessao: SessaoDoDia) => void;
  podeGerir?: boolean;
  bloqueios?: { dataInicio: string; dataFim: string }[];
}

function horaParaMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function minParaHora(m: number): string {
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function gerarHorarios(
  abertura: string,
  fechamento: string,
  passoMin: number,
): string[] {
  const inicio = horaParaMin(abertura);
  const fim = horaParaMin(fechamento);
  const slots: string[] = [];
  for (let m = inicio; m < fim; m += passoMin) {
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
  bloqueios = [],
}: CalendarGridProps) {
  const horarios = React.useMemo(
    () => gerarHorarios(abertura, fechamento, passoMin),
    [abertura, fechamento, passoMin],
  );

  const mapaSessoes = React.useMemo(() => {
    const map = new Map<string, SessaoDoDia[]>();
    for (const s of sessoes) {
      const h = obterHorarioSlot(s.agendadaPara, passoMin);
      const rId = s.terapeutaId ?? "sem-terapeuta";
      const dt = new Date(s.agendadaPara);
      const diaSemana = dt.getDay();

      const key =
        modo === "daily-resources"
          ? `${rId}_${h}`
          : modo === "availability-matrix"
            ? `${diaSemana}-${h}`
            : `${diaSemana}_${h}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessoes, passoMin, modo]);

  const recursosVisiveis = React.useMemo(() => {
    if (recursos.length > 0) return recursos;
    const idsUnicos = Array.from(
      new Set(sessoes.map((s) => s.terapeutaId ?? "sem-terapeuta")),
    );
    return idsUnicos.map((id) => {
      const sessao = sessoes.find((s) => s.terapeutaId === id);
      return {
        id,
        nome: sessao?.terapeutaNome ?? "Profissional não atribuído",
      };
    });
  }, [recursos, sessoes]);

  function toggleMatrizCelula(diaSemana: number, horarioStr: string) {
    if (!celulasSelecionadas || !onCelulasChange) return;
    const chave = `${diaSemana}-${horarioStr}`;
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
      <div className="max-h-[75vh] w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] shadow-[var(--elevation-2)]">
        <table
          role="grid"
          aria-label="Grade de Agenda Geral da Clínica"
          className="w-full min-w-[650px] border-collapse text-left sm:min-w-[700px]"
        >
          <thead className="sticky top-0 z-20 border-b-2 border-black bg-[var(--surface-elevated,#ffffff)]">
            <tr role="row">
              <th className="font-display sticky left-0 z-30 w-20 border-r-2 border-black bg-[var(--surface-elevated,#ffffff)] p-2 text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase sm:w-24 sm:p-3">
                Horário
              </th>
              {recursosVisiveis.map((r) => {
                const sessoesRecurso = sessoes.filter(
                  (s) => s.terapeutaId === r.id,
                );
                const concluidas = sessoesRecurso.filter(
                  (s) => s.estado === "realizada",
                ).length;
                return (
                  <th
                    key={r.id}
                    className="min-w-[180px] border-r-2 border-black p-2 sm:min-w-[220px] sm:p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#f2b705] text-xs font-bold">
                        {r.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-display truncate text-xs font-bold text-[var(--text-primary)] sm:text-sm">
                          {r.nome}
                        </p>
                        <p className="truncate font-mono text-[10px] text-[var(--text-secondary)]">
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
              <tr
                key={h}
                className="border-b border-gray-300 hover:bg-gray-50/50"
              >
                <td className="sticky left-0 z-10 w-20 border-r-2 border-black bg-[var(--surface-card,#ffffff)] p-2 font-mono text-xs font-bold text-[var(--text-primary)] sm:w-24 sm:p-3">
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
                        "min-h-[56px] min-w-[180px] border-r-2 border-black p-1.5 align-top transition-colors sm:min-w-[220px] sm:p-2",
                        sessoesSlot.length === 0 &&
                          "cursor-pointer hover:bg-[#fff6db]/30",
                      )}
                    >
                      <div className="space-y-1.5">
                        {sessoesSlot.map((s) => (
                          <CalendarEventCard
                            key={s.id}
                            id={s.id}
                            pacienteNome={s.pacienteNome ?? "Paciente"}
                            disciplinaNome={s.disciplina}
                            horarioStr={obterHorarioSlot(
                              s.agendadaPara,
                              passoMin,
                            )}
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
  const listaDias =
    diasSemana ??
    DIAS_PADRAO.map((d) => ({
      dataISO: "",
      rotulo: d.rotulo,
      diaSemana: d.diaSemana,
    }));

  return (
    <div className="max-h-[75vh] w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] shadow-[var(--elevation-2)]">
      <table
        role="grid"
        aria-label="Grade Semanal de Agendamentos"
        className="w-full min-w-[700px] border-collapse text-left sm:min-w-[800px]"
      >
        <thead className="sticky top-0 z-20 border-b-2 border-black bg-[var(--surface-elevated,#ffffff)]">
          <tr role="row">
            <th className="font-display sticky left-0 z-30 w-24 border-r-2 border-black bg-[var(--surface-elevated,#ffffff)] p-2 text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase sm:w-32 sm:p-3">
              Dia / Data
            </th>
            {horarios.map((h) => (
              <th
                key={h}
                className="min-w-[75px] border-r border-gray-300 p-2 text-center font-mono text-xs font-bold text-[var(--text-primary)] sm:min-w-[90px] sm:p-3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {listaDias.map((d, idx) => (
            <tr
              key={`${d.diaSemana}-${d.rotulo}-${idx}`}
              className="border-b border-gray-300"
            >
              <td className="font-display sticky left-0 z-10 w-24 border-r-2 border-black bg-[var(--surface-card,#ffffff)] p-2 text-xs font-bold text-[var(--text-primary)] sm:w-32 sm:p-3">
                <div>{d.rotulo}</div>
                {d.dataISO && (
                  <div className="font-mono text-[10px] text-[var(--text-secondary)]">
                    {d.dataISO}
                  </div>
                )}
              </td>
              {horarios.map((h) => {
                const key =
                  modo === "availability-matrix"
                    ? `${d.diaSemana}-${h}`
                    : `${d.diaSemana}_${h}`;
                const sessoesSlot = mapaSessoes.get(key) ?? [];
                const selecionadaMatriz = celulasSelecionadas?.has(key);

                if (modo === "availability-matrix") {
                  return (
                    <td
                      key={h}
                      role="gridcell"
                      tabIndex={0}
                      aria-label={`${d.rotulo} ${h}${selecionadaMatriz ? " disponível" : ""}`}
                      onClick={() => toggleMatrizCelula(d.diaSemana, h)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleMatrizCelula(d.diaSemana, h);
                        } else if (
                          e.key === "ArrowRight" ||
                          e.key === "ArrowLeft" ||
                          e.key === "ArrowDown" ||
                          e.key === "ArrowUp"
                        ) {
                          e.preventDefault();
                          const tdTarget = e.currentTarget;
                          const tr = tdTarget.parentElement;
                          const tbody = tr?.parentElement;
                          if (!tr || !tbody) return;
                          const cellIndex = Array.from(tr.children).indexOf(
                            tdTarget,
                          );
                          const rowIndex = Array.from(tbody.children).indexOf(
                            tr,
                          );

                          let targetCell: HTMLTableCellElement | null = null;
                          if (
                            e.key === "ArrowRight" &&
                            cellIndex < tr.children.length - 1
                          ) {
                            targetCell = tr.children[
                              cellIndex + 1
                            ] as HTMLTableCellElement;
                          } else if (e.key === "ArrowLeft" && cellIndex > 1) {
                            targetCell = tr.children[
                              cellIndex - 1
                            ] as HTMLTableCellElement;
                          } else if (
                            e.key === "ArrowDown" &&
                            rowIndex < tbody.children.length - 1
                          ) {
                            const nextRow = tbody.children[rowIndex + 1];
                            targetCell = nextRow?.children[
                              cellIndex
                            ] as HTMLTableCellElement;
                          } else if (e.key === "ArrowUp" && rowIndex > 0) {
                            const prevRow = tbody.children[rowIndex - 1];
                            targetCell = prevRow?.children[
                              cellIndex
                            ] as HTMLTableCellElement;
                          }

                          if (targetCell) {
                            targetCell.focus();
                            if (e.shiftKey) {
                              const targetRowIndex = Array.from(
                                tbody.children,
                              ).indexOf(targetCell.parentElement!);
                              const targetCellIndex = Array.from(
                                targetCell.parentElement!.children,
                              ).indexOf(targetCell);
                              const targetDia =
                                listaDias[targetRowIndex]?.diaSemana;
                              const targetH = horarios[targetCellIndex - 1];
                              if (targetDia !== undefined && targetH) {
                                toggleMatrizCelula(targetDia, targetH);
                              }
                            }
                          }
                        }
                      }}
                      className={cn(
                        "min-h-[44px] cursor-pointer border-r border-gray-300 p-2 text-center transition-all",
                        selecionadaMatriz
                          ? "border-2 border-black bg-[#f2b705] shadow-[1px_1px_0_#000]"
                          : "hover:bg-[#fff6db]/40",
                      )}
                    >
                      {selecionadaMatriz && (
                        <span className="font-mono text-xs font-bold">✓</span>
                      )}
                    </td>
                  );
                }

                const estaBloqueado =
                  d.dataISO &&
                  bloqueios.some(
                    (b) => d.dataISO >= b.dataInicio && d.dataISO <= b.dataFim,
                  );
                const nomeDiaSemana =
                  DIAS_PADRAO.find(
                    (dp) => dp.diaSemana === d.diaSemana,
                  )?.rotulo?.toLowerCase() ?? d.rotulo.toLowerCase();
                const sessoesDesc = sessoesSlot
                  .map(
                    (s) =>
                      `${s.pacienteNome}, ${s.disciplina} (${s.estado === "falta_paciente" ? "conflito" : "previsto"})`,
                  )
                  .join("; ");
                const labelAcessivel =
                  sessoesSlot.length > 0
                    ? `${nomeDiaSemana} ${h}, ocupado: ${sessoesDesc}`
                    : `${nomeDiaSemana} ${h}`;

                const inicioMinSlot = horaParaMin(h);
                const deslocamentoCols =
                  (inicioMinSlot - horaParaMin(abertura)) / passoMin;
                const leftStyle = `calc(6rem + ${deslocamentoCols} * 5rem)`;
                const widthStyle = `calc(1 * 5rem)`;

                return (
                  <td
                    key={h}
                    role="gridcell"
                    aria-label={labelAcessivel}
                    aria-disabled={estaBloqueado ? "true" : undefined}
                    tabIndex={0}
                    onClick={() => {
                      if (!estaBloqueado && sessoesSlot.length === 0) {
                        onSlotClick?.("", h, d.diaSemana);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === " ") &&
                        !estaBloqueado &&
                        sessoesSlot.length === 0
                      ) {
                        e.preventDefault();
                        onSlotClick?.("", h, d.diaSemana);
                      } else if (
                        e.key === "ArrowRight" ||
                        e.key === "ArrowLeft" ||
                        e.key === "ArrowDown" ||
                        e.key === "ArrowUp"
                      ) {
                        e.preventDefault();
                        const tdTarget = e.currentTarget;
                        const tr = tdTarget.parentElement;
                        const tbody = tr?.parentElement;
                        if (!tr || !tbody) return;
                        const cellIndex = Array.from(tr.children).indexOf(
                          tdTarget,
                        );
                        const rowIndex = Array.from(tbody.children).indexOf(tr);

                        let targetCell: HTMLTableCellElement | null = null;
                        if (
                          e.key === "ArrowRight" &&
                          cellIndex < tr.children.length - 1
                        ) {
                          targetCell = tr.children[
                            cellIndex + 1
                          ] as HTMLTableCellElement;
                        } else if (e.key === "ArrowLeft" && cellIndex > 1) {
                          targetCell = tr.children[
                            cellIndex - 1
                          ] as HTMLTableCellElement;
                        } else if (
                          e.key === "ArrowDown" &&
                          rowIndex < tbody.children.length - 1
                        ) {
                          const nextRow = tbody.children[rowIndex + 1];
                          targetCell = nextRow?.children[
                            cellIndex
                          ] as HTMLTableCellElement;
                        } else if (e.key === "ArrowUp" && rowIndex > 0) {
                          const prevRow = tbody.children[rowIndex - 1];
                          targetCell = prevRow?.children[
                            cellIndex
                          ] as HTMLTableCellElement;
                        }

                        if (targetCell) {
                          targetCell.focus();
                        }
                      }
                    }}
                    className={cn(
                      "min-h-[50px] border-r border-gray-300 p-1 align-top transition-colors sm:p-1.5",
                      sessoesSlot.length === 0 &&
                        !estaBloqueado &&
                        "cursor-pointer hover:bg-[#fff6db]/30",
                      estaBloqueado &&
                        "cursor-not-allowed bg-gray-100 opacity-50",
                    )}
                  >
                    <div className="space-y-1">
                      {sessoesSlot.map((s) => (
                        <div
                          key={s.id}
                          data-testid="bloco-overlay"
                          style={{ left: leftStyle, width: widthStyle }}
                        >
                          <CalendarEventCard
                            id={s.id}
                            pacienteNome={s.pacienteNome ?? "Paciente"}
                            disciplinaNome={s.disciplina}
                            estado={s.estado}
                            variante="compacta"
                            onClick={() => onEventClick?.(s)}
                            podeGerir={podeGerir}
                          />
                        </div>
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
