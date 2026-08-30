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
import { ChecklistOnboarding } from "../checklist-onboarding";
import { obterProgressoOnboarding } from "../onboarding-queries";
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
import { resolverInstante } from "@/lib/agenda/materializar";

// Data de hoje (YYYY-MM-DD) no fuso da clínica — base da grade do dia.
function hojeNaClinica(fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(
    new Date(),
  );
}

function horaDaSessao(quando: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  }).format(quando);
}

function dataPorExtenso(diaISO: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(resolverInstante(diaISO, "12:00", fuso));
}

export function ItemPendencia({
  sessao,
  tipo,
  terapeutas,
  fuso,
}: {
  sessao: SessaoDoDia;
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
}) {
  return (
    <DataRow
      como="li"
      title={
        <Cluster gap="sm" className="items-center">
          <span className="font-display text-lg font-bold">
            {horaDaSessao(sessao.agendadaPara, fuso)}
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
  fuso,
}: {
  tituloId: string;
  titulo: string;
  itens: SessaoDoDia[];
  tipo: TipoPendencia;
  terapeutas: { id: string; nome: string }[];
  fuso: string;
}) {
  if (itens.length === 0) return null;
  return (
    <PendenciasClusterCliente
      tituloId={tituloId}
      titulo={titulo}
      itens={itens}
      tipo={tipo}
      terapeutas={terapeutas}
      fuso={fuso}
    />
  );
}

// Valida `dia=YYYY-MM-DD` vindo da URL; inválido (formato ou data inexistente)
// cai no hoje da clínica.
function diaValidoOuHoje(dia: string | undefined, fuso: string): string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return hojeNaClinica(fuso);
  const [ano = 0, mes = 1, d = 1] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, d));
  const valida =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === d;
  return valida ? dia : hojeNaClinica(fuso);
}

const VISOES = ["matriz", "terapeuta", "horario"] as const;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; visao?: string }>;
}) {
  const ctx = await getTenantContext();
  const params = await searchParams;
  const fuso = await fusoDaClinicaAtual(ctx);
  const dia = diaValidoOuHoje(params.dia, fuso);
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
  // O roteiro de onboarding é do coordenador: terapeuta e recepção não abrem
  // `/clinica/dados` nem `/equipe`, e a ida ao banco não se justifica neles.
  const progressoOnboarding =
    ctx.role === "coordenador" ? await obterProgressoOnboarding(ctx) : null;
  const visaoInicial = VISOES.includes(params.visao as (typeof VISOES)[number])
    ? (params.visao as (typeof VISOES)[number])
    : podeGerir
      ? "matriz"
      : "terapeuta";

  return (
    <Stack gap="lg" className="pt-2 md:pt-4">
      {progressoOnboarding ? (
        <ChecklistOnboarding
          progresso={progressoOnboarding}
          clinicId={ctx.clinicId}
        />
      ) : null}

      <PageHeader
        title="Agenda do dia"
        description={dataPorExtenso(dia, fuso)}
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
        fuso={fuso}
      />

      <SecaoPendencias
        tituloId="reposicoes-pendentes-titulo"
        titulo="Reposições pendentes"
        itens={pendentesReposicao}
        tipo="reposicao"
        terapeutas={terapeutas}
        fuso={fuso}
      />

      <AgendaViewCliente
        sessoes={sessoes}
        terapeutas={terapeutas}
        role={ctx.role}
        userId={ctx.userId}
        podeGerir={podeGerir}
        diaExtenso={dataPorExtenso(dia, fuso)}
        diaISO={dia}
        ehHoje={dia === hojeNaClinica(fuso)}
        visaoInicial={visaoInicial}
        fuso={fuso}
      />
    </Stack>
  );
}
