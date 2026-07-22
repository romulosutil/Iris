"use client";

import { AvailabilityGrid } from "@/components/ui/availability-grid";

export type GradeProps = {
  passoMin: number;
  abertura?: string;
  fechamento?: string;
  celulasIniciais: Set<string>;
  onChange: (celulas: Set<string>) => void;
};

export function GradeDisponibilidade({
  passoMin,
  abertura = "07:00",
  fechamento = "20:00",
  celulasIniciais,
  onChange,
}: GradeProps) {
  return (
    <AvailabilityGrid
      passoMin={passoMin}
      abertura={abertura}
      fechamento={fechamento}
      celulasIniciais={celulasIniciais}
      onCelulasChange={onChange}
    />
  );
}
