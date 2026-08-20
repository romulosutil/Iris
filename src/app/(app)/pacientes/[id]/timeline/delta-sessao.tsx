"use client";

import React from "react";
import type { DeltaSessao } from "./logic";
import { EstadoDeErro } from "./estado-de-erro";

interface DeltaSessaoProps {
  delta: DeltaSessao | null;
  metas: Array<{ id: string; descricao: string; disciplina: string | null }>;
  milestones: Array<{ id: string; nome: string; dominioId: string }>;
  carregando?: boolean;
  /**
   * A requisição falhou. Distinto de `delta === null`, que significa "carregou
   * e não houve alteração". Sem esta separação o painel afirmava que a sessão
   * não teve alteração clínica toda vez que a rede oscilava.
   */
  erro?: boolean;
  onTentarDeNovo?: () => void;
}

export function DeltaSessaoLateral({
  delta,
  metas,
  milestones,
  carregando = false,
  erro = false,
  onTentarDeNovo,
}: DeltaSessaoProps) {
  if (carregando) {
    return (
      <div className="flex animate-pulse flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4">
        <div className="h-6 w-1/3 border border-[var(--border-brutal)] bg-[var(--surface-elevated)]"></div>
        <div className="h-12 w-full border border-[var(--border-brutal)] bg-[var(--surface-elevated)]"></div>
        <div className="h-12 w-full border border-[var(--border-brutal)] bg-[var(--surface-elevated)]"></div>
      </div>
    );
  }

  // Ordem importa: o erro é avaliado ANTES do empty state, senão `delta ===
  // null` (o valor que o `catch` deixa) renderiza "Nenhuma alteração clínica
  // registrada nesta sessão" e a falha vira um fato sobre o paciente.
  if (erro) {
    return (
      <EstadoDeErro
        titulo="O resumo desta sessão não foi carregado"
        descricao="Não foi possível ler o que mudou nesta sessão. Isto não quer dizer que nada mudou — quer dizer que ainda não sabemos."
        onTentarDeNovo={onTentarDeNovo ?? (() => {})}
      />
    );
  }

  if (!delta || delta.itens.length === 0) {
    return (
      <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 text-center">
        <div className="text-base font-semibold text-[var(--text-secondary)]">
          Nenhuma alteração clínica registrada nesta sessão
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Apenas manutenção de repertório estável sem alterações de nível de
          ajuda.
        </p>
      </div>
    );
  }

  // Cria mapas de resolução de nomes
  const metaDescMap = new Map(metas.map((m) => [m.id, m.descricao]));
  const milestoneNomeMap = new Map(milestones.map((m) => [m.id, m.nome]));

  const obterNomeItem = (id: string) => {
    return (
      metaDescMap.get(id) ??
      milestoneNomeMap.get(id) ??
      `Meta/Marco (${id.substring(0, 8)})`
    );
  };

  const evolucoes = delta.itens.filter((i) => i.tipo === "evolucao");
  const regressoes = delta.itens.filter((i) => i.tipo === "regressao");
  const novos = delta.itens.filter((i) => i.tipo === "novo");

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
      <div className="border-b-2 border-[var(--border-brutal)] pb-2">
        <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
          Resumo da Sessão
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[var(--radius-xs)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-3">
          <div className="font-display text-2xl font-bold text-[var(--text-primary)]">
            {delta.evidenciasNovas}
          </div>
          <div className="font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
            Evidências Registradas
          </div>
        </div>
        <div className="rounded-[var(--radius-xs)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-3">
          <div className="font-display text-2xl font-bold text-[var(--text-primary)]">
            {delta.metasCandidatasNovas}
          </div>
          <div className="font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
            Novas Candidatas
          </div>
        </div>
      </div>

      {/* Listagem detalhada */}
      <div className="flex max-h-[350px] flex-col gap-3 overflow-y-auto pr-1">
        {/* Novos Itens */}
        {novos.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
              🚀 Introduzidos na Sessão ({novos.length})
            </h4>
            {novos.map((item) => (
              <div
                key={item.id}
                className="rounded-[var(--radius-control)] border-2 border-[var(--status-info-border)] bg-[var(--status-info-bg)] p-2.5 text-sm font-medium text-[var(--status-info-fg)] shadow-[var(--ds-shadow-sm)]"
              >
                <div>{obterNomeItem(item.id)}</div>
                <div className="mt-0.5 text-xs font-bold text-[var(--status-info-fg)]">
                  Nível inicial:{" "}
                  {item.nivelNovo !== null
                    ? `Nível ${item.nivelNovo}`
                    : "Independente"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Evoluções */}
        {evolucoes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
              📈 Evoluções ({evolucoes.length})
            </h4>
            {evolucoes.map((item) => (
              <div
                key={item.id}
                className="rounded-[var(--radius-control)] border-2 border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-2.5 text-sm font-medium text-[var(--status-success-fg)] shadow-[var(--ds-shadow-sm)]"
              >
                <div>{obterNomeItem(item.id)}</div>
                <div className="mt-0.5 flex justify-between text-xs font-bold text-[var(--status-success-fg)]">
                  <span>
                    De:{" "}
                    {item.nivelAnterior !== null
                      ? `Nível ${item.nivelAnterior}`
                      : "Sem nível"}
                  </span>
                  <span>&rarr;</span>
                  <span>
                    Para:{" "}
                    {item.nivelNovo !== null
                      ? `Nível ${item.nivelNovo}`
                      : "Independente"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regressões */}
        {regressoes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
              📉 Regressões / Removidos ({regressoes.length})
            </h4>
            {regressoes.map((item) => (
              <div
                key={item.id}
                className="rounded-[var(--radius-control)] border-2 border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-2.5 text-sm font-medium text-[var(--status-error-fg)] shadow-[var(--ds-shadow-sm)]"
              >
                <div>{obterNomeItem(item.id)}</div>
                <div className="mt-0.5 flex justify-between text-xs font-bold text-[var(--status-error-fg)]">
                  <span>
                    De:{" "}
                    {item.nivelAnterior !== null
                      ? `Nível ${item.nivelAnterior}`
                      : "Independente"}
                  </span>
                  <span>&rarr;</span>
                  <span>
                    Para:{" "}
                    {item.nivelNovo !== null
                      ? `Nível ${item.nivelNovo}`
                      : "Nulo / Arquivado"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
