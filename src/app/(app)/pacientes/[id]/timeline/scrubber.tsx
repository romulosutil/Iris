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

export function Scrubber({
  sessoesDisponiveis,
  sessaoSelecionada,
  dataSessaoSelecionada,
  onSelecionarSessao,
}: ScrubberProps) {
  if (sessoesDisponiveis.length === 0) return null;

  // Encontra o index da sessão selecionada na lista
  const indexAtual = sessoesDisponiveis.indexOf(sessaoSelecionada);
  const indexValido = indexAtual !== -1 ? indexAtual : sessoesDisponiveis.length - 1;
  const sessaoAtual = sessoesDisponiveis[indexValido] ?? sessaoSelecionada;

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
  const ultimaSessaoDisponivel = sessoesDisponiveis[sessoesDisponiveis.length - 1];
  const isSessaoPassada = sessaoAtual !== ultimaSessaoDisponivel;

  return (
    <div className="bg-canvas border-ink-anchor flex flex-col gap-4 border-2 p-4">
      {/* Banner de Sessão Passada */}
      {isSessaoPassada && (
        <div className="bg-gold text-ink-anchor border-ink-anchor border-b-2 -mx-4 -mt-4 p-2 text-center text-sm font-bold flex items-center justify-center gap-2">
          <span>⚠️</span>
          <span>Visualizando histórico passado: Sessão {sessaoAtual}</span>
        </div>
      )}

      {/* Controles de Navegação */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variante="secundaria"
          disabled={!temAnterior}
          onClick={() => {
            const ant = sessoesDisponiveis[indexValido - 1];
            if (ant !== undefined) onSelecionarSessao(ant);
          }}
          aria-label="Sessão anterior"
        >
          &larr; Anterior
        </Button>

        <div className="text-center">
          <div className="text-lg font-black text-ink">
            Sessão {sessaoAtual}
          </div>
          {dataSessaoSelecionada && (
            <div className="text-xs text-muted">
              {formatarData(dataSessaoSelecionada)}
            </div>
          )}
        </div>

        <Button
          variante="secundaria"
          disabled={!temProximo}
          onClick={() => {
            const prox = sessoesDisponiveis[indexValido + 1];
            if (prox !== undefined) onSelecionarSessao(prox);
          }}
          aria-label="Próxima sessão"
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
          value={[indexValido]}
          onValueChange={handleSliderChange}
          aria-label="Selecionar sessão histórica"
        />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>Início (Sessão {sessoesDisponiveis[0]})</span>
          <span>Atual (Sessão {ultimaSessaoDisponivel})</span>
        </div>
      </div>
    </div>
  );
}
