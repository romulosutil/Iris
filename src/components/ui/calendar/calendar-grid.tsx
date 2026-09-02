"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import {
  CalendarEventCard,
  type CalendarEventoEstado,
} from "./calendar-event-card";

/**
 * O mínimo que a grade precisa de um evento para posicioná-lo e descrevê-lo.
 * A-01 (#538): o DS não importa mais `SessaoDoDia` do app — o app passa o
 * tipo real como `T` e recebe o mesmo `T` em `onEventClick` e `renderEvent`.
 */
export interface CalendarEvento {
  id: string;
  agendadaPara: Date;
  terapeutaId: string;
  estado: CalendarEventoEstado;
  pacienteNome?: string | null;
  disciplina?: string | null;
  terapeutaNome?: string | null;
}

/** Contexto que a grade entrega a `renderEvent`. */
export interface CalendarEventoContexto {
  /** Horário do slot já formatado no fuso da clínica (ausente na timeline semanal). */
  horarioStr?: string;
  variante: "detalhada" | "compacta";
  /** false quando a coluna/linha já identifica o terapeuta. */
  mostrarTerapeuta: boolean;
}

/**
 * Fuso de fallback quando nenhum `fuso` é passado: o do navegador. Só callers
 * sem contexto de clínica (Storybook, testes) caem aqui; produção passa
 * `clinic.timezone` (D61). Antes o DS importava `FUSO_CLINICA` do app.
 */
function fusoDoNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type CalendarGridMode =
  "daily-resources" | "weekly-timeline" | "availability-matrix";

interface ResourceColumn {
  id: string;
  nome: string;
  subtitulo?: string;
}

