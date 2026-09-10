"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DataList,
  DataListGroup,
  DataListRow,
} from "@/components/ui/data-list";
import { Pill } from "@/components/ui/primitives/pill";
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

function diaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(quando));
}

/**
 * Uma linha da fila: hora | paciente | estado | ação. O terapeuta não se
 * repete na linha porque o grupo já o nomeia — a coluna que sobra é a data,
 * útil quando a pendência é de outro dia (consolidação atrasada).
 */
function LinhaPendencia({
  sessao,
  tipo,
  terapeutas,
  fuso,
  hojeISO,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
  hojeISO: string;
}) {
  const diaISO = new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(
    new Date(sessao.agendadaPara),
  );
  const ehOutroDia = diaISO !== hojeISO;
  return (
    <DataListRow
      inicio={horaDaSessao(sessao.agendadaPara, fuso)}
      titulo={sessao.pacienteNome ?? "Paciente (acesso restrito)"}
      detalhe={ehOutroDia ? diaDaSessao(sessao.agendadaPara, fuso) : undefined}
      estado={<EstadoBadge estado={sessao.estado} />}
      acoes={
        tipo === "consolidacao" ? (
          <GerirSessao sessionId={sessao.id} terapeutas={terapeutas} />
        ) : (
          // #512 · T14: `/agenda/semana` virou redirect para
          // `/agenda?escala=semana` — link interno aponta para a rota nova.
          <Button asChild variante="secundaria" tamanho="sm">
            <Link
              href={`/agenda?escala=semana&repor=${sessao.id}&patientId=${sessao.patientId}&terapeutaId=${sessao.terapeutaId}&disciplina=${encodeURIComponent(sessao.disciplina)}`}
            >
              Repor
            </Link>
          </Button>
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
  const [recolhido, setRecolhido] = React.useState<boolean>(true);
  const hojeISO = React.useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date()),
    [fuso],
  );

  // Agrupar itens por terapeuta, preservando a ordem de chegada (a query já
  // devolve por horário).
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

  return (
    <DataList
      aria-labelledby={tituloId}
      cabecalho={
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-[var(--radius-xs)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--status-warning-fg)]">
              [PENDÊNCIAS]
            </span>
            {/* A contagem vive no cabeçalho para que a fila recolhida ainda
                diga seu tamanho — abrir não pode ser o único jeito de saber
                se há 2 ou 40 pendências. */}
            <Pill
              variant="outline"
              colorScheme="neutral"
              size="sm"
              className="tabular-nums"
              aria-label={`${itens.length} ${itens.length === 1 ? "pendência" : "pendências"}`}
            >
              {itens.length}
            </Pill>
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
            aria-controls={`${tituloId}-corpo`}
          >
            {recolhido ? "Ver todas" : "Recolher"}
          </Button>
        </>
      }
    >
      {!recolhido ? (
        <div id={`${tituloId}-corpo`}>
          {gruposPorTerapeuta.map((grupo) => (
            <DataListGroup
              key={grupo.terapeutaId}
              titulo={grupo.terapeutaNome}
              contagem={grupo.sessoes.length}
            >
              {grupo.sessoes.map((s) => (
                <LinhaPendencia
                  key={s.id}
                  sessao={s}
                  tipo={tipo}
                  terapeutas={terapeutas}
                  fuso={fuso}
                  hojeISO={hojeISO}
                />
              ))}
            </DataListGroup>
          ))}
        </div>
      ) : null}
    </DataList>
  );
}
