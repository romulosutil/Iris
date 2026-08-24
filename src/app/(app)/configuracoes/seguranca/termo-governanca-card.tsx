"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/primitives/pill";
import { Button } from "@/components/ui/button";
import type { TermoGovernancaData } from "./queries";

export interface TermoGovernancaCardProps {
  termo: TermoGovernancaData;
}

export function TermoGovernancaCard({ termo }: TermoGovernancaCardProps) {
  const [visualizando, setVisualizando] = React.useState(false);

  const formatarData = (d: Date) => {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const baixarTermo = () => {
    const conteudo = `================================================================================
TERMO DE GOVERNANÇA, SEGURANÇA E CRIPTOGRAFIA
Plataforma Iris — Gestão e Prontuário Eletrônico
================================================================================

Identificação da Clínica: ${termo.nomeClinica}
ID do Tenant: ${termo.clinicId}
CNPJ/CPF: ${termo.cnpjCpf ?? "Não cadastrado"}
Data de Emissão: ${formatarData(termo.geradoEm)}

--------------------------------------------------------------------------------
DECLARAÇÃO DE CONFORMIDADE E GARANTIAS DE SEGURANÇA
--------------------------------------------------------------------------------

A plataforma Iris declara e certifica que a infraestrutura de dados da clínica
atende aos mais rigorosos padrões de proteção e privacidade de dados em saúde:

1. CRIPTOGRAFIA EM REPOUSO:
   ${termo.totemSeguranca.criptografiaRepositorio}

2. CRIPTOGRAFIA EM TRÂNSITO:
   ${termo.totemSeguranca.criptografiaTransito}

3. ISOLAMENTO MULTI-TENANT:
   ${termo.totemSeguranca.isolamentoTenant}

4. POLÍTICA DE BACKUP E RETENÇÃO:
   ${termo.totemSeguranca.cicloBackup}

5. GOVERNANÇA DE INTELIGÊNCIA ARTIFICIAL:
   ${termo.totemSeguranca.politicaLlm}

6. PRIVACIDADE E LEI GERAL DE PROTEÇÃO DE DADOS (LGPD):
   ${termo.totemSeguranca.conformidadeLgpd}

================================================================================
Documento gerado automaticamente pelo Painel de Governança e Segurança da Clínica.
================================================================================
`;

    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Termo_Governanca_Seguranca_${termo.nomeClinica.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">
            Termo de Governança e Criptografia
          </h2>
          <p className="text-sm text-[var(--texto-suave)]">
            Evidência oficial de postura de segurança para convênios, auditorias e famílias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variante="secundaria"
            onClick={() => setVisualizando(!visualizando)}
          >
            {visualizando ? "Ocultar Detalhes" : "Visualizar Termo"}
          </Button>
          <Button variante="primaria" onClick={baixarTermo}>
            Baixar Termo (.txt)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-[var(--linha-suave)] p-3">
          <p className="text-xs font-semibold text-[var(--texto-suave)] uppercase">
            Criptografia em Repouso
          </p>
          <p className="mt-1 text-sm font-medium">AES-256 (Postgres e S3)</p>
        </div>
        <div className="rounded-md border border-[var(--linha-suave)] p-3">
          <p className="text-xs font-semibold text-[var(--texto-suave)] uppercase">
            Criptografia em Trânsito
          </p>
          <p className="mt-1 text-sm font-medium">HTTPS / TLS 1.3</p>
        </div>
        <div className="rounded-md border border-[var(--linha-suave)] p-3">
          <p className="text-xs font-semibold text-[var(--texto-suave)] uppercase">
            Isolamento de Banco
          </p>
          <p className="mt-1 text-sm font-medium">Row Level Security (RLS)</p>
        </div>
        <div className="rounded-md border border-[var(--linha-suave)] p-3">
          <p className="text-xs font-semibold text-[var(--texto-suave)] uppercase">
            Ciclo de Backups
          </p>
          <p className="mt-1 text-sm font-medium">Retenção de 30 Dias (Cifrado)</p>
        </div>
        <div className="rounded-md border border-[var(--linha-suave)] p-3">
          <p className="text-xs font-semibold text-[var(--texto-suave)] uppercase">
            Governança de IA
          </p>
          <p className="mt-1 text-sm font-medium">Zero Training Policy</p>
        </div>
        <div className="rounded-md border border-[var(--linha-suave)] p-3">
          <p className="text-xs font-semibold text-[var(--texto-suave)] uppercase">
            Conformidade Legal
          </p>
          <p className="mt-1 text-sm font-medium">LGPD Art. 11 e 14</p>
        </div>
      </div>

      {visualizando ? (
        <div className="mt-2 rounded-md border border-[var(--linha-forte)] bg-[var(--bg-card)] p-4 font-mono text-xs leading-relaxed">
          <div className="flex items-center justify-between border-b pb-2 mb-3">
            <span className="font-bold uppercase">Termo Oficial de Governança</span>
            <Pill variant="solid" colorScheme="menta" size="sm">
              Emitido em {formatarData(termo.geradoEm)}
            </Pill>
          </div>
          <p className="mb-2"><strong>Clínica:</strong> {termo.nomeClinica}</p>
          <p className="mb-2"><strong>ID Tenant:</strong> {termo.clinicId}</p>
          <p className="mb-4"><strong>CPF/CNPJ:</strong> {termo.cnpjCpf ?? "Não cadastrado"}</p>

          <ul className="list-disc space-y-2 pl-4">
            <li><strong>Repouso:</strong> {termo.totemSeguranca.criptografiaRepositorio}</li>
            <li><strong>Trânsito:</strong> {termo.totemSeguranca.criptografiaTransito}</li>
            <li><strong>Isolamento:</strong> {termo.totemSeguranca.isolamentoTenant}</li>
            <li><strong>Backups:</strong> {termo.totemSeguranca.cicloBackup}</li>
            <li><strong>IA:</strong> {termo.totemSeguranca.politicaLlm}</li>
            <li><strong>LGPD:</strong> {termo.totemSeguranca.conformidadeLgpd}</li>
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
