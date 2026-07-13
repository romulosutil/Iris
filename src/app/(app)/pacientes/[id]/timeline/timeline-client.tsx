"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Scrubber } from "./scrubber";
import { DeltaSessaoLateral } from "./delta-sessao";
import { carregarDeltaSessaoAction, carregarComparacaoAction } from "./actions";
import type { TimelineSnapshot, TimelineData } from "./queries";
import type { DeltaSessao as DeltaSessaoType } from "./logic";
import { Button } from "@/components/ui/button";

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
  const { snapshots, metasAtivas, protocolosAtivos } = initialData;

  // Lista ordenada crescente de números de sessões disponíveis
  const sessoesDisponiveis = [...snapshots]
    .map((s) => s.sessionNumero)
    .sort((a, b) => a - b);

  // Sessão atual selecionada no Scrubber (inicia na mais recente)
  const [sessaoAtiva, setSessaoAtiva] = useState<number>(
    sessoesDisponiveis[sessoesDisponiveis.length - 1] ?? 1,
  );

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

  // Encontra o snapshot selecionado
  const snapSelecionado =
    snapshots.find((s) => s.sessionNumero === sessaoAtiva) ?? null;

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
          <Button
            variante="secundaria"
            onClick={() => alert(JSON.stringify(data, null, 2))}
          >
            Visualizar Dados em Formato Tabela
          </Button>
        </div>
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

          {/* Espaço de Trajetórias (Parte 3) */}
          <div className="bg-canvas border-ink-anchor border-2 p-6">
            <h3 className="text-ink mb-2 text-lg font-black">
              Trajetória Clínica de Metas
            </h3>
            <p className="text-muted text-sm">
              Visualize as faixas e marcações clínicas de evolução de marcos e
              conquistas ao longo das sessões.
            </p>
            <div className="border-ink-anchor text-muted mt-4 flex h-24 items-center justify-center border border-dashed text-xs">
              Componentes de faixas e losangos serão renderizados aqui na Parte
              3.
            </div>
          </div>
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
                          {Math.min(sessaoAtiva, sessaoCompararValida ?? 0)} e a
                          Sessão{" "}
                          {Math.max(sessaoAtiva, sessaoCompararValida ?? 0)}. Os
                          deltas de nível de ajuda foram suspensos devido a
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
                              (i) => i.tipo === "evolucao" || i.tipo === "novo",
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
        </div>
      </div>
    </div>
  );
}
