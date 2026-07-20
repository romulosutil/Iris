"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Scrubber } from "./scrubber";
import { DeltaSessaoLateral } from "./delta-sessao";
import { carregarDeltaSessaoAction, carregarComparacaoAction, carregarEvidenciasAction } from "./actions";
import type { TimelineSnapshot, TimelineData } from "./queries";
import type { DeltaSessao as DeltaSessaoType } from "./logic";
import { Button } from "@/components/ui/button";
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
}

export function TimelineClient({
  patientId,
  pacienteNome,
  initialData,
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
    const stats: Record<string, { total: number; conquistados: number; candidatos: number }> = {};
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
    setCarregandoEvidencias(true);
    setDrilldownEvidencias([]);
    try {
      const res = await carregarEvidenciasAction(
        patientId,
        targetId,
        chunk.inicio,
        chunk.fim,
      );
      setDrilldownEvidencias(res);
    } catch (err) {
      console.error("Erro ao buscar evidências por trecho:", err);
    } finally {
      setCarregandoEvidencias(false);
    }
  };

  const getTargetNome = (id: string) => {
    const g = initialData.metasAtivas.find((m) => m.id === id);
    if (g) return `Meta: ${g.descricao}`;
    const m = initialData.milestonesAtivos.find((mi) => mi.id === id);
    if (m) return `Marco: ${m.nome} (${m.dominioId.toUpperCase()}${m.nivel ? ` - ${m.nivel}` : ""})`;
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
      if (ultimoTrecho && ultimoTrecho.rotulo === sessao.rotulo && ultimoTrecho.nivel === sessao.nivel) {
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

  const [isPending, startTransition] = useTransition();
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
        console.error("Erro ao carregar delta da sessão:", err);
      }
    });

    return () => {
      active = false;
    };
  }, [sessaoAtiva, patientId]);

  // Carrega dados da comparação
  useEffect(() => {
    if (!compararAtivo || sessaoCompararValida === null) {
      return;
    }

    let active = true;

    startTransition(async () => {
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
        console.error("Erro ao carregar comparação:", err);
      }
    });

    return () => {
      active = false;
    };
  }, [compararAtivo, sessaoAtiva, sessaoCompararValida, patientId]);

  // Lógica de Renderização do Hexágono "Espectro" SVG
  const renderEspectroRadar = () => {
    if (!snapSelecionado) return null;

    const data = snapSelecionado.espectro;
    const centroX = 150;
    const centroY = 150;
    const raioMax = 100;

    // 6 eixos com ângulos de 60 graus iniciando do topo (-90° ou 3*pi/2)
    const eixosHex = data.map((e, index) => {
      const angulo = (index * 60 - 90) * (Math.PI / 180);
      const valorNormalizado = e.valor / 100;
      const xMax = centroX + raioMax * Math.cos(angulo);
      const yMax = centroY + raioMax * Math.sin(angulo);
      const xValor = centroX + raioMax * valorNormalizado * Math.cos(angulo);
      const yValor = centroY + raioMax * valorNormalizado * Math.sin(angulo);

      return {
        ...e,
        xMax,
        yMax,
        xValor,
        yValor,
        label: e.eixo
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      };
    });

    // Caminho da teia de fundo (0%, 25%, 50%, 75%, 100%)
    const niveisTeia = [25, 50, 75, 100];
    const caminhosTeia = niveisTeia.map((nivel) => {
      const pontos = data.map((_, index) => {
        const angulo = (index * 60 - 90) * (Math.PI / 180);
        const r = raioMax * (nivel / 100);
        const x = centroX + r * Math.cos(angulo);
        const y = centroY + r * Math.sin(angulo);
        return `${x},${y}`;
      });
      return pontos.join(" ");
    });

    // Polígono de evolução do paciente naquela sessão
    const pontosEvolucao = eixosHex
      .map((e) => `${e.xValor},${e.yValor}`)
      .join(" ");

    return (
      <div className="bg-canvas border-ink-anchor flex flex-col items-center border-2 p-6">
        <h3 className="text-ink mb-2 text-lg font-black">
          Gráfico de Espectro Clínico
        </h3>

        {/* SVG do Radar Chart */}
        <div className="relative h-[300px] w-[300px]" aria-hidden="true">
          <svg width="300" height="300" className="overflow-visible">
            {/* Linhas de grade da teia */}
            {caminhosTeia.map((caminho, i) => (
              <polygon
                key={i}
                points={caminho}
                fill="none"
                stroke="#c0c0c0"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            ))}

            {/* Linhas dos eixos centrais */}
            {eixosHex.map((e, i) => (
              <line
                key={i}
                x1={centroX}
                y1={centroY}
                x2={e.xMax}
                y2={e.yMax}
                stroke="#d0d0d0"
                strokeWidth="1"
              />
            ))}

            {/* Polígono preenchido do repertório */}
            <polygon
              points={pontosEvolucao}
              fill="rgba(218, 165, 32, 0.25)" // Ouro translúcido do Espectro Brutal
              stroke="var(--color-gold, #DAA520)"
              strokeWidth="3"
            />

            {/* Marcadores dos vértices */}
            {eixosHex.map((e, i) => (
              <circle
                key={i}
                cx={e.xValor}
                cy={e.yValor}
                r="4"
                fill="var(--color-gold, #DAA520)"
                stroke="#000000"
                strokeWidth="1"
              />
            ))}

            {/* Rótulos dos eixos */}
            {eixosHex.map((e, i) => {
              // Ajusta a posição do texto para não colidir com o gráfico
              const offsetFactor = 1.2;
              const ang = (i * 60 - 90) * (Math.PI / 180);
              const tx = centroX + raioMax * offsetFactor * Math.cos(ang);
              const ty = centroY + raioMax * offsetFactor * Math.sin(ang) + 4;
              let textAnchor: "middle" | "start" | "end" = "middle";
              if (Math.cos(ang) > 0.1) textAnchor = "start";
              if (Math.cos(ang) < -0.1) textAnchor = "end";

              return (
                <text
                  key={i}
                  x={tx}
                  y={ty}
                  textAnchor={textAnchor}
                  className="font-display fill-ink font-bold"
                  style={{ fontSize: "9px" }}
                >
                  {e.label} ({e.valor}%)
                </text>
              );
            })}
          </svg>
        </div>

        {/* Tabela sr-only para Acessibilidade (DoD) */}
        <table className="sr-only">
          <caption>Dados de evolução clínica da Sessão {sessaoAtiva}</caption>
          <thead>
            <tr>
              <th scope="col">Área de Evolução</th>
              <th scope="col">Progresso Normalizado (%)</th>
              <th scope="col">Evidências Registradas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e, i) => (
              <tr key={i}>
                <td>{e.eixo.replace(/_/g, " ")}</td>
                <td>{e.valor}%</td>
                <td>{e.contagemEvidencias}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Link visível para abrir os dados em tabela */}
        <div className="mt-4 text-center">
          <Dialog>
            <DialogTrigger asChild>
              <Button variante="secundaria">
                Visualizar Dados em Formato Tabela
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogTitle>Dados de evolução clínica</DialogTitle>
              <DialogDescription>
                Sessão {sessaoAtiva}: leitura tabular dos eixos do gráfico de
                espectro.
              </DialogDescription>
              <div className="mt-4 max-h-[60vh] overflow-auto">
                <table className="border-ink-anchor w-full border-collapse border text-left text-sm">
                  <caption className="sr-only">
                    Dados de evolução clínica da Sessão {sessaoAtiva}
                  </caption>
                  <thead>
                    <tr className="bg-bg-canvas">
                      <th
                        scope="col"
                        className="border-ink-anchor border p-2 font-bold"
                      >
                        Área de Evolução
                      </th>
                      <th
                        scope="col"
                        className="border-ink-anchor border p-2 font-bold"
                      >
                        Progresso (%)
                      </th>
                      <th
                        scope="col"
                        className="border-ink-anchor border p-2 font-bold"
                      >
                        Evidências
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((e, i) => (
                      <tr key={i}>
                        <td className="border-ink-anchor border p-2">
                          {e.eixo.replace(/_/g, " ")}
                        </td>
                        <td className="border-ink-anchor border p-2">
                          {e.valor}%
                        </td>
                        <td className="border-ink-anchor border p-2">
                          {e.contagemEvidencias}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  };

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
          <h3 className="text-ink text-lg font-black font-display">
            Trajetória Clínica de Metas
          </h3>
          <p className="text-muted text-sm mt-1">
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
          <div className="border-ink-anchor text-muted mt-6 flex h-24 items-center justify-center border border-dashed text-xs">
            Selecione uma meta ou marco acima para visualizar a trajetória clínica.
          </div>
        ) : chunks.length === 0 ? (
          <div className="border-ink-anchor text-muted mt-6 flex h-24 items-center justify-center border border-dashed text-xs">
            Nenhum dado histórico registrado para este alvo.
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <div className="text-ink border-ink-anchor border bg-bg-canvas px-3 py-2 text-sm font-bold">
              Trajetória: {targetNome}
            </div>
            {/* Visualização de Chunks como linha temporal */}
            <div className="flex flex-col gap-3">
              {chunks.map((chunk, idx) => {
                let colorClass = "bg-gray-100 border-dashed border-gray-400 text-gray-600 shadow-[2px_2px_0px_#000000]";
                if (chunk.rotulo === "evolucao") {
                  colorClass = "bg-[#B2DFDB] border-black text-black shadow-[4px_4px_0px_#000000]";
                } else if (chunk.rotulo === "regressao") {
                  colorClass = "bg-[#EF9A9A] border-black text-black shadow-[4px_4px_0px_#000000]";
                } else if (chunk.rotulo === "estagnacao") {
                  colorClass = "bg-gray-200 border-black text-black shadow-[4px_4px_0px_#000000]";
                }

                return (
                  <button
                    key={idx}
                    onClick={() =>
                      handleAbrirDrilldown(chunk, trajetoriaAlvoId, targetNome)
                    }
                    className={`border-2 p-4 text-left transition-all duration-75 active:translate-y-0.5 active:shadow-[1px_1px_0px_#000000] focus:outline-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${colorClass}`}
                  >
                    <div>
                      <span className="font-display font-black text-base uppercase tracking-tight">
                        {deparaTraducaoRotulo[chunk.rotulo] || chunk.rotulo}
                      </span>
                      <div className="text-xs font-bold mt-1">
                        Sessão {chunk.inicio} {chunk.fim !== chunk.inicio ? `até a Sessão ${chunk.fim}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {chunk.nivel !== null && (
                        <span className="border border-black bg-white px-2 py-0.5 text-xs font-black rounded">
                          Nível {chunk.nivel}
                        </span>
                      )}
                      <span className="text-xs font-black underline">
                        Ver {chunk.sessoes.length} {chunk.sessoes.length === 1 ? "sessão" : "sessões"} →
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
          <h3 className="text-ink text-lg font-black font-display">
            Acompanhamento de Marcos e Protocolos
          </h3>
          <p className="text-muted text-sm mt-1">
            Estatísticas e progresso de marcos por domínio do protocolo ativo na Sessão {sessaoAtiva}.
          </p>
        </div>

        {Object.keys(milestonesPorDominio).length === 0 ? (
          <div className="border-ink-anchor text-muted mt-6 flex h-24 items-center justify-center border border-dashed text-xs">
            Nenhum protocolo ou marco ativo associado a este paciente.
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {Object.entries(milestonesPorDominio).map(([dom, items]) => {
              const stats = estatisticasDominio[dom] ?? { total: 0, conquistados: 0, candidatos: 0 };
              const percConquistados = stats.total > 0 ? (stats.conquistados / stats.total) * 100 : 0;
              const percCandidatos = stats.total > 0 ? (stats.candidatos / stats.total) * 100 : 0;

              return (
                <div key={dom} className="border-ink-anchor border-2 bg-bg-canvas p-4 shadow-[4px_4px_0px_#000000]">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-black pb-2 mb-4">
                    <div>
                      <span className="font-display font-black text-sm uppercase tracking-tight">
                        Domínio: {dom.toUpperCase()}
                      </span>
                      <div className="text-xxs text-muted mt-0.5">
                        {stats.total} {stats.total === 1 ? "marco catalogado" : "marcos catalogados"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-black">
                      <span className="text-green-800 bg-[#B2DFDB] px-1.5 py-0.5 rounded border border-black">
                        Conquistados: {stats.conquistados}
                      </span>
                      <span className="text-blue-800 bg-[#90CAF9] px-1.5 py-0.5 rounded border border-black">
                        Candidatos: {stats.candidatos}
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progresso Neobrutalista Stacked */}
                  <div className="border-2 border-black h-4 bg-gray-200 flex overflow-hidden mb-4 rounded-sm">
                    {percConquistados > 0 && (
                      <div
                        style={{ width: `${percConquistados}%` }}
                        className="bg-[#B2DFDB] h-full border-r border-black"
                        title={`${percConquistados.toFixed(0)}% Conquistados`}
                      />
                    )}
                    {percCandidatos > 0 && (
                      <div
                        style={{ width: `${percCandidatos}%` }}
                        className="bg-[#90CAF9] h-full border-r border-black"
                        title={`${percCandidatos.toFixed(0)}% Candidatos`}
                      />
                    )}
                  </div>

                  {/* Grid de Milestones */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {items.map((m) => {
                      const entry = snapSelecionado.repertorioState?.[m.id];
                      let status: "conquistado" | "candidato" | "nao_atingido" = "nao_atingido";
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
                          className="border-ink-anchor border bg-canvas p-2 flex flex-col items-center justify-between text-center gap-2 group relative cursor-help"
                          title={`${m.nome} ${m.nivel ? `(Nível ${m.nivel})` : ""}`}
                        >
                          <span className="text-xxs font-black line-clamp-1">
                            {m.nivel ? `Nível ${m.nivel}` : "Marco"}
                          </span>
                          
                          {/* Indicador Visual do Milestone */}
                          {status === "conquistado" ? (
                            <div className="w-8 h-8 rounded-full bg-[#B2DFDB] border-2 border-black flex items-center justify-center font-black text-xs text-black" title="Conquistado">
                              ✓
                            </div>
                          ) : status === "candidato" ? (
                            <div className="w-8 h-8 bg-[#90CAF9] border-2 border-dashed border-black flex items-center justify-center font-black text-xs text-black transform rotate-45" title="Candidato">
                              <span className="transform -rotate-45 block">★</span>
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-dashed border-gray-400 flex items-center justify-center text-gray-400 font-bold text-xs" title="Não Atingido">
                              ○
                            </div>
                          )}

                          <span className="text-[10px] text-muted line-clamp-2 leading-tight">
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

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Linha do tempo interativa (Scrubber) */}
      <Scrubber
        sessoesDisponiveis={sessoesDisponiveis}
        sessaoSelecionada={sessaoAtiva}
        dataSessaoSelecionada={snapSelecionado?.geradoEm}
        onSelecionarSessao={handleSelecionarSessao}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Coluna Principal: Gráficos */}
        <div className="flex flex-col gap-6 md:col-span-2">
          {/* Radar Chart Espectro */}
          {renderEspectroRadar()}

          {/* Trajetória de Metas (Parte 3) */}
          {renderTrajetoriaMetas()}

          {/* Acompanhamento de Protocolo (Parte 3) */}
          {renderGraficoProtocolo()}
        </div>

        {/* Coluna Lateral: Delta de Sessão & Comparador */}
        <div className="flex flex-col gap-6">
          {/* Delta de Sessão */}
          <DeltaSessaoLateral
            delta={deltaSessao}
            metas={deltaMetas}
            milestones={deltaMilestones}
            carregando={isPending && !compararAtivo}
          />

          {/* Comparador de 2 Pontos Temporais */}
          {podeComparar && (
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

                  {isPending && (
                    <div className="text-muted animate-pulse text-xs">
                      Carregando comparação...
                    </div>
                  )}

                  {/* Exibição do Delta de Comparação */}
                  {comparacaoData && (
                    <div className="border-ink-anchor flex flex-col gap-3 border-t-2 pt-3">
                      {/* Alerta Clínico Guard G7 */}
                      {comparacaoData.protocoloMudou ? (
                        <div className="flex items-start gap-2 border-2 border-red-600 bg-red-50 p-2 text-xs font-bold text-red-900">
                          <span>⚠️</span>
                          <div>
                            <strong>Guard G7 Ativado:</strong> Houve mudança nos
                            protocolos ativos entre a Sessão{" "}
                            {Math.min(sessaoAtiva, sessaoCompararValida ?? 0)} e
                            a Sessão{" "}
                            {Math.max(sessaoAtiva, sessaoCompararValida ?? 0)}.
                            Os deltas de nível de ajuda foram suspensos devido a
                            desalinhamento de escalas clínicas.
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="text-ink bg-gold border-ink-anchor border p-1 text-center text-xs font-bold">
                            Resultados da Comparação
                          </div>
                          <div className="text-xxs text-muted">
                            Evolução da Sessão{" "}
                            {Math.min(sessaoAtiva, sessaoCompararValida ?? 0)}{" "}
                            para a{" "}
                            {Math.max(sessaoAtiva, sessaoCompararValida ?? 0)}:
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-center text-xs">
                            <div className="border-ink-anchor border bg-green-50 p-1 font-bold text-green-900">
                              +
                              {comparacaoData.delta?.itens?.filter(
                                (i) =>
                                  i.tipo === "evolucao" || i.tipo === "novo",
                              ).length ?? 0}{" "}
                              Avanços
                            </div>
                            <div className="border-ink-anchor border bg-red-50 p-1 font-bold text-red-900">
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
          )}
        </div>
      </div>

      {/* Dialog de Drilldown de Evidências por Trecho */}
      <Dialog open={drilldownOpen} onOpenChange={setDrilldownOpen}>
        <DialogContent className="max-w-2xl bg-canvas border-4 border-black shadow-[8px_8px_0px_#000000]">
          <DialogTitle className="font-display font-black text-xl text-black">
            Evidências Clínicas do Trecho
          </DialogTitle>
          <DialogDescription className="text-sm font-bold text-gray-700">
            Sessões {drilldownChunk?.inicio} até {drilldownChunk?.fim} para {drilldownChunk?.targetNome}
          </DialogDescription>

          <div className="mt-4 max-h-[60vh] overflow-y-auto pr-2 flex flex-col gap-4">
            {carregandoEvidencias ? (
              <div className="py-8 text-center text-sm font-black text-gray-600 animate-pulse">
                Buscando evidências no histórico do paciente...
              </div>
            ) : drilldownEvidencias.length === 0 ? (
              <div className="py-8 text-center text-sm font-bold text-gray-500 border-2 border-dashed border-gray-400 bg-gray-50">
                Nenhuma evidência registrada para este trecho nas sessões selecionadas.
              </div>
            ) : (
              drilldownEvidencias.map((ev: any) => (
                <div
                  key={ev.id}
                  className={`border-2 border-black p-4 bg-white shadow-[4px_4px_0px_#000000] flex flex-col gap-2 ${
                    ev.polaridade === "positiva" ? "border-green-800" : "border-red-800"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-gray-200 pb-1 text-xs">
                    <span className="font-black text-black">
                      Sessão {ev.sessionNumero} • {ev.dataSessao ? new Date(ev.dataSessao).toLocaleDateString("pt-BR") : "Sem data"}
                    </span>
                    <span className="text-muted font-bold">
                      Aprovado por: {ev.aprovadorNome}
                    </span>
                  </div>
                  <p className="text-sm text-black leading-relaxed font-medium">
                    {ev.descricao}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border border-black ${
                      ev.polaridade === "positiva"
                        ? "bg-[#B2DFDB] text-green-900"
                        : "bg-[#EF9A9A] text-red-900"
                    }`}>
                      {ev.polaridade === "positiva" ? "Evolução" : "Dificuldade"}
                    </span>
                    {ev.nivelAjuda && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded border border-black bg-gray-100 text-gray-800">
                        Nível de Ajuda: {ev.nivelAjuda}
                      </span>
                    )}
                  </div>
                  {ev.revisao && (
                    <p className="text-xs text-muted font-medium border-t border-gray-200 pt-1 mt-1">
                      Revisado por {ev.revisao.autorNome ?? "coordenador"}
                      {ev.revisao.justificativa ? `: ${ev.revisao.justificativa}` : ""}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => setDrilldownOpen(false)}
              className="border-2 border-black bg-[#F2B705] text-black font-black hover:bg-[#d19c00] active:translate-y-0.5 active:shadow-[1px_1px_0px_#000000] px-4 py-2"
            >
              Fechar Painel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
