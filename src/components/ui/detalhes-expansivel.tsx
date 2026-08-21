import * as React from "react";
import { cn } from "@/lib/cn";
import { ChevronDownIcon } from "@/components/ui/icon";

export interface DetalhesExpansiveisProps extends Omit<
  React.HTMLAttributes<HTMLDetailsElement>,
  "children"
> {
  /** Texto do gatilho (ex: "Ver respaldo regulatório"). */
  rotulo: React.ReactNode;
  /** Marca discreta à direita do gatilho (ex: "Prazo vencido"). */
  marcador?: React.ReactNode;
  iniciarAberto?: boolean;
  children: React.ReactNode;
}

/**
 * DetalhesExpansiveis — revelação progressiva para metadados secundários
 * (respaldo regulatório, prazos, métricas de protocolo).
 *
 * Usa `<details>`/`<summary>` nativos de propósito: o gatilho já é focável,
 * responde a Enter/Espaço e é anunciado como grupo expansível pelo leitor de
 * tela sem nenhum ARIA manual — e o conteúdo fechado sai da árvore de
 * acessibilidade em vez de ficar lido "por baixo" da interface.
 */
export const DetalhesExpansiveis = React.forwardRef<
  HTMLDetailsElement,
  DetalhesExpansiveisProps
>(function DetalhesExpansiveis(
  { className, rotulo, marcador, iniciarAberto = false, children, ...props },
  ref,
) {
  return (
    <details
      ref={ref}
      open={iniciarAberto}
      className={cn(
        "group border-t border-[var(--border-brutal)]/15",
        className,
      )}
      {...props}
    >
      <summary
        className={cn(
          "focus-visible:outline-focus flex min-h-[40px] cursor-pointer list-none items-center gap-2 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors select-none",
          "hover:text-[var(--text-primary)]",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronDownIcon
          size={14}
          aria-hidden
          focusable="false"
          className="shrink-0 transition-transform duration-150 group-open:rotate-180"
        />
        <span className="min-w-0 flex-1">{rotulo}</span>
        {marcador ? <span className="shrink-0">{marcador}</span> : null}
      </summary>

      <div className="flex flex-col gap-3 pt-1 pb-3 text-sm text-[var(--text-secondary)]">
        {children}
      </div>
    </details>
  );
});
