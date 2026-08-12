import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "../button";
import { CheckIcon, SparkleIcon } from "../icon";
import { Pill } from "../primitives/pill";

export interface BatchBarProps extends React.HTMLAttributes<HTMLDivElement> {
  selecionadosContagem: number;
  totalItens?: number;
  onAprovarLote?: () => void;
  onCancelarSelecao?: () => void;
  isLoading?: boolean;
}

export const BatchBar = React.forwardRef<HTMLDivElement, BatchBarProps>(
  function BatchBar(
    {
      className,
      selecionadosContagem,
      totalItens,
      onAprovarLote,
      onCancelarSelecao,
      isLoading = false,
      ...props
    },
    ref
  ) {
    if (selecionadosContagem <= 0) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "fixed bottom-4 left-4 right-4 z-40 md:left-auto md:right-8 md:max-w-xl",
          "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4",
          "border-[3px] border-black bg-[var(--action-primary)] text-black rounded-[var(--radius-md)]",
          "shadow-[6px_6px_0px_#000000] transition-all duration-200",
          className
        )}
        {...props}
      >
        {/* Lado Esquerdo: Info / Status */}
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-black text-[var(--action-primary)] rounded-full shrink-0">
            <SparkleIcon className="h-5 w-5 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-black text-sm uppercase tracking-wide">
              Aprovação em Lote por IA
            </span>
            <span className="text-xs font-semibold font-mono text-black/70">
              {selecionadosContagem}{" "}
              {totalItens ? `de ${totalItens}` : ""} itens selecionados e qualificados
            </span>
          </div>
        </div>

        {/* Lado Direito: Ações */}
        <div className="flex items-center gap-2 sm:self-center self-end">
          {onCancelarSelecao && (
            <Button
              variante="terciaria"
              tamanho="sm"
              onClick={onCancelarSelecao}
              disabled={isLoading}
              className="hover:bg-black/10 text-black border-transparent"
            >
              Cancelar
            </Button>
          )}
          {onAprovarLote && (
            <Button
              variante="secundaria"
              tamanho="sm"
              iconLeft={<CheckIcon className="h-4 w-4" />}
              onClick={onAprovarLote}
              disabled={isLoading}
              isLoading={isLoading}
              className="bg-black text-[var(--action-primary)] border-2 border-black hover:bg-black/90 active:translate-x-[2px] active:translate-y-[2px]"
            >
              Aprovar Lote
            </Button>
          )}
        </div>
      </div>
    );
  }
);
