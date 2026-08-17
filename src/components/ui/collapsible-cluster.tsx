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
        "flex flex-col overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)] transition-all",
        className,
      )}
      {...props}
    >
      {/* Trigger de expansão/colapso */}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="focus-visible:outline-focus flex min-h-[52px] w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-[var(--surface-elevated)]/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "font-mono text-sm font-bold text-[var(--text-secondary)] transition-transform duration-200",
              aberto ? "rotate-90" : "rotate-0",
            )}
            aria-hidden="true"
          >
            ▶
          </span>
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <h2 className="font-display truncate text-lg font-bold text-[var(--text-primary)]">
              {titulo}
            </h2>
            {subtitulo ? (
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {subtitulo}
              </span>
            ) : null}
          </div>
        </div>

        {badgeTexto ? (
          <div className="shrink-0">
            <StatusBadge
              variante={badgeVariante === "sucesso" ? "success" : "warning"}
            >
              {badgeTexto}
            </StatusBadge>
          </div>
        ) : null}
      </button>

      {/* Conteúdo do Agrupador com Grid Fluido para Cards */}
      {aberto ? (
        <div className="border-t border-[var(--border-brutal)]/20 bg-[var(--surface-ground)]/40 p-4 pt-1">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
            {children}
          </div>
        </div>
      ) : null}
    </section>
  );
}
