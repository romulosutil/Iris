"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DataRow } from "@/components/ui/data-row";
import { Cluster, Stack } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SearchInput } from "@/components/ui/search-input";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { EstadoBadge } from "./estado-badge";
import { CheckInButton } from "./checkin-button";
import { GerirSessao } from "./gerir-sessao";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { CollapsibleCluster } from "@/components/ui/collapsible-cluster";
import { AgendaCalendarGrid } from "@/components/ui/agenda-calendar-grid";
import { FUSO_CLINICA } from "./fuso";
import type { SessaoDoDia } from "./actions";

export interface AgendaViewClienteProps {
  sessoes: SessaoDoDia[];
  terapeutas: { id: string; nome: string }[];
  role: string;
  userId: string;
  podeGerir: boolean;
  diaExtenso?: string;
  diaISO?: string;
}

function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

export function AgendaViewCliente({
  sessoes,
  terapeutas,
  role,
  userId,
  podeGerir,
  diaExtenso,
  diaISO,
}: AgendaViewClienteProps) {
  const router = useRouter();
  const isCoordenador = role === "coordenador" || role === "admin_recepcao";
  
  // Modo de exibição: Matriz (Geral), Terapeuta (Bento) ou Horário (Cronológico)
  const [modoVisao, setModoVisao] = React.useState<string>(
    isCoordenador ? "matriz" : "terapeuta"
  );

  // Estados de busca e filtragem
  const [termoBusca, setTermoBusca] = React.useState<string>("");
  const [filtroEstado, setFiltroEstado] = React.useState<string>("todas");

  // Sessões filtradas
  const sessoesFiltradas = React.useMemo(() => {
    return sessoes.filter((s) => {
      // Filtro por termo de busca (Paciente ou Terapeuta)
      const termo = termoBusca.toLowerCase().trim();
      const matchBusca =
        !termo ||
        (s.pacienteNome?.toLowerCase().includes(termo) ?? false) ||
        (s.terapeutaNome?.toLowerCase().includes(termo) ?? false) ||
        (s.disciplina?.toLowerCase().includes(termo) ?? false);

      // Filtro por Estado
      let matchEstado = true;
      if (filtroEstado === "agendada") matchEstado = s.estado === "agendada";
      if (filtroEstado === "realizada") matchEstado = s.estado === "realizada";
      if (filtroEstado === "falta")
        matchEstado = s.estado === "falta_paciente" || s.estado === "falta_terapeuta";

      return matchBusca && matchEstado;
    });
  }, [sessoes, termoBusca, filtroEstado]);

  // Estatísticas do Dia para o Painel de KPIs
  const metricas = React.useMemo(() => {
    const total = sessoes.length;
    const realizadas = sessoes.filter((s) => s.estado === "realizada").length;
    const faltas = sessoes.filter(
      (s) => s.estado === "falta_paciente" || s.estado === "falta_terapeuta"
    ).length;
    const agendadas = sessoes.filter((s) => s.estado === "agendada").length;
    const taxaOcupacao = total > 0 ? Math.round((realizadas / total) * 100) : 0;

    return { total, realizadas, faltas, agendadas, taxaOcupacao };
  }, [sessoes]);

  // Agrupamento por Terapeuta
  const sessoesPorTerapeuta = React.useMemo(() => {
    const mapa = new Map<
      string,
      { terapeutaNome: string; sessoes: SessaoDoDia[] }
    >();

    // Inicializa todos os terapeutas conhecidos da clínica
    for (const t of terapeutas) {
      mapa.set(t.id, { terapeutaNome: t.nome, sessoes: [] });
    }

    // Adiciona as sessões filtradas ao mapa
    for (const s of sessoesFiltradas) {
      const key = s.terapeutaId ?? "sem-terapeuta";
      const actualNome = s.terapeutaNome ?? "Profissional não atribuído";
      if (!mapa.has(key)) {
        mapa.set(key, { terapeutaNome: actualNome, sessoes: [] });
      }
      mapa.get(key)!.sessoes.push(s);
    }

    return Array.from(mapa.entries()).filter(
      ([, val]) => val.sessoes.length > 0 || (isCoordenador && !termoBusca && filtroEstado === "todas")
    );
  }, [sessoesFiltradas, terapeutas, isCoordenador, termoBusca, filtroEstado]);

  if (sessoes.length === 0) {
    return (
      <Stack className="animate-fade-in-up animate-delay-75 py-4 md:py-8">
        <Alert severidade="info" destacado>
          Nenhuma sessão agendada para o dia de hoje.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* KPI Topbar & Filtros de Alta Densidade */}
      <div className="flex flex-col gap-3 p-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]">
        {/* Cabeçalho com Data em Destaque */}
        {diaExtenso ? (
          <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-[var(--border-brutal)]">
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-sm sm:text-base text-[var(--text-primary)] flex items-center gap-2 px-3 py-1 bg-[var(--action-primary)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-xs)] shadow-[2px_2px_0_0_#000000] capitalize">
                📅 HOJE · {diaExtenso}
              </span>
            </div>
            {diaISO ? (
              <span className="font-mono text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-elevated)] px-2.5 py-1 rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/30">
                {diaISO}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--border-brutal)]/20">
          {/* Métricas do Dia */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-primary)] font-bold">
              📊 <strong>{metricas.total}</strong> agendamentos
            </span>
            <span className="px-2.5 py-1 rounded-[var(--radius-pill)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--text-primary)] font-bold">
              ✓ <strong>{metricas.realizadas}</strong> realizadas ({metricas.taxaOcupacao}%)
            </span>
            {metricas.faltas > 0 ? (
              <span className="px-2.5 py-1 rounded-[var(--radius-pill)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] font-bold">
                ⚠️ <strong>{metricas.faltas}</strong> faltas
              </span>
            ) : null}
          </div>

          {/* Alternador de Modo de Exibição */}
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-xs text-[var(--text-secondary)] hidden sm:inline">
              Visão:
            </span>
            <SegmentedControl
              value={modoVisao}
              onValueChange={setModoVisao}
              opcoes={[
                { value: "matriz", label: "🗓️ Matriz Geral" },
                { value: "terapeuta", label: "👥 Por Terapeuta" },
                { value: "horario", label: "🕒 Por Horário" },
              ]}
            />
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <SearchInput
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="Buscar paciente ou terapeuta..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              variante="neutral"
              selecionado={filtroEstado === "todas"}
              onSelecionar={() => setFiltroEstado("todas")}
            >
              Todas ({sessoes.length})
            </Chip>
            <Chip
              variante="brand"
              selecionado={filtroEstado === "agendada"}
              onSelecionar={() => setFiltroEstado("agendada")}
            >
              Agendadas ({metricas.agendadas})
            </Chip>
            <Chip
              variante="success"
              selecionado={filtroEstado === "realizada"}
              onSelecionar={() => setFiltroEstado("realizada")}
            >
              Realizadas ({metricas.realizadas})
            </Chip>
            <Chip
              variante="warning"
              selecionado={filtroEstado === "falta"}
              onSelecionar={() => setFiltroEstado("falta")}
            >
              Faltas ({metricas.faltas})
            </Chip>
          </div>
        </div>
      </div>

      {/* Alerta de Busca Sem Resultados */}
      {sessoesFiltradas.length === 0 ? (
        <Alert severidade="warning" destacado className="py-4">
          Nenhuma sessão encontrada para os filtros selecionados.
        </Alert>
      ) : null}

      {/* Visão 1: Matriz Calendário (Horário x Terapeuta) */}
      {modoVisao === "matriz" && sessoesFiltradas.length > 0 ? (
        <AgendaCalendarGrid
          sessoes={sessoesFiltradas}
          terapeutas={terapeutas}
          role={role}
          userId={userId}
          podeGerir={podeGerir}
          onSlotClick={(terapeutaId, horario) => {
            if (podeGerir || isCoordenador) {
              router.push(`/agenda/semana?terapeutaId=${terapeutaId}&horario=${horario}`);
            }
          }}
        />
      ) : null}

      {/* Visão 2: Bento Grid por Terapeuta */}
      {modoVisao === "terapeuta" && sessoesFiltradas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessoesPorTerapeuta.map(([terapeutaId, grupo]) => {
            const concluidas = grupo.sessoes.filter((s) => s.estado === "realizada").length;

            return (
              <CollapsibleCluster
                key={terapeutaId}
                titulo={grupo.terapeutaNome}
                subtitulo={`${grupo.sessoes.length} ${grupo.sessoes.length === 1 ? "sessão" : "sessões"} (${concluidas} ok)`}
                badgeTexto={concluidas === grupo.sessoes.length && grupo.sessoes.length > 0 ? "CONQUISTADO" : undefined}
                badgeVariante="sucesso"
              >
                {grupo.sessoes.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)] italic py-2 col-span-full">
                    Sem sessões agendadas para hoje.
                  </p>
                ) : (
                  grupo.sessoes.map((s) => (
                    <AppointmentCard
                      key={s.id}
                      horario={horaDaSessao(s.agendadaPara)}
                      pacienteNome={s.pacienteNome ?? "Paciente (acesso restrito)"}
                      estado={s.estado === "realizada" ? "aprovada" : "sugerida"}
                      statusTexto={s.estado.toUpperCase()}
                      onAbrir={
                        role === "coordenador" || s.terapeutaId === userId
                          ? () => {
                              router.push(`/diario/${s.id}`);
                            }
                          : undefined
                      }
                    />
                  ))
                )}
              </CollapsibleCluster>
            );
          })}
        </div>
      ) : null}

      {/* Visão 3: Cronológica (Por Horário) */}
      {modoVisao === "horario" && sessoesFiltradas.length > 0 ? (
        <Stack gap="md" como="ul">
          {sessoesFiltradas.map((s, index) => (
            <DataRow
              key={s.id}
              como="li"
              className={cn(
                "animate-fade-in-up",
                index === 0 && "animate-delay-75",
                index === 1 && "animate-delay-150",
                index >= 2 && "animate-delay-225"
              )}
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display font-bold text-lg text-[var(--text-primary)]">
                    {horaDaSessao(s.agendadaPara)}
                  </span>
                  <EstadoBadge estado={s.estado} />
                </Cluster>
              }
              subtitle={
                <span>
                  {s.pacienteNome ?? "Paciente (acesso restrito)"}
                  {s.terapeutaNome ? (
                    <span className="text-[var(--text-secondary)]"> · {s.terapeutaNome}</span>
                  ) : null}
                </span>
              }
              trailing={
                <Cluster gap="sm">
                  {role === "coordenador" || s.terapeutaId === userId ? (
                    <Link href={`/diario/${s.id}`}>
                      <Button variante="secundaria" tamanho="sm">
                        Abrir sessão
                      </Button>
                    </Link>
                  ) : null}
                  {s.estado === "agendada" ? (
                    <CheckInButton sessionId={s.id} />
                  ) : null}
                  {s.estado === "agendada" && (podeGerir || s.terapeutaId === userId) ? (
                    <GerirSessao sessionId={s.id} terapeutas={terapeutas} />
                  ) : null}
                  {(s.estado === "falta_paciente" || s.estado === "falta_terapeuta") && podeGerir ? (
                    <Link
                      href={`/agenda/semana?repor=${s.id}&patientId=${s.patientId}&terapeutaId=${s.terapeutaId}&disciplina=${encodeURIComponent(s.disciplina)}`}
                    >
                      <Button variante="secundaria" tamanho="sm">
                        Repor
                      </Button>
                    </Link>
                  ) : null}
                </Cluster>
              }
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
