"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "@/components/ui/calendar/calendar-grid";

export type AvailabilityGridProps = {
  passoMin?: number;
  abertura?: string;
  fechamento?: string;
  celulasIniciais?: Set<string>;
  celulas?: Set<string>;
  onCelulasChange?: (celulas: Set<string>) => void;
  onSalvar?: () => void;
  salvando?: boolean;
  /** Fuso IANA da clínica — repassado à CalendarGrid, que o exige (#538). */
  fuso: string;
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
  fuso,
}: AvailabilityGridProps) {
  const [interno, setInterno] = React.useState<Set<string>>(
    () => celulasProps ?? celulasIniciais ?? new Set<string>(),
  );

  const celulasAtivas = celulasProps ?? interno;

  function handleCelulasChange(novas: Set<string>) {
    setInterno(novas);
    onCelulasChange?.(novas);
  }

  function limparTudo() {
    handleCelulasChange(new Set());
  }

  function copiarSegunda() {
    const novas = new Set(celulasAtivas);
    // Para cada chave de Segunda (dia 1), replica para os dias úteis (2 a 5)
    for (const key of Array.from(celulasAtivas)) {
      if (key.startsWith("1-")) {
        const h = key.slice(2);
        for (let d = 2; d <= 5; d++) {
          novas.add(`${d}-${h}`);
        }
      }
    }
    handleCelulasChange(novas);
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
            className="font-display border-2 border-black text-xs font-bold shadow-[1px_1px_0_#000]"
          >
            Limpar grade
          </Button>
          <Button
            type="button"
            variante="neutra"
            size="sm"
            onClick={copiarSegunda}
            className="font-display border-2 border-black text-xs font-bold shadow-[1px_1px_0_#000]"
          >
            Copiar Segunda
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
              className="font-display border-2 border-black bg-[#f2b705] text-xs font-bold text-black shadow-[2px_2px_0_#000] hover:bg-[#d29e04]"
            >
              {salvando ? "Salvando..." : "Salvar disponibilidade"}
            </Button>
          )}
        </div>
      </div>

      {/* Grade de Matriz de Disponibilidade */}
      <CalendarGrid
        modo="availability-matrix"
        fuso={fuso}
        abertura={abertura}
        fechamento={fechamento}
        passoMin={passoMin}
        celulasSelecionadas={celulasAtivas}
        onCelulasChange={handleCelulasChange}
      />
    </div>
  );
}
