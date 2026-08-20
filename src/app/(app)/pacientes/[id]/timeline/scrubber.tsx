"use client";

import React from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

interface ScrubberProps {
  sessoesDisponiveis: number[]; // Lista de números de sessões disponíveis, ordenados crescentes (ex: [1, 2, 3, 5, 6])
  sessaoSelecionada: number;
  dataSessaoSelecionada?: Date;
  onSelecionarSessao: (numero: number) => void;
}

/**
 * Ícone de aviso em traço, `currentColor`, no mesmo estilo do de
 * `estado-de-erro.tsx`. Substitui o emoji de aviso, que tem nome anunciado
 * inconsistente entre leitores de tela e não herda a cor do texto do banner.
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
      className="shrink-0"
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

export function Scrubber({
  sessoesDisponiveis,
  sessaoSelecionada,
  dataSessaoSelecionada,
  onSelecionarSessao,
}: ScrubberProps) {
  // Encontra o index da sessão selecionada na lista
  const indexAtual = sessoesDisponiveis.indexOf(sessaoSelecionada);
  const indexValido =
    indexAtual !== -1 ? indexAtual : Math.max(0, sessoesDisponiveis.length - 1);

  // Estado local para controle do drag visual do slider
  const [dragState, setDragState] = React.useState({
    committedIndex: indexValido,
    valor: indexValido,
  });
  const valorVisual =
    dragState.committedIndex === indexValido ? dragState.valor : indexValido;

  if (sessoesDisponiveis.length === 0) return null;

  const sessaoVisual = sessoesDisponiveis[valorVisual] ?? sessaoSelecionada;

  const temAnterior = indexValido > 0;
  const temProximo = indexValido < sessoesDisponiveis.length - 1;

  const handleSliderChange = (values: number[]) => {
    const targetIndex = values[0];
    if (targetIndex !== undefined) {
      const targetSessao = sessoesDisponiveis[targetIndex];
      if (targetSessao !== undefined) {
        onSelecionarSessao(targetSessao);
      }
    }
  };

  const formatarData = (date?: Date) => {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Se a sessão selecionada não for a última da lista (a mais recente), ela é considerada passada
  const ultimaSessaoDisponivel =
    sessoesDisponiveis[sessoesDisponiveis.length - 1];
  const isSessaoPassada = sessaoVisual !== ultimaSessaoDisponivel;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4">
      {/* Banner de Sessão Passada */}
      {isSessaoPassada && (
        <div
          role="status"
          className="-mx-4 -mt-4 flex items-center justify-center gap-2 border-b-2 border-[var(--border-brutal)] bg-[var(--status-warning-bg)] p-2 text-center text-sm font-bold text-[var(--status-warning-fg)]"
        >
          <IconeAviso />
          <span>Visualizando histórico passado: Sessão {sessaoVisual}</span>
        </div>
      )}

      {/* Controles de Navegação */}
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <Button
          variante="secundaria"
          tamanho="sm"
          disabled={!temAnterior}
          onClick={() => {
            const ant = sessoesDisponiveis[indexValido - 1];
            if (ant !== undefined) onSelecionarSessao(ant);
          }}
          aria-label="Sessão anterior"
          className="shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
        >
          &larr; Anterior
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-base font-black text-[var(--text-primary)] sm:text-lg">
            Sessão {sessaoVisual}
          </div>
          {dataSessaoSelecionada && (
            <div
              className="truncate text-[10px] text-[var(--text-secondary)] sm:text-xs"
              suppressHydrationWarning
            >
              {formatarData(dataSessaoSelecionada)}
            </div>
          )}
        </div>

        <Button
          variante="secundaria"
          tamanho="sm"
          disabled={!temProximo}
          onClick={() => {
            const prox = sessoesDisponiveis[indexValido + 1];
            if (prox !== undefined) onSelecionarSessao(prox);
          }}
          aria-label="Próxima sessão"
          className="shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
        >
          Próxima &rarr;
        </Button>
      </div>

      {/* Slider Radix */}
      <div className="px-2 pt-2">
        <label htmlFor="scrubber-slider" className="sr-only">
          Navegar na linha do tempo clínica
        </label>
        <Slider
          id="scrubber-slider"
          min={0}
          max={sessoesDisponiveis.length - 1}
          step={1}
          value={[valorVisual]}
          onValueChange={(values) =>
            setDragState({ committedIndex: indexValido, valor: values[0] ?? 0 })
          }
          onValueCommit={handleSliderChange}
          aria-label="Selecionar sessão histórica"
        />
        <div className="mt-1 flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Início (Sessão {sessoesDisponiveis[0]})</span>
          <span>Atual (Sessão {ultimaSessaoDisponivel})</span>
        </div>
      </div>
    </div>
  );
}
