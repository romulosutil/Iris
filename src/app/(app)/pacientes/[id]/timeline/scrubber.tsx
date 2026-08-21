"use client";

import React from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { rotuloPonto } from "./rotulos";

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
      className="inline-block shrink-0"
    >
      <path
        d="M10 2L2 17h16L10 2zM10 7v5M10 14.5v.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function Scrubber({
  sessoesDisponiveis,
  sessaoSelecionada,
  dataSessaoSelecionada,
  onSelecionarSessao,
}: ScrubberProps) {
  const ultimaSessaoDisponivel =
    sessoesDisponiveis[sessoesDisponiveis.length - 1];

  // Garante que a sessão selecionada seja válida dentro do array, senão usa a última disponível
  const indexValido = sessoesDisponiveis.indexOf(sessaoSelecionada);
  const sessaoEfetiva =
    indexValido !== -1
      ? sessaoSelecionada
      : (ultimaSessaoDisponivel ?? sessaoSelecionada);

  // Estado transitório do drag do slider para não congelar o React
  const [dragState, setDragState] = React.useState<{
    committedIndex: number;
    valor: number;
  } | null>(null);

  // A sessão exibida enquanto arrasta o slider é a do valor transitório; caso contrário a selecionada
  const valorVisual =
    dragState !== null
      ? dragState.valor
      : Math.max(0, sessoesDisponiveis.indexOf(sessaoEfetiva));

  const sessaoVisual = sessoesDisponiveis[valorVisual] ?? sessaoEfetiva;
  const isSessaoPassada =
    ultimaSessaoDisponivel !== undefined &&
    sessaoVisual < ultimaSessaoDisponivel;

  const temAnterior = indexValido > 0;
  const temProximo =
    indexValido !== -1 && indexValido < sessoesDisponiveis.length - 1;

  const handleSliderChange = (values: number[]) => {
    const novoIndex = values[0];
    if (
      novoIndex !== undefined &&
      sessoesDisponiveis[novoIndex] !== undefined
    ) {
      onSelecionarSessao(sessoesDisponiveis[novoIndex]!);
    }
    setDragState(null);
  };

  const formatarData = (data: Date) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(data));
  };

  if (sessoesDisponiveis.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4">
      {/* Banner de Sessão Passada */}
      {isSessaoPassada && (
        <div
          role="status"
          className="-mx-4 -mt-4 flex items-center justify-center gap-2 border-b-2 border-[var(--border-brutal)] bg-[var(--status-warning-bg)] p-2 text-center text-sm font-bold text-[var(--status-warning-fg)]"
        >
          <IconeAviso />
          <span>
            Visualizando histórico passado: {rotuloPonto(sessaoVisual)}
          </span>
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
            {rotuloPonto(sessaoVisual)}
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
          <span>Início ({rotuloPonto(sessoesDisponiveis[0] ?? 0)})</span>
          <span>Atual ({rotuloPonto(ultimaSessaoDisponivel ?? 0)})</span>
        </div>
      </div>
    </div>
  );
}
