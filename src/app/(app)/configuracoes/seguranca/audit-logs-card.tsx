"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/primitives/pill";
import type { RegistroAuditLog } from "./queries";

export interface AuditLogsCardProps {
  logs: RegistroAuditLog[];
}

export function AuditLogsCard({ logs }: AuditLogsCardProps) {
  const formatarData = (d: Date) => {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">
            Trilha de Auditoria e Acessos (`audit_log`)
          </h2>
          <p className="text-sm text-[var(--texto-suave)]">
            Registro imutável das ações clínicas, acessos e alterações da clínica.
          </p>
        </div>
        <Pill variant="inset" colorScheme="azul" size="md">
          {logs.length} eventos recentes
        </Pill>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--linha-suave)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--bg-card-subtle)] text-xs font-bold uppercase text-[var(--texto-suave)] border-b border-[var(--linha-suave)]">
            <tr>
              <th className="px-4 py-3">Data/Hora</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Entidade</th>
              <th className="px-4 py-3">Ator</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--linha-suave)]">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--texto-suave)]">
                  Nenhum registro de auditoria encontrado.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--bg-hover)]">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--texto-suave)] whitespace-nowrap">
                    {formatarData(log.criadoEm)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--texto-forte)]">
                    <Pill variant="outline" colorScheme="violeta" size="sm">
                      {log.acao}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-[var(--texto-padrao)] font-mono text-xs">
                    {log.entidade} ({log.entidadeId.slice(0, 8)}...)
                  </td>
                  <td className="px-4 py-3 text-[var(--texto-suave)]">
                    {log.atorNome ? `${log.atorNome} (${log.atorEmail})` : "Sistema (Autônomo)"}
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
