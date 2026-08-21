"use client";

import React from "react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import type { Procedencia } from "../anamnese/schemas";

export const ROTULO_PROCEDENCIA: Record<Procedencia, string> = {
  relatado_responsavel: "Relatado pelo responsável",
  observado_avaliador: "Observado pelo avaliador",
  registro_anterior: "Registro anterior",
};

export interface ProcedenciaMarcoZeroProps {
  origem?: string | null;
  procedencia?: Procedencia | string | null;
  className?: string;
}

/**
 * Exibe a proveniência epistêmica de um alvo no Marco 0 (ANAM-19).
 * Só é exibido se o alvo foi originado da anamnese (origem === "anamnese")
 * e possui uma procedência válida declarada.
 */
export function ProcedenciaMarcoZero({
  origem,
  procedencia,
  className,
}: ProcedenciaMarcoZeroProps) {
  if (origem !== "anamnese" || !procedencia) {
    return null;
  }

  const rotulo =
    ROTULO_PROCEDENCIA[procedencia as Procedencia] ??
    (Object.prototype.hasOwnProperty.call(ROTULO_PROCEDENCIA, procedencia)
      ? ROTULO_PROCEDENCIA[procedencia as Procedencia]
      : null);

  if (!rotulo) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label={`Procedência do nível de partida: ${rotulo}`}
      className={cn("inline-flex items-center", className)}
    >
      <Chip
        variante="neutral"
        className="border-[var(--border-subtle,#e4e4e7)] bg-[var(--surface-elevated,#f4f4f5)] font-sans text-xs tracking-normal text-[var(--text-secondary)] normal-case"
      >
        {rotulo}
      </Chip>
    </div>
  );
}
