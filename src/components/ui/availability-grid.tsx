"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

export type AvailabilityGridProps = {
  passoMin?: number;
  abertura?: string;
  fechamento?: string;
  celulasIniciais?: Set<string>;
  celulas?: Set<string>;
  onCelulasChange?: (celulas: Set<string>) => void;
  onSalvar?: () => void;
  salvando?: boolean;
};

export function AvailabilityGrid({
  passoMin = 60,
  abertura = "07:00",
  fechamento = "20:00",
  celulasIniciais,
  celulas: celulasProps,
  onCelulasChange,
  onSalvar,
  salvando = false,
}: AvailabilityGridProps) {
  const [interno, setInterno] = React.useState<Set<string>>(
    () => celulasProps ?? celulasIniciais ?? new Set<string>()
  );

  const celulasAtivas = celulasProps ?? interno;

  function handleCelulasChange(novas: Set<string>) {
    setInterno(novas);
    onCelulasChange?.(novas);
  }

  function limparTudo() {
    handleCelulasChange(new Set());
  }

  return (
    <div className="w-full space-y-4">
      {/* Barra de Ações em Lote Brutalista */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-2 border-black bg-[var(--surface-card,#ffffff)] p-3 shadow-[2px_2px_0_#000]">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variante="neutra"
            size="sm"
            onClick={limparTudo}
            className="border-2 border-black font-display font-bold text-xs shadow-[1px_1px_0_#000]"
          >
            Limpar grade
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">
            Células Ativas: {celulasAtivas.size}
          </span>
          {onSalvar && (
            <Button
              type="button"
              variante="primaria"
              onClick={onSalvar}
              disabled={salvando}
              className="border-2 border-black bg-[#f2b705] font-display font-bold text-xs text-black shadow-[2px_2px_0_#000] hover:bg-[#d29e04]"
            >
              {salvando ? "Salvando..." : "Salvar disponibilidade"}
            </Button>
          )}
        </div>
      </div>

      {/* Grade de Matriz de Disponibilidade */}
      <Calendar.Grid
        modo="availability-matrix"
        abertura={abertura}
        fechamento={fechamento}
        passoMin={passoMin}
        celulasSelecionadas={celulasAtivas}
        onCelulasChange={handleCelulasChange}
      />
    </div>
  );
}