export interface CalendarGridProps<T extends CalendarEvento = CalendarEvento> {
  modo: CalendarGridMode;
  sessoes?: T[];
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
  onEventClick?: (sessao: T) => void;
  /**
   * Renderiza o evento dentro do slot. Sem isto a grade usa o
   * `CalendarEventCard` puro do DS; o app injeta aqui o que é dele (check-in,
   * gestão) em vez de o DS importar componentes do app (A-01, #538).
   */
  renderEvent?: (
    sessao: T,
    contexto: CalendarEventoContexto,
  ) => React.ReactNode;
  bloqueios?: { dataInicio: string; dataFim: string }[];
  /** Fuso IANA da clínica (D61). Default = fuso do navegador, só para callers
   * de design system sem caminho de request (Storybook, testes). Todo caller
   * de produção passa o valor real de `clinic.timezone`. */
  fuso?: string;
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

function obterHorarioSlot(
  quando: Date,
  passoMin: number,
  fuso: string,
): string {
  const str = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
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

// R-30: grade de N colunas (uma por recurso) é ilegível em viewport estreito
// — abaixo do breakpoint `md` (768px, convenção Tailwind do repo) a escala
// "Dia" (`modo="daily-resources"`) troca para lista cronológica.
const MOBILE_BREAKPOINT_PX = 768;

function useEscalaDiaMobile(): boolean {
  const [mobile, setMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const atualizar = () => setMobile(mql.matches);
    atualizar();
    mql.addEventListener("change", atualizar);
    return () => mql.removeEventListener("change", atualizar);
  }, []);

  return mobile;
}

interface CalendarDayListProps<T extends CalendarEvento> {
  sessoes: T[];
  passoMin: number;
  fuso: string;
  onEventClick?: (sessao: T) => void;
  renderEvent?: CalendarGridProps<T>["renderEvent"];
}

const CONTEXTO_COMPACTO: CalendarEventoContexto = {
  variante: "compacta",
  mostrarTerapeuta: false,
};

/** Evento padrão do DS: o card puro, sem nada do app. */
function renderEventoPadrao<T extends CalendarEvento>(
  s: T,
  { horarioStr, variante, mostrarTerapeuta }: CalendarEventoContexto,
  onEventClick?: (sessao: T) => void,
) {
  return (
    <CalendarEventCard
      pacienteNome={s.pacienteNome ?? "Paciente"}
      disciplinaNome={s.disciplina}
      horarioStr={horarioStr}
      estado={s.estado}
      terapeutaNome={
        mostrarTerapeuta ? (s.terapeutaNome ?? undefined) : undefined
      }
      variante={variante}
      onClick={() => onEventClick?.(s)}
    />
  );
}

// Lista cronológica da escala "Dia" para mobile (R-30). Ordena por horário
// real da sessão (não pelo slot arredondado), uma linha por sessão.
function CalendarDayList<T extends CalendarEvento>({
  sessoes,
  passoMin,
  fuso,
  onEventClick,
  renderEvent,
}: CalendarDayListProps<T>) {
  const sessoesOrdenadas = React.useMemo(
    () =>
      [...sessoes].sort(
        (a, b) =>
          new Date(a.agendadaPara).getTime() -
          new Date(b.agendadaPara).getTime(),
      ),
    [sessoes],
  );

  if (sessoesOrdenadas.length === 0) {
    return (
      <div
        data-testid="calendar-day-list"
        className="rounded-[var(--radius-control)] border-2 border-dashed border-black p-6 text-center"
      >
        <p className="text-text-secondary text-sm">
          Nenhuma sessão agendada para este dia.
        </p>
      </div>
    );
  }

  return (
    <ul
      data-testid="calendar-day-list"
      aria-label="Sessões do dia, em ordem cronológica"
      className="flex flex-col gap-2"
    >
      {sessoesOrdenadas.map((s) => {
        const contexto: CalendarEventoContexto = {
          horarioStr: obterHorarioSlot(s.agendadaPara, passoMin, fuso),
          variante: "detalhada",
          mostrarTerapeuta: true,
        };
        return (
          <li key={s.id}>
            {renderEvent
              ? renderEvent(s, contexto)
              : renderEventoPadrao(s, contexto, onEventClick)}
          </li>
        );
      })}
    </ul>
  );
}

export function CalendarGrid<T extends CalendarEvento = CalendarEvento>({
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
  renderEvent,
  bloqueios = [],
  fuso = fusoDoNavegador(),
}: CalendarGridProps<T>) {
  const mobileDia = useEscalaDiaMobile();

  const horarios = React.useMemo(
    () => gerarHorarios(abertura, fechamento, passoMin),
    [abertura, fechamento, passoMin],
  );

  const mapaSessoes = React.useMemo(() => {
    const map = new Map<string, T[]>();
    for (const s of sessoes) {
      const h = obterHorarioSlot(s.agendadaPara, passoMin, fuso);
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
  }, [sessoes, passoMin, modo, fuso]);

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
    if (mobileDia) {
      return (
        <CalendarDayList
          sessoes={sessoes}
          passoMin={passoMin}
          fuso={fuso}
          onEventClick={onEventClick}
          renderEvent={renderEvent}
        />
      );
    }
    return (
      <div
        data-testid="calendar-day-grid"
        className="max-h-[75vh] w-full touch-pan-x touch-pan-y overflow-x-auto overflow-y-auto rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] shadow-[var(--elevation-2)]"
      >
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
                        <p className="truncate font-mono text-xs text-[var(--text-secondary)]">
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
                        {sessoesSlot.map((s) => {
                          const contexto: CalendarEventoContexto = {
                            horarioStr: obterHorarioSlot(
                              s.agendadaPara,
                              passoMin,
                              fuso,
                            ),
                            variante: "detalhada",
                            mostrarTerapeuta: false,
                          };
                          return (
                            <React.Fragment key={s.id}>
                              {renderEvent
                                ? renderEvent(s, contexto)
                                : renderEventoPadrao(s, contexto, onEventClick)}
                            </React.Fragment>
                          );
                        })}
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
                  <div className="font-mono text-xs text-[var(--text-secondary)]">
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
                          {renderEvent
                            ? renderEvent(s, CONTEXTO_COMPACTO)
                            : renderEventoPadrao(
                                s,
                                CONTEXTO_COMPACTO,
                                onEventClick,
                              )}
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
