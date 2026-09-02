"use client";

import React, { useState, useEffect } from "react";
import { Scrubber } from "./scrubber";
import { DeltaSessaoLateral } from "./delta-sessao";
import { EstadoDeErro } from "./estado-de-erro";
import { GraficoEspectro } from "./grafico-espectro";
import { VistaNav, type VistaEvolucao } from "./vista-nav";
import {
  carregarDeltaSessaoAction,
  carregarComparacaoAction,
  carregarEvidenciasAction,
} from "./actions";
import { rotuloAte, rotuloPonto } from "./rotulos";
import type {
  TimelineSnapshot,
  TimelineData,
  ResumoEvidenciaTrecho,
} from "./queries";
import type { ResultadoSegmentacao } from "@/lib/evidence/snapshot-schema";
import { estadoDoMarco, type DeltaSessao as DeltaSessaoType } from "./logic";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PatientProgressIllustration } from "@/components/ui/illustrations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { surface } from "@/components/ui/primitives/surface";
import {
  MarcoStatus,
  type MarcoStatusEstado,
} from "@/components/ui/patterns/marco-status";
import { BarraProgressoEpistemica } from "@/components/ui/patterns/barra-progresso-epistemica";

type DeltaMeta = { id: string; descricao: string; disciplina: string | null };
type DeltaMilestone = { id: string; nome: string; dominioId: string };

interface ComparacaoData {
  delta: DeltaSessaoType | null;
  protocoloMudou: boolean;
  metas: DeltaMeta[];
  milestones: DeltaMilestone[];
}

/**
 * Ícone de aviso em traço, `currentColor`, no estilo de `estado-de-erro.tsx`.
 * Substitui o emoji de aviso, que tem nome anunciado de forma inconsistente
 * entre leitores de tela e não herda a cor do texto do bloco.
 */
function IconeAviso() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="mt-px shrink-0"
    >
      <path
        d="M10 2.5 18.5 17.5H1.5L10 2.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="miter"
      />
      <path
        d="M10 7.5v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
      <circle cx="10" cy="14.5" r="1" fill="currentColor" />
    </svg>
  );
}

interface TimelineClientProps {
  patientId: string;
  pacienteNome: string;
  initialData: TimelineData;
  vista: VistaEvolucao;
}

