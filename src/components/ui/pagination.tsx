import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  paginaAtual: number;
  totalPaginas: number;
  onPaginaChange: (pagina: number) => void;
  sumario?: React.ReactNode;
}

export const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  function Pagination(
    { className, paginaAtual, totalPaginas, onPaginaChange, sumario, ...props },
    ref,
  ) {
    const temAnterior = paginaAtual > 1;
    const temProxima = paginaAtual < totalPaginas;

    return (
      <nav
        ref={ref}
        aria-label="Paginação"
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 py-2",
          className,
        )}
        {...props}
      >
        {sumario ? (
          <div className="font-body text-sm font-medium text-[var(--text-secondary)]">
            {sumario}
          </div>
        ) : (
          <div className="font-body text-sm font-medium text-[var(--text-secondary)]">
            Página{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {paginaAtual}
            </span>{" "}
            de{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {totalPaginas}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variante="secundaria"
            tamanho="sm"
            disabled={!temAnterior}
            onClick={() => onPaginaChange(paginaAtual - 1)}
            aria-label="Página anterior"
          >
            Anterior
          </Button>

          <span className="px-2 font-mono text-xs font-semibold text-[var(--text-primary)]">
            {paginaAtual} / {totalPaginas}
          </span>

          <Button
            variante="secundaria"
            tamanho="sm"
            disabled={!temProxima}
            onClick={() => onPaginaChange(paginaAtual + 1)}
            aria-label="Próxima página"
          >
            Próxima
          </Button>
        </div>
      </nav>
    );
  },
);
