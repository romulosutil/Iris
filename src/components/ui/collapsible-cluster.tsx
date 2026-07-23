"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/ui/status-badge";

export interface CollapsibleClusterProps extends React.HTMLAttributes<HTMLDivElement> {
  titulo: string;
  subtitulo?: string;
  badgeTexto?: string;
  badgeVariante?: "sucesso" | "aviso" | "info" | "erro" | "neutro";
  iniciarAberto?: boolean;
  children: React.ReactNode;
}

export function CollapsibleCluster({
  className,
  titulo,
  subtitulo,
  badgeTexto,
  badgeVariante = "neutro",
  iniciarAberto = true,
  children,
  ...props
}: CollapsibleClusterProps) {
  const [aberto, setAberto] = React.useState(iniciarAberto);

  return (
    <section
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)] overflow-hidden transition-all",
        className,
      )}
      {...props}
    >
      {/* Trigger de expansão/colapso */}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="flex items-center justify-between gap-4 p-4 text-left w-full hover:bg-[var(--surface-elevated)]/50 transition-colors focus-visible:outline-focus min-h-[52px]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn(
              "font-mono text-sm font-bold text-[var(--text-secondary)] transition-transform duration-200",
              aberto ? "rotate-90" : "rotate-0",
            )}
            aria-hidden="true"
          >
            ▶
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
            <h2 className="font-display font-bold text-lg text-[var(--text-primary)] truncate">
              {titulo}
            </h2>
            {subtitulo ? (
              <span className="text-xs text-[var(--text-secondary)] font-medium">
                {subtitulo}
              </span>
            ) : null}
          </div>
        </div>

        {badgeTexto ? (
          <div className="shrink-0">
            <StatusBadge variante={badgeVariante === "sucesso" ? "success" : "warning"}>
              {badgeTexto}
            </StatusBadge>
          </div>
        ) : null}
      </button>

      {/* Conteúdo do Agrupador com Grid Fluido para Cards */}
      {aberto ? (
        <div className="p-4 pt-1 border-t border-[var(--border-brutal)]/20 bg-[var(--surface-ground)]/40">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
            {children}
          </div>
        </div>
      ) : null}
    </section>
  );
}
