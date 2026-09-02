"use client";

import { AvailabilityGrid } from "@/components/ui/availability-grid";
// D61: a grade de disponibilidade não tem `clinic.timezone` no caminho da
// request; a constante fica até a página passar o fuso real (#538, revisão).
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";

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
      fuso={FUSO_CLINICA}
    />
  );
}
