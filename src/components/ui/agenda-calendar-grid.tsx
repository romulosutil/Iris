"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/ui/layout";
import { EstadoBadge } from "@/app/(app)/agenda/estado-badge";
import { CheckInButton } from "@/app/(app)/agenda/checkin-button";
import { GerirSessao } from "@/app/(app)/agenda/gerir-sessao";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";
import type { SessaoDoDia } from "@/app/(app)/agenda/actions";

export interface AgendaCalendarGridProps {
  sessoes: SessaoDoDia[];
  terapeutas: { id: string; nome: string }[];
  role: string;
  userId: string;
  podeGerir: boolean;
  abertura?: string; // ex: "07:00"
  fechamento?: string; // ex: "19:30"
  passoMin?: number; // ex: 30
  onSlotClick?: (terapeutaId: string, horario: string) => void;
}

function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
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

function gerarHorarios(abertura: string, fechamento: string, passoMin: number): string[] {
  const inicio = horaParaMin(abertura);
  const fim = horaParaMin(fechamento);
  const slots: string[] = [];
  for (let m = inicio; m <= fim; m += passoMin) {
    slots.push(minParaHora(m));
  }
  return slots;
}

export function AgendaCalendarGrid({
  sessoes,
  terapeutas,
  role,
  userId,
  podeGerir,
  abertura = "07:00",
  fechamento = "20:00",
  passoMin = 60,
  onSlotClick,
}: AgendaCalendarGridProps) {
  const horarios = React.useMemo(
    () => gerarHorarios(abertura, fechamento, passoMin),
    [abertura, fechamento, passoMin]
  );

  // Sessão selecionada para o Drawer de Detalhes
  const [sessaoSelecionada, setSessaoSelecionada] = React.useState<SessaoDoDia | null>(null);

  // Mapeia sessões por (terapeutaId_horarioSlot) para busca O(1) com suporte a minutos fracionados
  const mapaSessoes = React.useMemo(() => {
    const map = new Map<string, SessaoDoDia[]>();
    for (const s of sessoes) {
      const h = obterHorarioSlot(s.agendadaPara, passoMin);
      const tId = s.terapeutaId ?? "sem-terapeuta";
      const key = `${tId}_${h}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessoes, passoMin]);

  // Terapeutas visíveis (com sessões ou todos se coordenador)
  const terapeutasVisiveis = React.useMemo(() => {
    if (terapeutas.length > 0) return terapeutas;
    // Fallback se a lista vier vazia
    const idsUnicos = Array.from(new Set(sessoes.map((s) => s.terapeutaId ?? "sem-terapeuta")));
    return idsUnicos.map((id) => {
      const sessao = sessoes.find((s) => s.terapeutaId === id);
      return { id, nome: sessao?.terapeutaNome ?? "Profissional não atribuído" };
    });
  }, [terapeutas, sessoes]);

  // Foco para acessibilidade por teclado
  const [foco, setFoco] = React.useState<{ slotIdx: number; terapeutaIdx: number; sessaoIdx: number }>({
    slotIdx: 0,
    terapeutaIdx: 0,
    sessaoIdx: 0,
  });
  const refs = React.useRef(new Map<string, HTMLElement | null>());

  function chaveRef(slotIdx: number, terapeutaIdx: number, sessaoIdx: number = 0) {
    return `${slotIdx}-${terapeutaIdx}-${sessaoIdx}`;
  }

  function focarCelula(slotIdx: number, terapeutaIdx: number, sessaoIdx: number = 0) {
    const sIdx = Math.max(0, Math.min(horarios.length - 1, slotIdx));
    const tIdx = Math.max(0, Math.min(terapeutasVisiveis.length - 1, terapeutaIdx));
    const key = `${terapeutasVisiveis[tIdx]?.id}_${horarios[sIdx]}`;
    const totalSessoes = mapaSessoes.get(key)?.length ?? 0;
    const sessIdxTarget = totalSessoes > 0 ? Math.max(0, Math.min(totalSessoes - 1, sessaoIdx)) : 0;

    setFoco({ slotIdx: sIdx, terapeutaIdx: tIdx, sessaoIdx: sessIdxTarget });
    refs.current.get(chaveRef(sIdx, tIdx, sessIdxTarget))?.focus();
  }

  function aoTeclar(
    e: React.KeyboardEvent,
    slotIdx: number,
    terapeutaIdx: number,
    sessaoIdx: number = 0,
    totalSessoesNoSlot: number = 0
  ) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (totalSessoesNoSlot > 1 && sessaoIdx < totalSessoesNoSlot - 1) {
        focarCelula(slotIdx, terapeutaIdx, sessaoIdx + 1);
      } else {
        focarCelula(slotIdx + 1, terapeutaIdx, 0);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalSessoesNoSlot > 1 && sessaoIdx > 0) {
        focarCelula(slotIdx, terapeutaIdx, sessaoIdx - 1);
      } else {
        focarCelula(slotIdx - 1, terapeutaIdx, 0);
      }
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      focarCelula(slotIdx, terapeutaIdx + 1, 0);
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focarCelula(slotIdx, terapeutaIdx - 1, 0);
      return;
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Container com Scroll Horizontal e Vertical Flexível */}
      <div
        role="grid"
        aria-label="Grade de Agenda Geral da Clínica"
        className="w-full overflow-auto max-h-[75vh] rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]"
      >
        <table className="w-full border-collapse text-left min-w-[700px]">
          {/* Cabeçalho Sticky de Terapeutas */}
          <thead className="sticky top-0 z-20 bg-[var(--surface-elevated)] border-b-2 border-[var(--border-brutal)]">
            <tr role="row">
              <th
                role="columnheader"
                className="sticky left-0 z-30 w-24 p-3 bg-[var(--surface-elevated)] border-r-2 border-[var(--border-brutal)] font-display text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
              >
                Horário
              </th>
              {terapeutasVisiveis.map((t) => {
                const sessoesTerapeuta = sessoes.filter((s) => s.terapeutaId === t.id);
                const concluidas = sessoesTerapeuta.filter((s) => s.estado === "realizada").length;
                const inicial = t.nome.charAt(0).toUpperCase();
                return (
                  <th
                    key={t.id}
                    role="columnheader"
                    className="p-3 border-r border-[var(--border-brutal)]/30 min-w-[170px] max-w-[220px]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-[var(--action-primary)] border border-[var(--border-brutal)] flex items-center justify-center font-display font-black text-xs shrink-0 shadow-xs">
                        {inicial}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-display font-bold text-xs text-[var(--text-primary)] truncate" title={t.nome}>
                          {t.nome}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-secondary)] font-semibold">
                          {sessoesTerapeuta.length} {sessoesTerapeuta.length === 1 ? "sessão" : "sessões"} ({concluidas} ok)
                        </span>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Corpo da Matriz Horário x Terapeuta */}
          <tbody>
            {horarios.map((horario, slotIdx) => (
              <tr role="row" key={horario} className="border-b border-[var(--border-brutal)]/15 hover:bg-[var(--surface-elevated)]/40 transition-colors">
                {/* Linha Fixo de Horário */}
                <th
                  role="rowheader"
                  className="sticky left-0 z-10 w-24 p-3 bg-[var(--surface-card)] border-r-2 border-[var(--border-brutal)] font-mono text-xs font-bold text-[var(--text-secondary)] text-center"
                >
                  {horario}
                </th>

                {/* Células da Grade */}
                {terapeutasVisiveis.map((t, terapeutaIdx) => {
                  const key = `${t.id}_${horario}`;
                  const sessoesNoSlot = mapaSessoes.get(key) ?? [];
                  const ehFoco = foco.slotIdx === slotIdx && foco.terapeutaIdx === terapeutaIdx;

                  return (
                    <td
                      key={t.id}
                      role="gridcell"
                      className="p-1.5 border-r border-[var(--border-brutal)]/20 align-top h-14"
                    >
                      {sessoesNoSlot.length === 0 ? (
                        <button
                          type="button"
                          aria-label={`Agendar atendimento com ${t.nome} às ${horario}`}
                          ref={(el) => {
                            refs.current.set(chaveRef(slotIdx, terapeutaIdx, 0), el);
                          }}
                          tabIndex={ehFoco && foco.sessaoIdx === 0 ? 0 : -1}
                          onClick={() => onSlotClick?.(t.id, horario)}
                          onFocus={() => setFoco({ slotIdx, terapeutaIdx, sessaoIdx: 0 })}
                          onKeyDown={(e) => aoTeclar(e, slotIdx, terapeutaIdx, 0, 0)}
                          className="w-full h-full min-h-[40px] rounded-lg border border-dashed border-[var(--border-brutal)]/20 hover:bg-[var(--action-primary)]/20 hover:border-solid hover:border-[var(--border-brutal)] transition-all cursor-pointer focus-visible:outline-focus outline-none"
                        />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {sessoesNoSlot.map((s, sIdx) => {
                            const ehEsteItemFoco = ehFoco && foco.sessaoIdx === sIdx;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                ref={(el) => {
                                  refs.current.set(chaveRef(slotIdx, terapeutaIdx, sIdx), el);
                                }}
                                tabIndex={ehEsteItemFoco ? 0 : -1}
                                onClick={() => setSessaoSelecionada(s)}
                                onFocus={() => setFoco({ slotIdx, terapeutaIdx, sessaoIdx: sIdx })}
                                onKeyDown={(e) => aoTeclar(e, slotIdx, terapeutaIdx, sIdx, sessoesNoSlot.length)}
                                className={cn(
                                  "w-full text-left p-2 rounded-xl border border-[var(--border-brutal)]/30 shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-focus outline-none cursor-pointer",
                                  s.estado === "realizada" && "bg-emerald-50/90 text-emerald-950 border-emerald-300",
                                  s.estado === "agendada" && "bg-indigo-50/90 text-indigo-950 border-indigo-300",
                                  (s.estado === "falta_paciente" || s.estado === "falta_terapeuta") && "bg-amber-50/90 text-amber-950 border-amber-300",
                                  s.estado === "cancelada" && "bg-slate-100 text-slate-500 border-slate-200 opacity-60 line-through"
                                )}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono text-[10px] font-bold tracking-tight">
                                    {horaDaSessao(s.agendadaPara)}
                                  </span>
                                  <span
                                    className={cn(
                                      "size-2 rounded-full shrink-0",
                                      s.estado === "realizada" && "bg-emerald-600",
                                      s.estado === "agendada" && "bg-indigo-600",
                                      (s.estado === "falta_paciente" || s.estado === "falta_terapeuta") && "bg-amber-600",
                                      s.estado === "cancelada" && "bg-slate-400"
                                    )}
                                  />
                                </div>
                                <div className="font-display font-bold text-xs truncate leading-tight mt-0.5">
                                  {s.pacienteNome ?? "Paciente (restrito)"}
                                </div>
                                {s.disciplina ? (
                                  <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)] truncate mt-0.5 font-semibold">
                                    {s.disciplina}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drawer Contextual de Detalhes da Sessão */}
      <Drawer open={!!sessaoSelecionada} onOpenChange={(open) => !open && setSessaoSelecionada(null)}>
        {sessaoSelecionada ? (
          <DrawerContent posicao="right">
            <DrawerHeader>
              <Cluster gap="sm" className="items-center mb-1">
                <span className="font-mono text-sm font-bold px-2 py-0.5 bg-[var(--action-primary)] text-[var(--text-primary)] rounded-[var(--radius-xs)] border border-[var(--border-brutal)]">
                  {horaDaSessao(sessaoSelecionada.agendadaPara)}
                </span>
                <EstadoBadge estado={sessaoSelecionada.estado} />
              </Cluster>
              <DrawerTitle>{sessaoSelecionada.pacienteNome ?? "Paciente (acesso restrito)"}</DrawerTitle>
              <DrawerDescription>
                {sessaoSelecionada.terapeutaNome ? `Terapeuta: ${sessaoSelecionada.terapeutaNome}` : "Sem terapeuta atribuído"}
                {sessaoSelecionada.disciplina ? ` · Disciplina: ${sessaoSelecionada.disciplina}` : ""}
              </DrawerDescription>
            </DrawerHeader>

            <div className="py-6 space-y-4">
              <div className="p-4 rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] space-y-2">
                <div className="text-xs font-mono font-bold uppercase text-[var(--text-secondary)]">Status da Sessão</div>
                <div className="text-sm font-medium">
                  {sessaoSelecionada.estado === "realizada" && "Sessão já realizada e registrada."}
                  {sessaoSelecionada.estado === "agendada" && "Sessão agendada aguardando confirmação / check-in."}
                  {sessaoSelecionada.estado === "falta_paciente" && "Falta registrada pelo paciente."}
                  {sessaoSelecionada.estado === "falta_terapeuta" && "Falta registrada pelo profissional."}
                  {sessaoSelecionada.estado === "cancelada" && "Sessão cancelada."}
                </div>
              </div>
            </div>

            <DrawerFooter className="flex flex-col sm:flex-row gap-2">
              {role === "coordenador" || sessaoSelecionada.terapeutaId === userId ? (
                <Button variante="primaria" className="w-full" asChild>
                  <Link href={`/diario/${sessaoSelecionada.id}`}>
                    Abrir Sessão no Diário
                  </Link>
                </Button>
              ) : null}

              {sessaoSelecionada.estado === "agendada" ? (
                <div className="w-full">
                  <CheckInButton sessionId={sessaoSelecionada.id} />
                </div>
              ) : null}

              {sessaoSelecionada.estado === "agendada" && (podeGerir || sessaoSelecionada.terapeutaId === userId) ? (
                <GerirSessao sessionId={sessaoSelecionada.id} terapeutas={terapeutas} />
              ) : null}

              {(sessaoSelecionada.estado === "falta_paciente" || sessaoSelecionada.estado === "falta_terapeuta") && podeGerir ? (
                <Button variante="secundaria" className="w-full" asChild>
                  <Link
                    href={`/agenda/semana?repor=${sessaoSelecionada.id}&patientId=${sessaoSelecionada.patientId}&terapeutaId=${sessaoSelecionada.terapeutaId}&disciplina=${encodeURIComponent(sessaoSelecionada.disciplina)}`}
                  >
                    Repor Sessão
                  </Link>
                </Button>
              ) : null}
            </DrawerFooter>
          </DrawerContent>
        ) : null}
      </Drawer>
    </div>
  );
}
