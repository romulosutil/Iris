"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Scrubber } from "./scrubber";
import { DeltaSessaoLateral } from "./delta-sessao";
import { carregarDeltaSessaoAction, carregarComparacaoAction } from "./actions";
import type { TimelineSnapshot, TimelineData } from "./queries";
import type { DeltaSessao as DeltaSessaoType } from "./logic";
import { Button } from "@/components/ui/button";

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
    sessoesDisponiveis[sessoesDisponiveis.length - 1] ?? 1
  );

  // Estados do Comparador
  const [compararAtivo, setCompararAtivo] = useState(false);
  const [sessaoComparar, setSessaoComparar] = useState<number | null>(null);

  // Dados carregados dinamicamente
  const [deltaSessao, setDeltaSessao] = useState<DeltaSessaoType | null>(null);
  const [deltaMetas, setDeltaMetas] = useState<any[]>([]);
  const [deltaMilestones, setDeltaMilestones] = useState<any[]>([]);

  const [comparacaoData, setComparacaoData] = useState<{
    delta: DeltaSessaoType;
    protocoloMudou: boolean;
    metas: any[];
    milestones: any[];
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Encontra o snapshot selecionado
  const snapSelecionado = snapshots.find((s) => s.sessionNumero === sessaoAtiva) ?? null;

  // Carrega o delta da sessão selecionada
  useEffect(() => {
    if (!sessaoAtiva) return;

    startTransition(async () => {
      try {
        const res = await carregarDeltaSessaoAction(patientId, sessaoAtiva);
        setDeltaSessao(res.delta);
        setDeltaMetas(res.metas);
        setDeltaMilestones(res.milestones);
      } catch (err) {
        console.error("Erro ao carregar delta da sessão:", err);
      }
    });
  }, [sessaoAtiva, patientId]);

  // Carrega dados da comparação
  useEffect(() => {
    if (!compararAtivo || sessaoComparar === null) {
      setComparacaoData(null);
      return;
    }

    startTransition(async () => {
      try {
        const res = await carregarComparacaoAction(patientId, sessaoAtiva, sessaoComparar);
        if (res) {
          setComparacaoData({
            delta: res.delta,
            protocoloMudou: res.protocoloMudou,
            metas: res.metas,
            milestones: res.milestones,
          });
        }
      } catch (err) {
        console.error("Erro ao carregar comparação:", err);
      }
    });
  }, [compararAtivo, sessaoAtiva, sessaoComparar, patientId]);

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
        label: e.eixo.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
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
    const pontosEvolucao = eixosHex.map((e) => `${e.xValor},${e.yValor}`).join(" ");

    return (
      <div className="bg-canvas border-ink-anchor border-2 p-6 flex flex-col items-center">
        <h3 className="text-lg font-black text-ink mb-2">
          Gráfico de Espectro Clínico
        </h3>

        {/* SVG do Radar Chart */}
        <div className="relative w-[300px] h-[300px]" aria-hidden="true">
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
                  className="font-display font-bold fill-ink"
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
          <Button variante="secundaria" onClick={() => alert(JSON.stringify(data, null, 2))}>
            Visualizar Dados em Formato Tabela
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Linha do tempo interativa (Scrubber) */}
      <Scrubber
        sessoesDisponiveis={sessoesDisponiveis}
        sessaoSelecionada={sessaoAtiva}
        dataSessaoSelecionada={snapSelecionado?.geradoEm}
        onSelecionarSessao={setSessaoAtiva}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna Principal: Gráficos */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Radar Chart Espectro */}
          {renderEspectroRadar()}

          {/* Espaço de Trajetórias (Parte 3) */}
          <div className="bg-canvas border-ink-anchor border-2 p-6">
            <h3 className="text-lg font-black text-ink mb-2">
              Trajetória Clínica de Metas
            </h3>
            <p className="text-sm text-muted">
              Visualize as faixas e marcações clínicas de evolução de marcos e conquistas ao longo das sessões.
            </p>
            <div className="h-24 border border-ink-anchor border-dashed mt-4 flex items-center justify-center text-xs text-muted">
              Componentes de faixas e losangos serão renderizados aqui na Parte 3.
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
          <div className="bg-canvas border-ink-anchor border-2 p-4 flex flex-col gap-4">
            <div className="border-ink-anchor border-b-2 pb-2">
              <h3 className="text-base font-black text-ink">
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
                onChange={(e) => setCompararAtivo(e.target.checked)}
                className="size-4 border-2 border-ink-anchor accent-gold cursor-pointer"
              />
              <label htmlFor="checkbox-comparar" className="text-sm font-bold text-ink cursor-pointer">
                Ativar Comparador Temporal
              </label>
            </div>

            {compararAtivo && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="select-sessao-comparar" className="text-xs font-bold text-ink">
                    Comparar Sessão {sessaoAtiva} com a Sessão:
                  </label>
                  <select
                    id="select-sessao-comparar"
                    value={sessaoComparar ?? ""}
                    onChange={(e) => setSessaoComparar(Number(e.target.value))}
                    className="border-2 border-ink-anchor bg-canvas text-ink text-sm p-1.5 focus:outline-none"
                  >
                    <option value="" disabled>Selecione...</option>
                    {sessoesDisponiveis
                      .filter((n) => n !== sessaoAtiva)
                      .map((n) => (
                        <option key={n} value={n}>Sessão {n}</option>
                      ))}
                  </select>
                </div>

                {isPending && (
                  <div className="text-xs text-muted animate-pulse">Carregando comparação...</div>
                )}

                {/* Exibição do Delta de Comparação */}
                {comparacaoData && (
                  <div className="flex flex-col gap-3 border-t-2 border-ink-anchor pt-3">
                    {/* Alerta Clínico Guard G7 */}
                    {comparacaoData.protocoloMudou ? (
                      <div className="bg-red-50 border-red-600 border-2 p-2 text-xs text-red-900 font-bold flex items-start gap-2">
                        <span>⚠️</span>
                        <div>
                          <strong>Guard G7 Ativado:</strong> Houve mudança nos protocolos ativos entre a Sessão {Math.min(sessaoAtiva, sessaoComparar ?? 0)} e a Sessão {Math.max(sessaoAtiva, sessaoComparar ?? 0)}. Os deltas de nível de ajuda foram suspensos devido a desalinhamento de escalas clínicas.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs font-bold text-ink bg-gold p-1 text-center border border-ink-anchor">
                          Resultados da Comparação
                        </div>
                        <div className="text-xxs text-muted">
                          Evolução da Sessão {Math.min(sessaoAtiva, sessaoComparar ?? 0)} para a {Math.max(sessaoAtiva, sessaoComparar ?? 0)}:
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-center text-xs">
                          <div className="border border-ink-anchor p-1 bg-green-50 text-green-900 font-bold">
                            +{comparacaoData.delta.itens.filter(i => i.tipo === "evolucao" || i.tipo === "novo").length} Avanços
                          </div>
                          <div className="border border-ink-anchor p-1 bg-red-50 text-red-900 font-bold">
                            +{comparacaoData.delta.itens.filter(i => i.tipo === "regressao").length} Recuos
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
