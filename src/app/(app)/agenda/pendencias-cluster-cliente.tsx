"use client";

import * as React from "react";
import Link from "next/link";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/ui/data-row";
import { cn } from "@/lib/cn";
import { EstadoBadge } from "./estado-badge";
import { GerirSessao } from "./gerir-sessao";
import { FUSO_CLINICA } from "./fuso";
import type { SessaoDoDia } from "./actions";

export type TipoPendencia = "consolidacao" | "reposicao";

export interface PendenciasClusterClienteProps {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
}

function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(quando));
}

export function ItemPendenciaClustered({
  sessao,
  tipo,
  terapeutas,
  ocultarNomeTerapeuta = false,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  ocultarNomeTerapeuta?: boolean;
}) {
  return (
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display font-bold text-lg text-[var(--text-primary)]">
            {horaDaSessao(sessao.agendadaPara)}
          </span>
          <EstadoBadge estado={sessao.estado} />
        </Cluster>
      }
      subtitle={
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {sessao.pacienteNome ?? "Paciente (acesso restrito)"}
          {!ocultarNomeTerapeuta && sessao.terapeutaNome ? (
            <span className="text-[var(--text-secondary)]"> · {sessao.terapeutaNome}</span>
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
}: PendenciasClusterClienteProps) {
  const [filtroTerapeutaId, setFiltroTerapeutaId] = React.useState<string>("todos");
  const [recolhido, setRecolhido] = React.useState<boolean>(false);

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
    <Stack como="section" gap="sm" aria-labelledby={tituloId} className="animate-fade-in-up">
      {/* Cabeçalho da Seção com Total e Ação de Recolher */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pb-1 border-b-2 border-[var(--border-brutal)]">
        <div className="flex items-center gap-3">
          <h2 id={tituloId} className="font-display text-[var(--text-primary)] text-xl md:text-2xl font-bold">
            {titulo}
          </h2>
          <span className="font-mono text-xs px-2.5 py-0.5 rounded-[var(--radius-pill)] border border-[var(--border-brutal)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] font-bold shrink-0">
            {itens.length}
          </span>
        </div>

        <Button
          variante="neutra"
          tamanho="sm"
          onClick={() => setRecolhido((v) => !v)}
          aria-expanded={!recolhido}
          className="shrink-0"
        >
          {recolhido ? "Expandir ▾" : "Recolher ⌃"}
        </Button>
      </div>

      {!recolhido ? (
        <Stack gap="md" className="pt-2">
          {/* Chips de Filtro Rápido por Terapeuta (exibidos se houver mais de 1 terapeuta) */}
          {gruposPorTerapeuta.length > 1 ? (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 overflow-x-auto pb-1 scrollbar-none max-w-full">
              <span className="text-xs font-mono font-bold uppercase text-[var(--text-secondary)] shrink-0">
                Filtrar:
              </span>


              <button
                type="button"
                onClick={() => setFiltroTerapeutaId("todos")}
                className={cn(
                  "cursor-pointer font-display text-xs px-3 py-1 rounded-[var(--radius-pill)] border-2 transition-all duration-100 shrink-0 font-semibold",
                  filtroTerapeutaId === "todos"
                    ? "bg-[var(--action-primary)] text-[var(--action-primary-fg)] font-bold border-[var(--border-brutal)] shadow-xs"
                    : "border-transparent bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-brutal)]/40 hover:text-[var(--text-primary)]"
                )}
              >
                Todos ({itens.length})
              </button>

              {gruposPorTerapeuta.map((grupo) => {
                const isSelected = filtroTerapeutaId === grupo.terapeutaId;
                return (
                  <button
                    key={grupo.terapeutaId}
                    type="button"
                    onClick={() => setFiltroTerapeutaId(grupo.terapeutaId)}
                    className={cn(
                      "cursor-pointer font-display text-xs px-3 py-1 rounded-[var(--radius-pill)] border-2 transition-all duration-100 shrink-0 font-semibold",
                      isSelected
                        ? "bg-[var(--action-primary)] text-[var(--action-primary-fg)] font-bold border-[var(--border-brutal)] shadow-xs"
                        : "border-transparent bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-brutal)]/40 hover:text-[var(--text-primary)]"
                    )}
                  >
                    {grupo.terapeutaNome} ({grupo.sessoes.length})
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Renderização dos Grupos Agrupados por Terapeuta */}
          <Stack gap="md">
            {gruposExibidos.map((grupo) => (
              <div key={grupo.terapeutaId} className="space-y-2">
                {/* Subcabeçalho do Terapeuta (mostrado na visão 'todos' ou se houver múltiplos) */}
                <div className="flex items-center justify-between pt-1 text-sm font-semibold text-[var(--text-secondary)] border-b border-[var(--border-brutal)]/20 pb-1">
                  <span className="font-display text-[var(--text-primary)] font-bold">
                    👩‍⚕️ {grupo.terapeutaNome}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-secondary)]">
                    {grupo.sessoes.length} {grupo.sessoes.length === 1 ? "pendência" : "pendências"}
                  </span>
                </div>

                {/* Lista de Itens do Terapeuta */}
                <Stack gap="xs" como="ul">
                  {grupo.sessoes.map((s) => (
                    <ItemPendenciaClustered
                      key={s.id}
                      sessao={s}
                      tipo={tipo}
                      terapeutas={terapeutas}
                      ocultarNomeTerapeuta={true}
                    />
                  ))}
                </Stack>
              </div>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
