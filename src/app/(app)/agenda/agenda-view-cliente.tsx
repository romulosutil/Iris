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
import { AppointmentModal } from "./appointment-modal";
import { CheckInButton } from "./checkin-button";
import { GerirSessao } from "./gerir-sessao";
import { AppointmentCard } from "@/components/ui/appointment-card";
import { CollapsibleCluster } from "@/components/ui/collapsible-cluster";
import { AgendaCalendarGrid } from "@/components/ui/agenda-calendar-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { CareCalendarIllustration } from "@/components/ui/illustrations";
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
  ehHoje?: boolean;
  visaoInicial?: string;
}

// Soma `delta` dias a uma data YYYY-MM-DD usando aritmética UTC (evita
// off-by-one de fuso ao parsear a string como local).
function somarDias(diaISO: string, delta: number): string {
  const [ano = 0, mes = 1, dia = 1] = diaISO.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + delta));
  return data.toISOString().slice(0, 10);
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
  ehHoje = true,
  visaoInicial,
}: AgendaViewClienteProps) {
  const router = useRouter();
  const isCoordenador = role === "coordenador" || role === "admin_recepcao";

  // Modo de exibição: Matriz (Geral), Terapeuta (Bento) ou Horário (Cronológico)
  const [modoVisao, setModoVisao] = React.useState<string>(
    visaoInicial ?? (isCoordenador ? "matriz" : "terapeuta"),
  );

  // Back/forward ou link com ?visao= muda a prop sem remontar — sincroniza.
  // Ajuste durante o render (padrão "derived state adjustment" do React) em
  // vez de useEffect: setState síncrono em efeito dispara render em cascata
  // (regra react-hooks) e ainda pisca um frame com a visão velha.
  const [visaoAnterior, setVisaoAnterior] = React.useState(visaoInicial);
  if (visaoInicial !== visaoAnterior) {
    setVisaoAnterior(visaoInicial);
    if (visaoInicial) setModoVisao(visaoInicial);
  }

  // Sessão aberta no modal de detalhe (visão matriz)
  const [sessaoSelecionada, setSessaoSelecionada] =
    React.useState<SessaoDoDia | null>(null);

  // Troca de visão: estado local + URL (preservando `dia`), sem scroll reset.
  const trocarVisao = (v: string) => {
    setModoVisao(v);
    const qs = new URLSearchParams();
    qs.set("visao", v);
    if (diaISO) qs.set("dia", diaISO);
    router.replace(`/agenda?${qs.toString()}`, { scroll: false });
  };

  // Navegação de datas: muda `?dia=` preservando a visão atual.
  const irParaDia = (novoDia: string | null) => {
    const qs = new URLSearchParams();
    if (novoDia) qs.set("dia", novoDia);
    qs.set("visao", modoVisao);
    router.push(`/agenda?${qs.toString()}`, { scroll: false });
  };

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
        matchEstado =
          s.estado === "falta_paciente" || s.estado === "falta_terapeuta";

      return matchBusca && matchEstado;
    });
  }, [sessoes, termoBusca, filtroEstado]);

  // Estatísticas do Dia para o Painel de KPIs
  const metricas = React.useMemo(() => {
    const total = sessoes.length;
    const realizadas = sessoes.filter((s) => s.estado === "realizada").length;
    const faltas = sessoes.filter(
      (s) => s.estado === "falta_paciente" || s.estado === "falta_terapeuta",
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
      ([, val]) =>
        val.sessoes.length > 0 ||
        (isCoordenador && !termoBusca && filtroEstado === "todas"),
    );
  }, [sessoesFiltradas, terapeutas, isCoordenador, termoBusca, filtroEstado]);

  // Cabeçalho com data + navegação de dias — visível também no dia vazio.
  const cabecalhoData = diaExtenso ? (
    <div className="flex flex-col justify-between gap-3 border-b-2 border-[var(--border-brutal)] pb-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <span className="font-display flex items-center gap-2 rounded-[var(--radius-xs)] border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] px-3 py-1 text-sm font-extrabold text-[var(--text-primary)] capitalize shadow-[2px_2px_0_0_#000000] sm:text-base">
          {ehHoje ? `Hoje · ${diaExtenso}` : diaExtenso}
        </span>
        {diaISO ? (
          <span className="hidden rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/30 bg-[var(--surface-elevated)] px-2.5 py-1 font-mono text-xs font-bold text-[var(--text-secondary)] md:inline">
            {diaISO}
          </span>
        ) : null}
      </div>
      {diaISO ? (
        <nav
          aria-label="Navegar entre dias"
          className="flex flex-wrap items-center gap-1.5"
        >
          <Button
            type="button"
            variante="secundaria"
            tamanho="sm"
            className="min-h-11"
            aria-label="Dia anterior"
            onClick={() => irParaDia(somarDias(diaISO, -1))}
          >
            ← Anterior
          </Button>
          <Button
            type="button"
            variante="secundaria"
            tamanho="sm"
            className="min-h-11"
            aria-label="Ir para hoje"
            disabled={ehHoje}
            onClick={() => irParaDia(null)}
          >
            Hoje
          </Button>
          <Button
            type="button"
            variante="secundaria"
            tamanho="sm"
            className="min-h-11"
            aria-label="Próximo dia"
            onClick={() => irParaDia(somarDias(diaISO, 1))}
          >
            Próximo →
          </Button>
          <Button asChild variante="neutra" tamanho="sm" className="min-h-11">
            <Link href="/agenda/semana">Ver semana</Link>
          </Button>
        </nav>
      ) : null}
    </div>
  ) : null;

  if (sessoes.length === 0) {
    return (
      <Stack gap="md">
        {cabecalhoData ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)] [&>*]:border-b-0 [&>*]:pb-0">
            {cabecalhoData}
          </div>
        ) : null}
        <div className="py-4 md:py-8">
          <EmptyState
            illustration={<CareCalendarIllustration size={120} />}
            title={
              ehHoje
                ? "Sua rotina do dia está concluída"
                : "Nenhuma sessão neste dia"
            }
            description={
              ehHoje
                ? "Nenhum atendimento pendente para hoje. Fim do expediente de verdade!"
                : "Não há atendimentos agendados para a data selecionada. Use a navegação acima para trocar de dia."
            }
            variant="celebration"
          />
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* KPI Topbar & Filtros de Alta Densidade */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
        {/* Cabeçalho com Data em Destaque + Navegação */}
        {cabecalhoData}

        <div className="flex flex-col justify-between gap-3 border-b border-[var(--border-brutal)]/20 pb-3 md:flex-row md:items-center">
          {/* Métricas do Dia */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-2.5 py-1 font-bold text-[var(--text-primary)]">
              📊 <strong>{metricas.total}</strong> agendamentos
            </span>
            <span className="rounded-[var(--radius-pill)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2.5 py-1 font-bold text-[var(--text-primary)]">
              ✓ <strong>{metricas.realizadas}</strong> realizadas (
              {metricas.taxaOcupacao}%)
            </span>
            {metricas.faltas > 0 ? (
              <span className="rounded-[var(--radius-pill)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2.5 py-1 font-bold text-[var(--status-error-fg)]">
                ⚠️ <strong>{metricas.faltas}</strong> faltas
              </span>
            ) : null}
          </div>

          {/* Alternador de Modo de Exibição */}
          <div className="flex items-center gap-2">
            <span className="font-display hidden text-xs font-semibold text-[var(--text-secondary)] sm:inline">
              Visão:
            </span>
            <SegmentedControl
              value={modoVisao}
              onValueChange={trocarVisao}
              opcoes={[
                { value: "matriz", label: "🗓️ Matriz Geral" },
                { value: "terapeuta", label: "👥 Por Terapeuta" },
                { value: "horario", label: "🕒 Por Horário" },
              ]}
            />
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
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
        <EmptyState
          variant="compact"
          title="Nenhuma sessão encontrada para os filtros"
          description="Ajuste os termos de busca ou filtros de estado para localizar os atendimentos."
        />
      ) : null}

      {/* Visão 1: Matriz Calendário (Horário x Terapeuta) */}
      {modoVisao === "matriz" && sessoesFiltradas.length > 0 ? (
        <AgendaCalendarGrid
          sessoes={sessoesFiltradas}
          terapeutas={terapeutas}
          onSlotClick={
            podeGerir || isCoordenador
              ? (terapeutaId, horario) => {
                  router.push(
                    `/agenda/semana?terapeutaId=${terapeutaId}&horario=${horario}`,
                  );
                }
              : undefined
          }
          onSessaoClick={(sessao) => {
            // O item da grade não carrega patientId — resolve a sessão
            // completa pela lista filtrada antes de abrir o modal.
            const completa = sessoesFiltradas.find((s) => s.id === sessao.id);
            if (completa) setSessaoSelecionada(completa);
          }}
        />
      ) : null}

      <AppointmentModal
        sessao={
          // Re-resolve pela lista atual: após check-in a revalidação atualiza
          // `sessoes`, mas o snapshot no estado ficaria com `checkInEm` velho
          // e o modal seguiria mostrando o botão.
          sessaoSelecionada
            ? (sessoes.find((x) => x.id === sessaoSelecionada.id) ??
              sessaoSelecionada)
            : null
        }
        aberto={sessaoSelecionada !== null}
        aoFechar={() => setSessaoSelecionada(null)}
        terapeutas={terapeutas}
        podeGerir={podeGerir}
        userId={userId}
        role={role}
      />

      {/* Visão 2: Bento Grid por Terapeuta */}
      {modoVisao === "terapeuta" && sessoesFiltradas.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessoesPorTerapeuta.map(([terapeutaId, grupo]) => {
            const concluidas = grupo.sessoes.filter(
              (s) => s.estado === "realizada",
            ).length;

            return (
              <CollapsibleCluster
                key={terapeutaId}
                titulo={grupo.terapeutaNome}
                subtitulo={`${grupo.sessoes.length} ${grupo.sessoes.length === 1 ? "sessão" : "sessões"} (${concluidas} ok)`}
                badgeTexto={
                  concluidas === grupo.sessoes.length &&
                  grupo.sessoes.length > 0
                    ? "CONQUISTADO"
                    : undefined
                }
                badgeVariante="sucesso"
              >
                {grupo.sessoes.length === 0 ? (
                  <p className="col-span-full py-2 text-xs text-[var(--text-secondary)] italic">
                    Sem sessões agendadas para hoje.
                  </p>
                ) : (
                  grupo.sessoes.map((s) => (
                    <AppointmentCard
                      key={s.id}
                      horario={horaDaSessao(s.agendadaPara)}
                      pacienteNome={
                        s.pacienteNome ?? "Paciente (acesso restrito)"
                      }
                      estado={
                        s.estado === "realizada" ? "aprovada" : "sugerida"
                      }
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
                index >= 2 && "animate-delay-225",
              )}
              title={
                <Cluster gap="sm" className="items-center">
                  <span className="font-display text-lg font-bold text-[var(--text-primary)]">
                    {horaDaSessao(s.agendadaPara)}
                  </span>
                  <EstadoBadge estado={s.estado} />
                </Cluster>
              }
              subtitle={
                <span>
                  {s.pacienteNome ?? "Paciente (acesso restrito)"}
                  {s.terapeutaNome ? (
                    <span className="text-[var(--text-secondary)]">
                      {" "}
                      · {s.terapeutaNome}
                    </span>
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
                    <CheckInButton sessionId={s.id} checkInEm={s.checkInEm} />
                  ) : null}
                  {s.estado === "agendada" &&
                  (podeGerir || s.terapeutaId === userId) ? (
                    <GerirSessao sessionId={s.id} terapeutas={terapeutas} />
                  ) : null}
                  {(s.estado === "falta_paciente" ||
                    s.estado === "falta_terapeuta") &&
                  podeGerir ? (
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
