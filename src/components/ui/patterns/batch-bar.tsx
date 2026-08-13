import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";
import { Button } from "@/components/ui/button";
import { CheckIcon, AlertTriangleIcon } from "@/components/ui/icon";

export interface BatchBarProps extends React.HTMLAttributes<HTMLDivElement> {
  selecionados: number;
  totalElegiveis: number;
  totalItens?: number;
  bloqueados?: number;
  onAprovarLote?: () => void;
  onLimparSelecao?: () => void;
  onSelecionarTodosElegiveis?: () => void;
  carregando?: boolean;
}

/**
 * BatchBar — Barra de aprovação em lote para a tela de revisão clínica (Fase 3).
 * Oferece controle com contadores claros e proteção para itens de alta fricção.
 */
export function BatchBar({
  selecionados,
  totalElegiveis,
  totalItens,
  bloqueados = 0,
  onAprovarLote,
  onLimparSelecao,
  onSelecionarTodosElegiveis,
  carregando = false,
  className,
  ...props
}: BatchBarProps) {
  const podeAprovar = selecionados > 0 && !carregando;

  // Nenhum item elegível a lote (`avaliarFriccao` exige alta confiança E
  // consistência com histórico) — mostrar controles de seleção/aprovação
  // seria oferecer uma ação que nunca pode ser executada. Estado informativo
  // em vez de toolbar morta.
  if (totalElegiveis === 0) {
    return (
      <div
        role="status"
        className={cn(
          "text-text-secondary sticky bottom-4 z-30 flex items-center gap-2 p-4 text-sm",
          surface("solida", {
            elevation: "overlay",
            radius: "xl",
            className: "bg-surface-card",
          }),
          className,
        )}
        {...props}
      >
        <AlertTriangleIcon
          size={14}
          className="text-status-warning-fg shrink-0"
        />
        <span>
          Nenhum item elegível para aprovação em lote — todos os{" "}
          {totalItens ?? bloqueados} itens exigem revisão individual (baixa
          confiança ou inconsistência com histórico).
        </span>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Ações em lote"
      className={cn(
        "text-text-primary sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 p-4",
        surface("solida", {
          elevation: "overlay",
          radius: "xl",
          className: "bg-surface-card",
        }),
        className,
      )}
      {...props}
    >
      {/* Contadores e status */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Denominador é sempre `totalElegiveis`: só itens elegíveis são
              selecionáveis, então usar o total geral faria a barra reportar
              "8 de 10" com 100% do selecionável já marcado. */}
          <span className="text-text-primary font-mono text-sm font-bold">
            {selecionados} de {totalElegiveis} elegíveis selecionados
          </span>
          {totalItens !== undefined && totalItens > totalElegiveis && (
            <span className="text-text-secondary text-xs">
              ({totalItens} itens na fila)
            </span>
          )}
        </div>

        {bloqueados > 0 && (
          <div className="bg-status-warning-bg/20 text-status-warning-fg flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium">
            <AlertTriangleIcon size={12} />
            <span>{bloqueados} itens requerem revisão manual</span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2">
        {onLimparSelecao && selecionados > 0 && (
          <Button
            variante="terciaria"
            tamanho="sm"
            onClick={onLimparSelecao}
            disabled={carregando}
          >
            Limpar
          </Button>
        )}

        {onSelecionarTodosElegiveis && selecionados < totalElegiveis && (
          <Button
            variante="secundaria"
            tamanho="sm"
            onClick={onSelecionarTodosElegiveis}
            disabled={carregando}
          >
            Selecionar Elegíveis ({totalElegiveis})
          </Button>
        )}

        {onAprovarLote && (
          <Button
            variante="primaria"
            tamanho="sm"
            onClick={onAprovarLote}
            disabled={!podeAprovar}
            isLoading={carregando}
            iconLeft={<CheckIcon size={14} />}
          >
            Aprovar Lote ({selecionados})
          </Button>
        )}
      </div>
    </div>
  );
}
