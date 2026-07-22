"use client";

import { Button } from "@/components/ui/button";

interface ClinicSwitcherProps {
  clinicas: { clinicId: string; nome: string }[];
  ativaId: string;
  onTrocarClinica?: (clinicId: string) => void;
}

/**
 * Mostra a clínica ativa e oferece a troca via server action `definirClinicaAtiva` ou callback.
 */
export function ClinicSwitcher({ clinicas, ativaId, onTrocarClinica }: ClinicSwitcherProps) {
  const ativa = clinicas.find((c) => c.clinicId === ativaId);
  const outras = clinicas.filter((c) => c.clinicId !== ativaId);

  if (outras.length === 0) {
    return (
      <span className="font-display text-[var(--text-primary)] font-semibold">
        {ativa?.nome}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-[var(--text-primary)] font-semibold text-sm">
        {ativa?.nome}
      </span>
      {outras.map((c) => (
        <form
          key={c.clinicId}
          action={async () => {
            if (onTrocarClinica) {
              onTrocarClinica(c.clinicId);
            } else {
              const { definirClinicaAtiva } = await import("@/auth/actions");
              await definirClinicaAtiva(c.clinicId);
            }
          }}
        >
          <Button type="submit" variante="neutra" tamanho="sm">
            Trocar para {c.nome}
          </Button>
        </form>
      ))}
    </div>
  );
}
