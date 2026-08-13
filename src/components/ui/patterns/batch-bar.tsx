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
          "sticky bottom-4 z-30 flex items-center gap-2 p-4 text-sm text-text-secondary",
          surface("solida", {
            elevation: "overlay",
            radius: "xl",
            className: "bg-surface-card",
          }),
          className,
        )}
        {...props}
      >
        <AlertTriangleIcon size={14} className="shrink-0 text-status-warning-fg" />
        <span>
          Nenhum item elegível para aprovação em lote — todos os {totalItens ?? bloqueados}{" "}
          itens exigem revisão individual (baixa confiança ou inconsistência com histórico).
        </span>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Ações em lote"
      className={cn(
        "sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 p-4 text-text-primary",
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
          <span className="font-mono text-sm font-bold text-text-primary">
            {selecionados} de {totalItens ?? totalElegiveis} selecionados
          </span>
          <span className="text-xs text-text-secondary">
            ({totalElegiveis} elegíveis para lote)
          </span>
        </div>

        {bloqueados > 0 && (
          <div className="flex items-center gap-1.5 rounded bg-status-warning-bg/20 px-2 py-0.5 text-xs text-status-warning-fg font-medium">
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
