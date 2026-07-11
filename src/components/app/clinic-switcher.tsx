"use client";

import { definirClinicaAtiva } from "@/auth/actions";
import { Button } from "@/components/ui/button";

interface ClinicSwitcherProps {
  clinicas: { clinicId: string; nome: string }[];
  ativaId: string;
}

/**
 * Mostra a clínica ativa e, quando o usuário pertence a mais de uma, oferece a
 * troca via server action `definirClinicaAtiva` (o cookie é gravado no servidor
 * e reseta o papel selecionado). Uma clínica só → apenas o nome, sem controle.
 */
export function ClinicSwitcher({ clinicas, ativaId }: ClinicSwitcherProps) {
  const ativa = clinicas.find((c) => c.clinicId === ativaId);
  const outras = clinicas.filter((c) => c.clinicId !== ativaId);

  if (outras.length === 0) {
    return (
      <span className="font-display text-ink font-semibold">
        {ativa?.nome}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-ink font-semibold">
        {ativa?.nome}
      </span>
      {outras.map((c) => (
        <form key={c.clinicId} action={definirClinicaAtiva.bind(null, c.clinicId)}>
          <Button type="submit" variante="neutra" className="text-sm">
            Trocar para {c.nome}
          </Button>
        </form>
      ))}
    </div>
  );
}
