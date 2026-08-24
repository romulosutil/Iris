"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/primitives/pill";
import type { StatusMfaMembro } from "./queries";

export interface StatusMfaCardProps {
  membros: StatusMfaMembro[];
}

export function StatusMfaCard({ membros }: StatusMfaCardProps) {
  const ativadosCount = membros.filter((m) => m.mfaAtivo).length;
  const percentual =
    membros.length > 0 ? Math.round((ativadosCount / membros.length) * 100) : 0;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">
            Status de Autenticação de 2 Fatores (2FA / MFA)
          </h2>
          <p className="text-sm text-[var(--texto-suave)]">
            Acompanhamento nominal da adesão da equipe ao segundo fator de segurança.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill
            variant="solid"
            colorScheme={percentual === 100 ? "menta" : "ouro"}
            size="md"
          >
            {ativadosCount} de {membros.length} ativaram ({percentual}%)
          </Pill>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--linha-suave)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--bg-card-subtle)] text-xs font-bold uppercase text-[var(--texto-suave)] border-b border-[var(--linha-suave)]">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3 text-right">Status 2FA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--linha-suave)]">
            {membros.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--texto-suave)]">
                  Nenhum membro da equipe encontrado.
                </td>
              </tr>
            ) : (
              membros.map((m) => (
                <tr key={m.userId} className="hover:bg-[var(--bg-hover)]">
                  <td className="px-4 py-3 font-semibold text-[var(--texto-forte)]">
                    {m.nome}
                  </td>
                  <td className="px-4 py-3 text-[var(--texto-padrao)]">{m.email}</td>
                  <td className="px-4 py-3 text-[var(--texto-suave)] capitalize">
                    {m.papel}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.mfaAtivo ? (
                      <Pill variant="solid" colorScheme="menta" size="sm">
                        Ativado
                      </Pill>
                    ) : (
                      <Pill variant="solid" colorScheme="coral" size="sm">
                        Pendente
                      </Pill>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
