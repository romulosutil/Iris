"use client";

import * as React from "react";
import Link from "next/link";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/ui/data-row";
import { cn } from "@/lib/cn";
import { EstadoBadge } from "./estado-badge";
import { GerirSessao } from "./gerir-sessao";
import type { SessaoDoDia } from "./actions";

export type TipoPendencia = "consolidacao" | "reposicao";

export interface PendenciasClusterClienteProps {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
}

function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

function ItemPendenciaClustered({
  sessao,
  tipo,
  terapeutas,
  fuso,
  ocultarNomeTerapeuta = false,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
  ocultarNomeTerapeuta?: boolean;
}) {
  return (
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display text-lg font-bold text-[var(--text-primary)]">
            {horaDaSessao(sessao.agendadaPara, fuso)}
          </span>
          <EstadoBadge estado={sessao.estado} />
        </Cluster>
      }
      subtitle={
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {sessao.pacienteNome ?? "Paciente (acesso restrito)"}
          {!ocultarNomeTerapeuta && sessao.terapeutaNome ? (
            <span className="text-[var(--text-secondary)]">
              {" "}
              · {sessao.terapeutaNome}
            </span>
          ) : null}
        </span>
      }
      trailing={
        tipo === "consolidacao" ? (
          <GerirSessao sessionId={sessao.id} terapeutas={terapeutas} />
        ) : (
          <Link
            href={`/agenda/semana?repor=${sessao.id}&patientId=${sessao.patientId}&terapeutaId=${sessao.terapeutaId}&disciplina=${encodeURIComponent(sessao.disciplina)}`}
          >
            <Button variante="secundaria" tamanho="sm">
              Repor
            </Button>
          </Link>
        )
      }
    />
  );
}

export function PendenciasClusterCliente({
  tituloId,
  titulo,
  itens,
  tipo,
  terapeutas,
  fuso,
}: PendenciasClusterClienteProps) {
  const [filtroTerapeutaId, setFiltroTerapeutaId] =
    React.useState<string>("todos");
  const [recolhido, setRecolhido] = React.useState<boolean>(true);

  // Agrupar itens por terapeuta
  const gruposPorTerapeuta = React.useMemo(() => {
    const mapa = new Map<string, { nome: string; sessoes: SessaoDoDia[] }>();

    for (const item of itens) {
      const key = item.terapeutaId ?? "sem-terapeuta";
      const nome = item.terapeutaNome ?? "Profissional não atribuído";
      if (!mapa.has(key)) {
        mapa.set(key, { nome, sessoes: [] });
      }
      mapa.get(key)!.sessoes.push(item);
    }

    return Array.from(mapa.entries()).map(([id, data]) => ({
      terapeutaId: id,
      terapeutaNome: data.nome,
      sessoes: data.sessoes,
    }));
  }, [itens]);

  if (itens.length === 0) return null;

  // Itens filtrados se um terapeuta específico estiver selecionado
  const gruposExibidos =
    filtroTerapeutaId === "todos"
      ? gruposPorTerapeuta
      : gruposPorTerapeuta.filter((g) => g.terapeutaId === filtroTerapeutaId);

  return (
    <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow)]">
      <div className="flex items-center justify-between border-b-2 border-[var(--border-brutal)] pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-[var(--radius-xs)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--status-warning-fg)]">
            [PENDÊNCIAS]
          </span>
          <h2
            id={tituloId}
            className="font-display text-base font-bold text-[var(--text-primary)]"
          >
            {titulo}
          </h2>
        </div>
        <Button
          variante="neutra"
          tamanho="sm"
          onClick={() => setRecolhido((v) => !v)}
          aria-expanded={!recolhido}
        >
          {recolhido ? "Ver todos" : "Recolher"}
        </Button>
      </div>

      {!recolhido ? (
        <div className="divide-y border-b border-[var(--border-brutal)]/10 pt-2">
          {gruposExibidos.map((grupo) => (
            <div key={grupo.terapeutaId} className="py-3">
              <div className="mb-2 font-mono text-xs font-bold text-[var(--text-secondary)] uppercase">
                {grupo.terapeutaNome} ({grupo.sessoes.length})
              </div>
              <Stack gap="xs" como="ul">
                {grupo.sessoes.map((s) => (
                  <ItemPendenciaClustered
                    key={s.id}
                    sessao={s}
                    tipo={tipo}
                    terapeutas={terapeutas}
                    fuso={fuso}
                    ocultarNomeTerapeuta={true}
                  />
                ))}
              </Stack>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
