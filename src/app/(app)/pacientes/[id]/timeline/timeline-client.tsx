"use client";

import React, { useState, useEffect, useTransition } from "react";
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
import type { TimelineSnapshot, TimelineData } from "./queries";
import type { DeltaSessao as DeltaSessaoType } from "./logic";
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

type DeltaMeta = { id: string; descricao: string; disciplina: string | null };
type DeltaMilestone = { id: string; nome: string; dominioId: string };

interface ComparacaoData {
  delta: DeltaSessaoType | null;
  protocoloMudou: boolean;
  metas: DeltaMeta[];
  milestones: DeltaMilestone[];
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
  const [sessaoAtiva, setSessaoAtiva] = useState<number>(
    sessoesDisponiveis[sessoesDisponiveis.length - 1] ?? 1,
  );

  // Encontra o snapshot selecionado
  const snapSelecionado =
    snapshots.find((s) => s.sessionNumero === sessaoAtiva) ?? null;

  // Snapshot imediatamente anterior ao selecionado — é o que dá o contorno
  // tracejado do Espectro. "Anterior" aqui é a sessão anterior COM snapshot,
  // não `sessaoAtiva - 1`: sessão sem evidência aprovada não gera snapshot, e
  // comparar com um número que não existe devolveria undefined em silêncio.
  const snapAnterior = React.useMemo(() => {
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
  const [drilldownEvidencias, setDrilldownEvidencias] = useState<any[]>([]);
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

  // Estatísticas de conquistas e candidatos na sessão atual
  const estatisticasDominio = React.useMemo(() => {
    const stats: Record<
      string,
      { total: number; conquistados: number; candidatos: number }
    > = {};
    for (const [dom, items] of Object.entries(milestonesPorDominio)) {
      let conquistados = 0;
      let candidatos = 0;
      for (const m of items) {
        const entry = snapSelecionado?.repertorioState?.[m.id];
        if (entry) {
          if (entry.nivelAjudaRecente === 0) {
            conquistados++;
          } else if (entry.isCandidata) {
            candidatos++;
          }
        }
      }
      stats[dom] = {
        total: items.length,
        conquistados,
        candidatos,
      };
    }
    return stats;
  }, [milestonesPorDominio, snapSelecionado]);

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

    const trajetoriaSessoes = snapshots
      .map((s) => {
        const seg = (s.segmentacao ?? {}) as Record<string, any>;
        const resSessao = seg[targetId]; // ResultadoSessao
        return {
          sessionNumero: s.sessionNumero,
          rotulo: resSessao?.rotulo ?? "sem_dado",
          nivel: resSessao?.metrica?.ordinalRecente ?? null,
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

  const [, startTransition] = useTransition();
  // Delta e comparação são duas requisições independentes. Enquanto as duas
  // liam o MESMO `isPending` do `useTransition`, o painel de delta recebia
  // `carregando={isPending && !compararAtivo}`: com o comparador ligado ele
  // nunca mostrava carga, e trocar de sessão deixava os números da sessão
  // anterior na tela sem nenhum sinal de que estavam obsoletos.
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
    if (!sessaoAtiva) return;

    let active = true;

    startTransition(async () => {
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
        if (active) setCarregandoDelta(false);
      }
    });

    return () => {
      active = false;
    };
  }, [sessaoAtiva, patientId, tentativaDelta]);

  // Carrega dados da comparação
  useEffect(() => {
    if (!compararAtivo || sessaoCompararValida === null) {
      return;
    }

    let active = true;

    startTransition(async () => {
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
    });

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
      <div className="bg-canvas border-ink-anchor flex flex-col border-2 p-6">
        <div className="border-ink-anchor border-b-2 pb-4">
          <h3 className="text-ink font-display text-lg font-black">
            Trajetória Clínica de Metas
          </h3>
          <p className="text-muted mt-1 text-sm">
            Selecione uma meta ou marco para visualizar o andamento clínico e
            explorar evidências do trecho.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label
              htmlFor="select-trajetoria-alvo"
              className="text-ink text-xs font-black"
            >
              Meta / Marco de Referência:
            </label>
            <select
              id="select-trajetoria-alvo"
              value={trajetoriaAlvoId}
              onChange={(e) => setTrajetoriaAlvoId(e.target.value)}
              className="border-ink-anchor bg-canvas text-ink flex-1 border-2 p-2 text-sm focus:outline-none"
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
            <div className="text-ink border-ink-anchor bg-bg-canvas border px-3 py-2 text-sm font-bold">
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
                    className={`flex flex-col gap-2 rounded-[var(--radius-control)] border-2 p-4 text-left transition-all duration-75 focus:outline-none active:translate-y-0.5 sm:flex-row sm:items-center sm:justify-between ${colorClass}`}
                  >
                    <div>
                      <span className="font-display text-base font-black tracking-tight uppercase">
                        {deparaTraducaoRotulo[chunk.rotulo] || chunk.rotulo}
                      </span>
                      <div className="mt-1 text-xs font-bold">
                        Sessão {chunk.inicio}{" "}
                        {chunk.fim !== chunk.inicio
                          ? `até a Sessão ${chunk.fim}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {chunk.nivel !== null && (
                        <span className="rounded border border-black bg-white px-2 py-0.5 text-xs font-black">
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
      <div className="bg-canvas border-ink-anchor flex flex-col border-2 p-6">
        <div className="border-ink-anchor border-b-2 pb-4">
          <h3 className="text-ink font-display text-lg font-black">
            Acompanhamento de Marcos e Protocolos
          </h3>
          <p className="text-muted mt-1 text-sm">
            Estatísticas e progresso de marcos por domínio do protocolo ativo na
            Sessão {sessaoAtiva}.
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
              const percConquistados =
                stats.total > 0 ? (stats.conquistados / stats.total) * 100 : 0;
              const percCandidatos =
                stats.total > 0 ? (stats.candidatos / stats.total) * 100 : 0;

              return (
                <div
                  key={dom}
                  className="border-ink-anchor bg-bg-canvas border-2 p-4 shadow-[4px_4px_0px_#000000]"
                >
                  <div className="mb-4 flex flex-col gap-2 border-b border-black pb-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-display text-sm font-black tracking-tight uppercase">
                        Domínio: {dom.toUpperCase()}
                      </span>
                      <div className="text-xxs text-muted mt-0.5">
                        {stats.total}{" "}
                        {stats.total === 1
                          ? "marco catalogado"
                          : "marcos catalogados"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-black">
                      <span className="text-status-success-text bg-status-success-bg rounded border border-black px-1.5 py-0.5">
                        Conquistados: {stats.conquistados}
                      </span>
                      <span className="text-status-info-text bg-status-info-bg rounded border border-black px-1.5 py-0.5">
                        Candidatos: {stats.candidatos}
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso Neobrutalista Stacked */}
                  <div className="mb-4 flex h-4 overflow-hidden rounded-sm border-2 border-black bg-gray-200">
                    {percConquistados > 0 && (
                      <div
                        style={{ width: `${percConquistados}%` }}
                        className="bg-status-success-bg h-full border-r border-black"
                        title={`${percConquistados.toFixed(0)}% Conquistados`}
                      />
                    )}
                    {percCandidatos > 0 && (
                      <div
                        style={{ width: `${percCandidatos}%` }}
                        className="bg-status-info-bg h-full border-r border-black"
                        title={`${percCandidatos.toFixed(0)}% Candidatos`}
                      />
                    )}
                  </div>

                  {/* Grid de Milestones */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                    {items.map((m) => {
                      const entry = snapSelecionado.repertorioState?.[m.id];
                      let status: "conquistado" | "candidato" | "nao_atingido" =
                        "nao_atingido";
                      if (entry) {
                        if (entry.nivelAjudaRecente === 0) {
                          status = "conquistado";
                        } else if (entry.isCandidata) {
                          status = "candidato";
                        }
                      }

                      return (
                        <div
                          key={m.id}
                          className="border-ink-anchor bg-canvas group relative flex cursor-help flex-col items-center justify-between gap-2 border p-2 text-center"
                          title={`${m.nome} ${m.nivel ? `(Nível ${m.nivel})` : ""}`}
                        >
                          <span className="text-xxs line-clamp-1 font-black">
                            {m.nivel ? `Nível ${m.nivel}` : "Marco"}
                          </span>

                          {/* Indicador Visual do Milestone */}
                          {status === "conquistado" ? (
                            <div
                              className="bg-status-success-bg text-status-success-text flex h-8 w-8 items-center justify-center rounded-full border-2 border-black text-xs font-black"
                              title="Conquistado"
                            >
                              ✓
                            </div>
                          ) : status === "candidato" ? (
                            <div
                              className="bg-status-info-bg text-status-info-text flex h-8 w-8 rotate-45 transform items-center justify-center border-2 border-dashed border-black text-xs font-black"
                              title="Candidato"
                            >
                              <span className="block -rotate-45 transform">
                                ★
                              </span>
                            </div>
                          ) : (
                            <div
                              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-gray-400 bg-gray-100 text-xs font-bold text-gray-400"
                              title="Não Atingido"
                            >
                              ○
                            </div>
                          )}

                          <span className="text-muted line-clamp-2 text-[10px] leading-tight">
                            {m.nome}
                          </span>
                        </div>
                      );
                    })}
                  </div>
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
      <div className="bg-canvas border-ink-anchor flex flex-col gap-4 border-2 p-4">
        <div className="border-ink-anchor border-b-2 pb-2">
          <h3 className="text-ink text-base font-black">
            Comparar Pontos Temporais
          </h3>
          <p className="text-xxs text-muted mt-0.5">
            Selecione outra sessão para ver a evolução agregada no tempo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="checkbox-comparar"
            type="checkbox"
            checked={compararAtivo}
            onChange={(e) => handleCompararAtivoChange(e.target.checked)}
            className="border-ink-anchor accent-gold size-4 cursor-pointer border-2"
          />
          <label
            htmlFor="checkbox-comparar"
            className="text-ink cursor-pointer text-sm font-bold"
          >
            Ativar Comparador Temporal
          </label>
        </div>

        {compararAtivo && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="select-sessao-comparar"
                className="text-ink text-xs font-bold"
              >
                Comparar Sessão {sessaoAtiva} com a Sessão:
              </label>
              <select
                id="select-sessao-comparar"
                value={sessaoCompararValida ?? ""}
                onChange={(e) =>
                  handleSelecionarSessaoComparar(Number(e.target.value))
                }
                className="border-ink-anchor bg-canvas text-ink border-2 p-1.5 text-sm focus:outline-none"
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {sessoesDisponiveis
                  .filter((n) => n !== sessaoAtiva)
                  .map((n) => (
                    <option key={n} value={n}>
                      Sessão {n}
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
                {/* Alerta Clínico Guard G7 */}
                {comparacaoData.protocoloMudou ? (
                  <div className="flex items-start gap-2 rounded-[var(--radius-control)] border-2 border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-2.5 text-xs font-bold text-[var(--status-error-fg)]">
                    <span>⚠️</span>
                    <div>
                      <strong>Guard G7 Ativado:</strong> Houve mudança nos
                      protocolos ativos entre a Sessão{" "}
                      {Math.min(sessaoAtiva, sessaoCompararValida ?? 0)} e a
                      Sessão {Math.max(sessaoAtiva, sessaoCompararValida ?? 0)}.
                      Os deltas de nível de ajuda foram suspensos devido a
                      desalinhamento de escalas clínicas.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] p-1.5 text-center text-xs font-bold text-[var(--action-primary-fg)]">
                      Resultados da Comparação
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Evolução da Sessão{" "}
                      {Math.min(sessaoAtiva, sessaoCompararValida ?? 0)} para a{" "}
                      {Math.max(sessaoAtiva, sessaoCompararValida ?? 0)}:
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
          Sessões {drilldownChunk?.inicio} até {drilldownChunk?.fim} para{" "}
          {drilldownChunk?.targetNome}
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
            drilldownEvidencias.map((ev: any) => (
              <div
                key={ev.id}
                className={`flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)] ${
                  ev.polaridade === "positiva"
                    ? "border-l-4 border-l-[var(--status-success-border)]"
                    : "border-l-4 border-l-[var(--status-error-border)]"
                }`}
              >
                <div className="flex flex-col gap-1 border-b border-[var(--border-brutal)]/20 pb-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-black text-[var(--text-primary)]">
                    Sessão {ev.sessionNumero} •{" "}
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
          {snapSelecionado ? (
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
            sessaoSelecionada={sessaoAtiva}
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
