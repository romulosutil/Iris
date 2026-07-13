"use client";

import React from "react";
import type { DeltaSessao } from "./logic";

interface DeltaSessaoProps {
  delta: DeltaSessao | null;
  metas: Array<{ id: string; descricao: string; disciplina: string | null }>;
  milestones: Array<{ id: string; nome: string; dominioId: string }>;
  carregando?: boolean;
}

export function DeltaSessaoLateral({
  delta,
  metas,
  milestones,
  carregando = false,
}: DeltaSessaoProps) {
  if (carregando) {
    return (
      <div className="bg-canvas border-ink-anchor border-2 p-4 animate-pulse flex flex-col gap-3">
        <div className="h-6 bg-muted w-1/3 border border-ink-anchor"></div>
        <div className="h-12 bg-muted w-full border border-ink-anchor"></div>
        <div className="h-12 bg-muted w-full border border-ink-anchor"></div>
      </div>
    );
  }

  if (!delta || delta.itens.length === 0) {
    return (
      <div className="bg-canvas border-ink-anchor border-2 p-6 text-center">
        <div className="text-muted text-base font-semibold">
          Nenhuma alteração clínica registrada nesta sessão
        </div>
        <p className="text-xs text-muted mt-1">
          Apenas manutenção de repertório estável sem alterações de nível de ajuda.
        </p>
      </div>
    );
  }

  // Cria mapas de resolução de nomes
  const metaDescMap = new Map(metas.map((m) => [m.id, m.descricao]));
  const milestoneNomeMap = new Map(milestones.map((m) => [m.id, m.nome]));

  const obterNomeItem = (id: string) => {
    return metaDescMap.get(id) ?? milestoneNomeMap.get(id) ?? `Meta/Marco (${id.substring(0, 8)})`;
  };

  const evolucoes = delta.itens.filter((i) => i.tipo === "evolucao");
  const regressoes = delta.itens.filter((i) => i.tipo === "regressao");
  const novos = delta.itens.filter((i) => i.tipo === "novo");

  return (
    <div className="bg-canvas border-ink-anchor flex flex-col gap-4 border-2 p-4">
      <div className="border-ink-anchor border-b-2 pb-2">
        <h3 className="text-lg font-black text-ink">
          Delta da Sessão
        </h3>
        <p className="text-xs text-muted mt-0.5">
          Resumo das evoluções e registros consolidados na sessão selecionada.
        </p>
      </div>

      {/* Indicadores numéricos rápidos */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-canvas border-ink-anchor border-2 p-2">
          <div className="text-2xl font-black text-ink">{delta.evidenciasNovas}</div>
          <div className="text-xxs font-bold text-muted uppercase tracking-wider">Evidências</div>
        </div>
        <div className="bg-canvas border-ink-anchor border-2 p-2">
          <div className="text-2xl font-black text-ink">{delta.metasCandidatasNovas}</div>
          <div className="text-xxs font-bold text-muted uppercase tracking-wider">Candidatas</div>
        </div>
      </div>

      {/* Listagem detalhada */}
      <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
        {/* Novos Itens */}
        {novos.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
              🚀 Introduzidos na Sessão ({novos.length})
            </h4>
            {novos.map((item) => (
              <div
                key={item.id}
                className="bg-blue-50 border-blue-600 border-2 p-2 text-sm text-blue-900 font-medium"
              >
                <div>{obterNomeItem(item.id)}</div>
                <div className="text-xs text-blue-700 mt-0.5 font-bold">
                  Nível inicial: {item.nivelNovo !== null ? `Nível ${item.nivelNovo}` : "Independente"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Evoluções */}
        {evolucoes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
              📈 Evoluções ({evolucoes.length})
            </h4>
            {evolucoes.map((item) => (
              <div
                key={item.id}
                className="bg-green-50 border-green-600 border-2 p-2 text-sm text-green-900 font-medium"
              >
                <div>{obterNomeItem(item.id)}</div>
                <div className="text-xs text-green-700 mt-0.5 font-bold flex justify-between">
                  <span>De: {item.nivelAnterior !== null ? `Nível ${item.nivelAnterior}` : "Sem nível"}</span>
                  <span>&rarr;</span>
                  <span>Para: {item.nivelNovo !== null ? `Nível ${item.nivelNovo}` : "Independente"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regressões */}
        {regressoes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
              📉 Regressões / Removidos ({regressoes.length})
            </h4>
            {regressoes.map((item) => (
              <div
                key={item.id}
                className="bg-red-50 border-red-600 border-2 p-2 text-sm text-red-900 font-medium"
              >
                <div>{obterNomeItem(item.id)}</div>
                <div className="text-xs text-red-700 mt-0.5 font-bold flex justify-between">
                  <span>De: {item.nivelAnterior !== null ? `Nível ${item.nivelAnterior}` : "Independente"}</span>
                  <span>&rarr;</span>
                  <span>Para: {item.nivelNovo !== null ? `Nível ${item.nivelNovo}` : "Nulo / Arquivado"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
