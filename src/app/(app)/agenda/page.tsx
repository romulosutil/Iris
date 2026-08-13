import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DataRow } from "@/components/ui/data-row";
import { listarTerapeutas } from "@/app/(app)/equipe/[id]/queries";
import { listarSessoesDoDia, type SessaoDoDia } from "./logic";
import { pendentesDeConsolidacao, reposicoesPendentes } from "./queries";
import { EstadoBadge } from "./estado-badge";
import { GerirSessao } from "./gerir-sessao";
import { AgendaViewCliente } from "./agenda-view-cliente";
import { FUSO_CLINICA, FUSO_CLINICA_OFFSET } from "./fuso";

// Data de hoje (YYYY-MM-DD) no fuso da clínica — base da grade do dia.
function hojeNaClinica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_CLINICA }).format(
    new Date(),
  );
}

function horaDaSessao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

function dataPorExtenso(diaISO: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_CLINICA,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${diaISO}T12:00:00${FUSO_CLINICA_OFFSET}`));
}

export function ItemPendencia({
  sessao,
  tipo,
  terapeutas,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
}) {
  return (
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display text-lg font-bold">
            {horaDaSessao(sessao.agendadaPara)}
          </span>
          <EstadoBadge estado={sessao.estado} />
        </Cluster>
      }
      subtitle={
        <span>
          {sessao.pacienteNome ?? "Paciente (acesso restrito)"}
          {sessao.terapeutaNome ? (
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
          <Button asChild variante="secundaria" tamanho="sm">
            <Link
              href={`/agenda/semana?repor=${sessao.id}&patientId=${sessao.patientId}&terapeutaId=${sessao.terapeutaId}&disciplina=${encodeURIComponent(sessao.disciplina)}`}
            >
              Repor
            </Link>
          </Button>
        )
      }
    />
  );
}

import {
  PendenciasClusterCliente,
  type TipoPendencia,
} from "./pendencias-cluster-cliente";

export function SecaoPendencias({
  tituloId,
  titulo,
  itens,
  tipo,
  terapeutas,
}: {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
}) {
  if (itens.length === 0) return null;
  return (
    <PendenciasClusterCliente
      tituloId={tituloId}
      titulo={titulo}
      itens={itens}
      tipo={tipo}
      terapeutas={terapeutas}
    />
  );
}

// Valida `dia=YYYY-MM-DD` vindo da URL; inválido (formato ou data inexistente)
// cai no hoje da clínica.
function diaValidoOuHoje(dia: string | undefined): string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return hojeNaClinica();
  const [ano = 0, mes = 1, d = 1] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, d));
  const valida =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === d;
  return valida ? dia : hojeNaClinica();
}

const VISOES = ["matriz", "terapeuta", "horario"] as const;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; visao?: string }>;
}) {
  const ctx = await getTenantContext();
  const params = await searchParams;
  const dia = diaValidoOuHoje(params.dia);
  const podeAgendar =
    ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const podeGerir = ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const [sessoes, terapeutasRaw, pendentesConsolidacao, pendentesReposicao] =
    await Promise.all([
      listarSessoesDoDia(ctx, dia),
      listarTerapeutas(ctx),
      podeGerir ? pendentesDeConsolidacao(ctx) : Promise.resolve([]),
      podeGerir ? reposicoesPendentes(ctx) : Promise.resolve([]),
    ]);
  const terapeutas = terapeutasRaw.map((t) => ({
    id: t.id,
    nome: t.name ?? "—",
  }));
  const visaoInicial = VISOES.includes(params.visao as (typeof VISOES)[number])
    ? (params.visao as (typeof VISOES)[number])
    : podeGerir
      ? "matriz"
      : "terapeuta";

  return (
    <Stack gap="lg" className="pt-2 md:pt-4">
      <PageHeader
        title="Agenda do dia"
        description={dataPorExtenso(dia)}
        actions={
          podeAgendar ? (
            <Button asChild variante="primaria">
              <Link href="/agenda/semana">+ Agendar no Calendário</Link>
            </Button>
          ) : undefined
        }
      />

      <SecaoPendencias
        tituloId="pendentes-consolidacao-titulo"
        titulo="Pendentes de consolidação"
        itens={pendentesConsolidacao}
        tipo="consolidacao"
        terapeutas={terapeutas}
      />

      <SecaoPendencias
        tituloId="reposicoes-pendentes-titulo"
        titulo="Reposições pendentes"
        itens={pendentesReposicao}
        tipo="reposicao"
        terapeutas={terapeutas}
      />

      <AgendaViewCliente
        sessoes={sessoes}
        terapeutas={terapeutas}
        role={ctx.role}
        userId={ctx.userId}
        podeGerir={podeGerir}
        diaExtenso={dataPorExtenso(dia)}
        diaISO={dia}
        ehHoje={dia === hojeNaClinica()}
        visaoInicial={visaoInicial}
      />
    </Stack>
  );
}