export function TimelineClient({
  patientId,
  pacienteNome,
  initialData,
  vista,
}: TimelineClientProps) {
  const { snapshots, metasAtivas, milestonesAtivos } = initialData;

  // Lista ordenada crescente de números de sessões disponíveis
  const sessoesDisponiveis = [...snapshots]
    .map((s) => s.sessionNumero)
    .sort((a, b) => a - b);

  // Sessão atual selecionada no Scrubber (inicia na mais recente)
  const [sessaoAtiva, setSessaoAtiva] = useState<number | null>(
    sessoesDisponiveis[sessoesDisponiveis.length - 1] ?? null,
  );

  // Encontra o snapshot selecionado
  const snapSelecionado =
    sessaoAtiva !== null
      ? (snapshots.find((s) => s.sessionNumero === sessaoAtiva) ?? null)
      : null;

  // Snapshot imediatamente anterior ao selecionado — é o que dá o contorno
  // tracejado do Espectro. "Anterior" aqui é a sessão anterior COM snapshot,
  // não `sessaoAtiva - 1`: sessão sem evidência aprovada não gera snapshot, e
  // comparar com um número que não existe devolveria undefined em silêncio.
  const snapAnterior = React.useMemo(() => {
    if (sessaoAtiva === null) return null;
    const anteriores = snapshots
      .filter((s) => s.sessionNumero < sessaoAtiva)
      .sort((a, b) => b.sessionNumero - a.sessionNumero);
    return anteriores[0] ?? null;
  }, [snapshots, sessaoAtiva]);

  // Estado para a trajetória selecionada
  const [trajetoriaAlvoId, setTrajetoriaAlvoId] = useState<string>("");

  // Estados do Modal de Evidências (Drilldown)
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownChunk, setDrilldownChunk] = useState<{
    inicio: number;
    fim: number;
    targetId: string;
    targetNome: string;
  } | null>(null);
  const [drilldownEvidencias, setDrilldownEvidencias] = useState<
    ResumoEvidenciaTrecho[]
  >([]);
  const [carregandoEvidencias, setCarregandoEvidencias] = useState(false);
  // Falha de carregamento é estado próprio, NUNCA lista vazia: `[]` renderiza
  // "Nenhuma evidência registrada para este trecho", que é uma afirmação
  // clínica que a rede não autorizou ninguém a fazer. Ver `estado-de-erro.tsx`.
  const [erroEvidencias, setErroEvidencias] = useState(false);

  // Mapeia milestones ativos agrupados por domínio
  const milestonesPorDominio = React.useMemo(() => {
    const grupos: Record<string, typeof initialData.milestonesAtivos> = {};
    for (const m of initialData.milestonesAtivos ?? []) {
      let grupo = grupos[m.dominioId];
      if (!grupo) {
        grupo = [];
        grupos[m.dominioId] = grupo;
      }
      grupo.push(m);
    }
    // Ordena por nível/ordem
    for (const dom of Object.keys(grupos)) {
      grupos[dom]!.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    }
    return grupos;
  }, [initialData.milestonesAtivos]);

  // Contagem por domínio pelo estado OFICIAL (meta dominada / candidatura
  // registrada) — é o estado atual, não o da sessão selecionada (revisão da
  // PR #556: o snapshot só carrega heurística).
  const estatisticasDominio = React.useMemo(() => {
    const stats: Record<
      string,
      { total: number; conquistados: number; candidatos: number }
    > = {};
    for (const [dom, items] of Object.entries(milestonesPorDominio)) {
      let conquistados = 0;
      let candidatos = 0;
      for (const m of items) {
        const estado = estadoDoMarco(
          initialData.estadoDasMetas,
          m.goalIds,
          m.candidatoOficial,
        );
        if (estado === "conquistado") conquistados++;
        else if (estado === "candidato") candidatos++;
      }
      stats[dom] = {
        total: items.length,
        conquistados,
        candidatos,
      };
    }
    return stats;
  }, [milestonesPorDominio, initialData.estadoDasMetas]);

  const buscarEvidencias = async (alvo: {
    inicio: number;
    fim: number;
    targetId: string;
  }) => {
    setCarregandoEvidencias(true);
    setErroEvidencias(false);
    setDrilldownEvidencias([]);
    try {
      const res = await carregarEvidenciasAction(
        patientId,
        alvo.targetId,
        alvo.inicio,
        alvo.fim,
      );
      setDrilldownEvidencias(res);
    } catch (err) {
      setErroEvidencias(true);
      console.error("Erro ao buscar evidências por trecho:", err);
    } finally {
      setCarregandoEvidencias(false);
    }
  };

  const handleAbrirDrilldown = async (
    chunk: { inicio: number; fim: number },
    targetId: string,
    targetNome: string,
  ) => {
    setDrilldownChunk({
      inicio: chunk.inicio,
      fim: chunk.fim,
      targetId,
      targetNome,
    });
    setDrilldownOpen(true);
    await buscarEvidencias({
      inicio: chunk.inicio,
      fim: chunk.fim,
      targetId,
    });
  };

  const getTargetNome = (id: string) => {
    const g = initialData.metasAtivas.find((m) => m.id === id);
    if (g) return `Meta: ${g.descricao}`;
    const m = initialData.milestonesAtivos.find((mi) => mi.id === id);
    if (m)
      return `Marco: ${m.nome} (${m.dominioId.toUpperCase()}${m.nivel ? ` - ${m.nivel}` : ""})`;
    return "Alvo Clínico";
  };

  const getTrajetoriaChunks = (targetId: string) => {
    if (!targetId) return [];

    // O snapshot é indexado por META (`segmentacao[goal_id][protocol_id]`).
    // Meta: a própria; marco: as metas mapeadas a ele. Primeiro par
    // (meta, protocolo) em ordem de id que tiver dado define o trecho —
    // rateio entre protocolos exigiria um peso que ninguém declarou.
    // Decisão pendente de ratificação (PR #556, revisão 03/09), junto da
    // régua de `estadoDoMarco` em ./logic.ts.
    const goalIdsAlvo = initialData.metasAtivas.some((m) => m.id === targetId)
      ? [targetId]
      : (initialData.milestonesAtivos.find((m) => m.id === targetId)?.goalIds ??
        []);

    const trajetoriaSessoes = snapshots
      .map((s) => {
        let resSessao: ResultadoSegmentacao | undefined;
        for (const goalId of [...goalIdsAlvo].sort()) {
          const porProtocolo = s.segmentacao[goalId];
          if (!porProtocolo) continue;
          const protocolId = Object.keys(porProtocolo).sort()[0];
          if (protocolId) {
            resSessao = porProtocolo[protocolId];
            break;
          }
        }
        return {
          sessionNumero: s.sessionNumero,
          rotulo: resSessao?.rotulo ?? "sem_dado",
          // `metrica` pode ser string (legado / sinais.ts) — só o objeto tem nível.
          nivel:
            typeof resSessao?.metrica === "object"
              ? (resSessao.metrica?.ordinalRecente ?? null)
              : null,
        };
      })
      .sort((a, b) => a.sessionNumero - b.sessionNumero);

    if (trajetoriaSessoes.length === 0) return [];

    const chunks: Array<{
      inicio: number;
      fim: number;
      rotulo: string;
      nivel: number | null;
      sessoes: number[];
    }> = [];

    for (const sessao of trajetoriaSessoes) {
      const ultimoTrecho = chunks[chunks.length - 1];
      if (
        ultimoTrecho &&
        ultimoTrecho.rotulo === sessao.rotulo &&
        ultimoTrecho.nivel === sessao.nivel
      ) {
        ultimoTrecho.fim = sessao.sessionNumero;
        ultimoTrecho.sessoes.push(sessao.sessionNumero);
      } else {
        chunks.push({
          inicio: sessao.sessionNumero,
          fim: sessao.sessionNumero,
          rotulo: sessao.rotulo,
          nivel: sessao.nivel,
          sessoes: [sessao.sessionNumero],
        });
      }
    }

    return chunks;
  };

  // Estados do Comparador
  const [compararAtivo, setCompararAtivo] = useState(false);
  const [sessaoComparar, setSessaoComparar] = useState<number | null>(null);

  // Dados carregados dinamicamente
  const [deltaSessao, setDeltaSessao] = useState<DeltaSessaoType | null>(null);
  const [deltaMetas, setDeltaMetas] = useState<DeltaMeta[]>([]);
  const [deltaMilestones, setDeltaMilestones] = useState<DeltaMilestone[]>([]);

  const [comparacaoData, setComparacaoData] = useState<ComparacaoData | null>(
    null,
  );

  // Delta e comparação são duas requisições independentes com estados de
  // carga e erro próprios (`carregandoDelta`, `carregandoComparacao`).
  const [carregandoDelta, setCarregandoDelta] = useState(false);
  const [erroDelta, setErroDelta] = useState(false);
  const [carregandoComparacao, setCarregandoComparacao] = useState(false);
  const [erroComparacao, setErroComparacao] = useState(false);
  // Incrementado pelo "Tentar de novo": entra na lista de dependências do
  // efeito e é o que o torna re-executável sem mudar a sessão selecionada.
  const [tentativaDelta, setTentativaDelta] = useState(0);
  const [tentativaComparacao, setTentativaComparacao] = useState(0);
  const sessaoCompararValida =
    sessaoComparar !== sessaoAtiva ? sessaoComparar : null;
  const podeComparar = sessoesDisponiveis.length >= 2;

  const handleSelecionarSessao = (numero: number) => {
    setSessaoAtiva(numero);
    setSessaoComparar((atual) => (atual === numero ? null : atual));
    setComparacaoData(null);
  };

  const handleCompararAtivoChange = (ativo: boolean) => {
    setCompararAtivo(ativo);
    if (!ativo) setComparacaoData(null);
  };

  const handleSelecionarSessaoComparar = (numero: number) => {
    setSessaoComparar(numero === sessaoAtiva ? null : numero);
    setComparacaoData(null);
  };

  // Carrega o delta da sessão selecionada
  useEffect(() => {
    if (sessaoAtiva === null) return;

    let active = true;

    const carregar = async () => {
      setCarregandoDelta(true);
      setErroDelta(false);
      try {
        const res = await carregarDeltaSessaoAction(patientId, sessaoAtiva);
        if (!active) return;

        setDeltaSessao(res.delta);
        setDeltaMetas(res.metas);
        setDeltaMilestones(res.milestones);
      } catch (err) {
        if (!active) return;
        setDeltaSessao(null);
        setDeltaMetas([]);
        setDeltaMilestones([]);
        // Sem esta marca, `delta === null` cai no empty state do painel, que
        // diz "Nenhuma alteração clínica registrada nesta sessão" — um fato
        // clínico inventado a partir de uma falha de rede.
        setErroDelta(true);
        console.error("Erro ao carregar delta da sessão:", err);
      } finally {
        if (active) {
          setCarregandoDelta(false);
        }
      }
    };

    void carregar();

    return () => {
      active = false;
    };
  }, [sessaoAtiva, patientId, tentativaDelta]);

  // Carrega a comparação quando uma sessão for selecionada no select
  useEffect(() => {
    if (
      !compararAtivo ||
      sessaoAtiva === null ||
      sessaoCompararValida === null
    ) {
      return;
    }

    let active = true;

    const carregar = async () => {
      setCarregandoComparacao(true);
      setErroComparacao(false);
      try {
        const res = await carregarComparacaoAction(
          patientId,
          sessaoAtiva,
          sessaoCompararValida,
        );
        if (active && res) {
          setComparacaoData({
            delta: res.delta ?? null,
            protocoloMudou: res.protocoloMudou,
            metas: res.metas,
            milestones: res.milestones,
          });
        }
      } catch (err) {
        if (!active) return;
        setComparacaoData(null);
        setErroComparacao(true);
        console.error("Erro ao carregar comparação:", err);
      } finally {
        if (active) setCarregandoComparacao(false);
      }
    };

    void carregar();

    return () => {
      active = false;
    };
  }, [
    compararAtivo,
    sessaoAtiva,
    sessaoCompararValida,
    patientId,
    tentativaComparacao,
  ]);

  const renderTrajetoriaMetas = () => {
    const chunks = getTrajetoriaChunks(trajetoriaAlvoId);
    const targetNome = getTargetNome(trajetoriaAlvoId);

    const deparaTraducaoRotulo: Record<string, string> = {
      evolucao: "Evolução",
      regressao: "Regressão",
      estagnacao: "Estagnação",
      aguardando_avaliacao_formal: "Avaliação pendente",
      sem_dado: "Sem dados",
    };

    return (
      <div className="border-ink-anchor flex flex-col border-2 bg-[var(--surface-card)] p-4 sm:p-6">
        <div className="border-ink-anchor border-b-2 pb-4">
          <h3 className="text-ink font-display text-lg font-black">
            Trajetória Clínica de Metas
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Selecione uma meta ou marco para visualizar o andamento clínico e
            explorar evidências do trecho.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label
              htmlFor="select-trajetoria-alvo"
              className="text-ink shrink-0 text-xs font-black"
            >
              Meta / Marco de Referência:
            </label>
            <select
              id="select-trajetoria-alvo"
              value={trajetoriaAlvoId}
              onChange={(e) => setTrajetoriaAlvoId(e.target.value)}
              className="border-ink-anchor text-ink focus-visible:outline-focus min-h-[var(--control-sm)] w-full max-w-full min-w-0 flex-1 border-2 bg-[var(--surface-card)] px-3 text-sm focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
            >
              <option value="">Selecione...</option>
              <optgroup label="Metas Ativas">
                {metasAtivas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.descricao} {m.disciplina ? `(${m.disciplina})` : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Marcos Ativos">
                {milestonesAtivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.dominioId.toUpperCase()}] {m.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {!trajetoriaAlvoId ? (
          <EmptyState
            variant="compact"
            className="mt-6"
            title="Selecione um alvo"
            description="Escolha uma meta ou marco acima para visualizar a trajetória de evolução clínica."
          />
        ) : chunks.length === 0 ? (
          <EmptyState
            variant="compact"
            className="mt-6"
            title="Nenhum dado histórico registrado"
            description="Ainda não há registros de sessões anteriores para este alvo específico."
          />
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <div className="text-ink border-ink-anchor border bg-[var(--surface-elevated)] px-3 py-2 text-sm font-bold">
              Trajetória: {targetNome}
            </div>
            {/* Visualização de Chunks como linha temporal */}
            <div className="flex flex-col gap-3">
              {chunks.map((chunk, idx) => {
                let colorClass =
                  "bg-[var(--surface-elevated)] border-dashed border-[var(--border-brutal)] text-[var(--text-secondary)] shadow-[var(--ds-shadow)]";
                if (chunk.rotulo === "evolucao") {
                  colorClass =
                    "bg-[var(--status-success-bg)] border-[var(--border-brutal)] text-[var(--status-success-fg)] shadow-[var(--ds-shadow)]";
                } else if (chunk.rotulo === "regressao") {
                  colorClass =
                    "bg-[var(--status-error-bg)] border-[var(--border-brutal)] text-[var(--status-error-fg)] shadow-[var(--ds-shadow)]";
                } else if (chunk.rotulo === "estagnacao") {
                  colorClass =
                    "bg-[var(--surface-elevated)] border-[var(--border-brutal)] text-[var(--text-primary)] shadow-[var(--ds-shadow)]";
                }

                return (
                  <button
                    key={idx}
                    onClick={() =>
                      handleAbrirDrilldown(chunk, trajetoriaAlvoId, targetNome)
                    }
                    className={`focus-visible:outline-focus flex flex-col gap-2 rounded-[var(--radius-control)] border-2 p-4 text-left transition-all duration-75 focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)] active:translate-y-0.5 sm:flex-row sm:items-center sm:justify-between ${colorClass}`}
                  >
                    <div>
                      <span className="font-display text-base font-black tracking-tight uppercase">
                        {deparaTraducaoRotulo[chunk.rotulo] || chunk.rotulo}
                      </span>
                      <div className="mt-1 text-xs font-bold">
                        {rotuloPonto(chunk.inicio)}{" "}
                        {chunk.fim !== chunk.inicio ? rotuloAte(chunk.fim) : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {chunk.nivel !== null && (
                        <span className="rounded-[var(--radius-sm)] border border-[var(--border-brutal)] bg-[var(--surface-card)] px-2 py-0.5 text-xs font-black">
                          Nível {chunk.nivel}
                        </span>
                      )}
                      <span className="text-xs font-black underline">
                        Ver {chunk.sessoes.length}{" "}
                        {chunk.sessoes.length === 1 ? "sessão" : "sessões"} →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGraficoProtocolo = () => {
    if (!snapSelecionado) return null;

    return (
      <div className="border-ink-anchor flex flex-col border-2 bg-[var(--surface-card)] p-4 sm:p-6">
        <div className="border-ink-anchor border-b-2 pb-4">
          <h3 className="text-ink font-display text-lg font-black">
            Acompanhamento de Marcos e Protocolos
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Estado oficial dos marcos por domínio: dominado (meta com critério
            de domínio cumprido), candidato (candidatura registrada) ou não
            atingido. É o estado atual, não o da sessão selecionada.
          </p>
        </div>

        {Object.keys(milestonesPorDominio).length === 0 ? (
          <EmptyState
            className="mt-6"
            illustration={<PatientProgressIllustration size={90} />}
            title="Cada pequena conquista conta"
            description="Nenhum protocolo ou marco ativo associado a este paciente. Vincule um protocolo para iniciar o acompanhamento."
          />
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {Object.entries(milestonesPorDominio).map(([dom, items]) => {
              const stats = estatisticasDominio[dom] ?? {
                total: 0,
                conquistados: 0,
                candidatos: 0,
              };
              return (
                <div
                  key={dom}
                  className={surface("solida", {
                    radius: "md",
                    className: "bg-[var(--surface-elevated)] p-3 sm:p-4",
                  })}
                >
                  <div className="mb-4 flex flex-col gap-2 border-b border-[var(--border-brutal)] pb-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-display text-sm font-black tracking-tight uppercase">
                        Domínio: {dom.toUpperCase()}
                      </span>
                      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {stats.total}{" "}
                        {stats.total === 1
                          ? "marco catalogado"
                          : "marcos catalogados"}
                      </div>
                    </div>
                    {/* Contagens com o par de tokens de cada estado: menta =
                        conquistado (fato); --status-progresso-* = candidato a
                        domínio — fato humano ainda não consolidado, NUNCA o
                        violeta de "sugerido pela IA" (DS-02, #538). */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      <span className="border-status-success-border bg-status-success-bg text-status-success-fg rounded-[var(--radius-sm)] border px-1.5 py-0.5">
                        Conquistados: {stats.conquistados}
                      </span>
                      <span className="border-status-progresso-border bg-status-progresso-bg text-status-progresso-fg rounded-[var(--radius-sm)] border px-1.5 py-0.5">
                        Candidatos a domínio: {stats.candidatos}
                      </span>
                    </div>
                  </div>

                  <BarraProgressoEpistemica
                    className="mb-4"
                    rotulo={`Domínio ${dom}`}
                    total={stats.total}
                    conquistados={stats.conquistados}
                    candidatos={stats.candidatos}
                  />

                  {/* Grade de marcos: lista semântica; cada marco anuncia o
                      estado pelo glifo nomeado do MarcoStatus, nunca por
                      `title` nem por cor sozinha (AC-01/U-03). */}
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
                    {items.map((m) => {
                      const estado = estadoDoMarco(
                        initialData.estadoDasMetas,
                        m.goalIds,
                        m.candidatoOficial,
                      );

                      return (
                        <li key={m.id} className="min-w-0">
                          <MarcoStatus
                            estado={estado}
                            nome={m.nome}
                            nivel={m.nivel}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderComparador = () => {
    if (!podeComparar) return null;

    return (
      <div className="border-ink-anchor flex flex-col gap-4 border-2 bg-[var(--surface-card)] p-4">
        <div className="border-ink-anchor border-b-2 pb-2">
          <h3 className="text-ink text-base font-black">
            Comparar Pontos Temporais
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Selecione outra sessão para ver a evolução agregada no tempo.
          </p>
        </div>

        {/* O <label> envolve o input para que a area clicavel inteira, e
            nao so a caixa, alcance o piso tatil de --control-sm (44px). */}
        <label
          htmlFor="checkbox-comparar"
          className="flex min-h-[var(--control-sm)] cursor-pointer items-center gap-3"
        >
          <input
            id="checkbox-comparar"
            type="checkbox"
            checked={compararAtivo}
            onChange={(e) => handleCompararAtivoChange(e.target.checked)}
            className="border-ink-anchor accent-gold size-5 cursor-pointer border-2"
          />
          <span className="text-ink text-sm font-bold">
            Ativar Comparador Temporal
          </span>
        </label>

        {compararAtivo && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="select-sessao-comparar"
                className="text-ink text-xs font-bold"
              >
                Comparar {rotuloPonto(sessaoAtiva ?? 0)} com:
              </label>
              <select
                id="select-sessao-comparar"
                value={sessaoCompararValida ?? ""}
                onChange={(e) =>
                  handleSelecionarSessaoComparar(Number(e.target.value))
                }
                className="border-ink-anchor text-ink focus-visible:outline-focus min-h-[var(--control-sm)] w-full max-w-full min-w-0 border-2 bg-[var(--surface-card)] px-3 text-sm focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {sessoesDisponiveis
                  .filter((n) => n !== sessaoAtiva)
                  .map((n) => (
                    <option key={n} value={n}>
                      {rotuloPonto(n)}
                    </option>
                  ))}
              </select>
            </div>

            {carregandoComparacao && (
              <div className="animate-pulse text-xs text-[var(--text-secondary)]">
                Carregando comparação...
              </div>
            )}

            {erroComparacao && (
              <EstadoDeErro
                titulo="A comparação não foi carregada"
                descricao="Não foi possível comparar as duas sessões agora. Nada foi calculado — o resultado abaixo não existe, não é um resultado vazio."
                onTentarDeNovo={() => setTentativaComparacao((n) => n + 1)}
              />
            )}

            {/* Exibição do Delta de Comparação */}
            {comparacaoData && !erroComparacao && (
              <div className="border-ink-anchor flex flex-col gap-3 border-t-2 pt-3">
                {/* Mudança de protocolo entre as duas sessões: a comparação
                    de nível de ajuda fica suspensa. `role="status"` — a
                    semântica que interrompe o leitor de tela é reservada ao
                    risco clínico (mesma decisão de `estado-de-erro.tsx`). */}
                {comparacaoData.protocoloMudou ? (
                  <div
                    role="status"
                    className="flex items-start gap-2 rounded-[var(--radius-control)] border-2 border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-2.5 text-xs font-bold text-[var(--status-warning-fg)]"
                  >
                    <IconeAviso />
                    <div>
                      <strong>Comparação suspensa.</strong> Os protocolos ativos
                      mudaram entre{" "}
                      {rotuloPonto(
                        Math.min(sessaoAtiva ?? 0, sessaoCompararValida ?? 0),
                      )}{" "}
                      e{" "}
                      {rotuloPonto(
                        Math.max(sessaoAtiva ?? 0, sessaoCompararValida ?? 0),
                      )}
                      , e as escalas de nível de ajuda das duas não são
                      equivalentes. Comparar os números daria uma diferença que
                      não existe clinicamente.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] p-1.5 text-center text-xs font-bold text-[var(--action-primary-fg)]">
                      Resultados da Comparação
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Evolução de{" "}
                      {rotuloPonto(
                        Math.min(sessaoAtiva ?? 0, sessaoCompararValida ?? 0),
                      )}{" "}
                      para{" "}
                      {rotuloPonto(
                        Math.max(sessaoAtiva ?? 0, sessaoCompararValida ?? 0),
                      )}
                      :
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="rounded-[var(--radius-control)] border-2 border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-2 font-bold text-[var(--status-success-fg)]">
                        +
                        {comparacaoData.delta?.itens?.filter(
                          (i) => i.tipo === "evolucao" || i.tipo === "novo",
                        ).length ?? 0}{" "}
                        Avanços
                      </div>
                      <div className="rounded-[var(--radius-control)] border-2 border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-2 font-bold text-[var(--status-error-fg)]">
                        +
                        {comparacaoData.delta?.itens?.filter(
                          (i) => i.tipo === "regressao",
                        ).length ?? 0}{" "}
                        Recuos
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDrilldown = () => (
    <Dialog open={drilldownOpen} onOpenChange={setDrilldownOpen}>
      <DialogContent className="max-w-2xl border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]">
        <DialogTitle className="font-display text-xl font-black text-[var(--text-primary)]">
          Evidências Clínicas do Trecho
        </DialogTitle>
        <DialogDescription className="text-sm font-bold text-[var(--text-secondary)]">
          {rotuloPonto(drilldownChunk?.inicio ?? 0)}{" "}
          {drilldownChunk?.fim !== drilldownChunk?.inicio
            ? rotuloAte(drilldownChunk?.fim ?? 0)
            : ""}{" "}
          para {drilldownChunk?.targetNome}
        </DialogDescription>

        <div className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-2">
          {carregandoEvidencias ? (
            <div className="animate-pulse py-8 text-center text-sm font-black text-[var(--text-secondary)]">
              Buscando evidências no histórico do paciente...
            </div>
          ) : erroEvidencias ? (
            <EstadoDeErro
              titulo="As evidências deste trecho não foram carregadas"
              descricao="A busca no histórico do paciente falhou. Isto não significa que o trecho esteja sem evidências — significa que ainda não sabemos o que há nele."
              onTentarDeNovo={() => {
                if (drilldownChunk) void buscarEvidencias(drilldownChunk);
              }}
            />
          ) : drilldownEvidencias.length === 0 ? (
            <div className="rounded-[var(--radius-control)] border-2 border-dashed border-[var(--border-brutal)]/40 bg-[var(--surface-elevated)] py-8 text-center text-sm font-bold text-[var(--text-secondary)]">
              Nenhuma evidência registrada para este trecho nas sessões
              selecionadas.
            </div>
          ) : (
            drilldownEvidencias.map((ev) => (
              <div
                key={ev.id}
                /* Sem acento lateral: o DS baniu a faixa esquerda, e a
                   polaridade já é dita pela pílula "Evolução"/"Dificuldade"
                   logo abaixo — nenhuma informação se perde. */
                className="flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]"
              >
                <div className="flex flex-col gap-1 border-b border-[var(--border-brutal)]/20 pb-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-black text-[var(--text-primary)]">
                    {rotuloPonto(ev.sessionNumero)} •{" "}
                    {ev.dataSessao
                      ? new Date(ev.dataSessao).toLocaleDateString("pt-BR")
                      : "Sem data"}
                  </span>
                  <span className="font-bold text-[var(--text-secondary)]">
                    Aprovado por: {ev.aprovadorNome}
                  </span>
                </div>
                <p className="text-sm leading-relaxed font-medium text-[var(--text-primary)]">
                  {ev.descricao}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-[var(--radius-pill)] border border-[var(--border-brutal)] px-2 py-0.5 text-xs font-bold ${
                      ev.polaridade === "positiva"
                        ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                        : "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
                    }`}
                  >
                    {ev.polaridade === "positiva" ? "Evolução" : "Dificuldade"}
                  </span>
                  {ev.nivelAjuda && (
                    <span className="rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-2 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                      Nível de Ajuda: {ev.nivelAjuda}
                    </span>
                  )}
                </div>
                {ev.revisao && (
                  <p className="mt-1 border-t border-[var(--border-brutal)]/20 pt-1 text-xs font-medium text-[var(--text-secondary)]">
                    Revisado por {ev.revisao.autorNome ?? "coordenador"}
                    {ev.revisao.justificativa
                      ? `: ${ev.revisao.justificativa}`
                      : ""}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setDrilldownOpen(false)}>Fechar Painel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <VistaNav basePath={`/pacientes/${patientId}`} vistaAtual={vista} />

      {vista === "sessao" ? (
        /*
          "Esta sessão" não tem relógio: é sempre a sessão mais recente. O
          scrubber (e, com ele, o conceito de "estou olhando o passado") vive
          só na vista "No tempo". Uma pergunta, uma tela — resolve o P2 "seis
          regiões, três relógios, nenhuma âncora".
        */
        <div className="flex flex-col gap-6">
          <DeltaSessaoLateral
            delta={deltaSessao}
            metas={deltaMetas}
            milestones={deltaMilestones}
            carregando={carregandoDelta}
            erro={erroDelta}
            onTentarDeNovo={() => setTentativaDelta((n) => n + 1)}
          />
          {snapSelecionado && sessaoAtiva !== null ? (
            <GraficoEspectro
              espectro={snapSelecionado.espectro}
              espectroAnterior={snapAnterior?.espectro ?? null}
              sessaoAtiva={sessaoAtiva}
              sessaoAnterior={snapAnterior?.sessionNumero ?? null}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Scrubber
            sessoesDisponiveis={sessoesDisponiveis}
            sessaoSelecionada={sessaoAtiva ?? 0}
            dataSessaoSelecionada={snapSelecionado?.geradoEm}
            onSelecionarSessao={handleSelecionarSessao}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              {renderTrajetoriaMetas()}
              {renderGraficoProtocolo()}
            </div>
            <div className="flex flex-col gap-6">{renderComparador()}</div>
          </div>
        </div>
      )}

      {renderDrilldown()}
    </div>
  );
}
