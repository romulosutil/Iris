import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DataRow } from "@/components/ui/data-row";
import { listarTerapeutas } from "@/app/(app)/equipe/[id]/queries";
import { listarSessoesDoDia, type SessaoDoDia } from "./logic";
import {
  carregarConfigClinica,
  pacientePorId,
  pendentesDeConsolidacao,
  reposicoesPendentes,
} from "./queries";
import type { Prefill } from "./semana/semana-cliente";
import { segundaDaSemana } from "@/lib/agenda/semana";
import { EstadoBadge } from "./estado-badge";
import { GerirSessao } from "./gerir-sessao";
import { AgendaViewCliente } from "./agenda-view-cliente";
import { ChecklistOnboarding } from "../checklist-onboarding";
import { obterProgressoOnboarding } from "../onboarding-queries";
import { fusoDaClinicaAtual } from "@/lib/agenda/clinic-timezone";
import { resolverInstante } from "@/lib/agenda/materializar";
import { podeCriarSessaoEmAgenda } from "@/lib/agenda/gating";

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

// #512 · T14-fix — prefill de "Repor" (Task 8 original), agora vindo de
// `/agenda?escala=semana&repor=...` em vez do extinto `/agenda/semana`.
// Parcial é tratado como ausente (mesma regra da página que este trecho
// substitui).
async function carregarPrefillReposicao(
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  params: {
    repor?: string;
    patientId?: string;
    terapeutaId?: string;
    disciplina?: string;
  },
): Promise<Prefill | undefined> {
  const { repor, patientId, terapeutaId, disciplina } = params;
  if (!repor || !patientId || !terapeutaId || !disciplina) return undefined;
  const paciente = await pacientePorId(ctx, patientId);
  if (!paciente) return undefined;
  return {
    repostaDe: repor,
    patientId,
    patientNome: paciente.nome,
    terapeutaId,
    disciplina,
  };
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    dia?: string;
    visao?: string;
    escala?: string;
    repor?: string;
    patientId?: string;
    terapeutaId?: string;
    disciplina?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  const params = await searchParams;
  const fuso = await fusoDaClinicaAtual(ctx);
  const dia = diaValidoOuHoje(params.dia, fuso);
  const hoje = hojeNaClinica(fuso);
  // #512 · T09 (P1, issue #521, opção a) — `requireAgendar` continua
  // concedendo criação de sessão a `admin_recepcao` na camada de auth (não
  // muda). O gesto de CRIAR na UI, porém, fica visível só para `coordenador`:
  // é a decisão da #517 ("recepção não agenda") preservada na prática. Antes,
  // `podeAgendar` incluía `admin_recepcao`, que via o botão "+ Agendar no
  // Calendário" e caía num 403 em `/agenda/semana` (`requireRole(ctx,
  // "coordenador")`) — um convite que a própria rota recusava.
  const podeAgendar = podeCriarSessaoEmAgenda(ctx.role);
  const podeGerir = ctx.role === "coordenador" || ctx.role === "admin_recepcao";
  const [
    sessoes,
    terapeutasRaw,
    pendentesConsolidacao,
    pendentesReposicao,
    config,
  ] = await Promise.all([
    listarSessoesDoDia(ctx, dia),
    listarTerapeutas(ctx),
    podeGerir ? pendentesDeConsolidacao(ctx) : Promise.resolve([]),
    // "Repor" é a mesma classe de gesto que "+ Agendar": pré-preenche a
    // criação de sessão em `/agenda/semana`. Segue `podeAgendar`, não
    // `podeGerir` — por isso não junta com a linha acima.
    podeAgendar ? reposicoesPendentes(ctx) : Promise.resolve([]),
    // #512 · T13 — a escala "Semana" (dentro de `AgendaViewCliente`) precisa
    // de `disciplinas`/`duracaoPadrao`, os mesmos dados que `/agenda/semana`
    // já carregava. Toda role chega a esses dados (R-29: semana é visível a
    // todo papel clínico) — só o gesto de criar fica atrás de `podeAgendar`.
    carregarConfigClinica(ctx),
  ]);
  const prefill = await carregarPrefillReposicao(ctx, params);
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
              <Link href="/agenda?escala=semana">+ Agendar no Calendário</Link>
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
        ehHoje={dia === hoje}
        visaoInicial={visaoInicial}
        fuso={fuso}
        hojeISO={hoje}
        semanaInicialISO={segundaDaSemana(hoje)}
        disciplinas={config.disciplinas}
        duracaoPadrao={config.duracaoDisciplina}
        escalaInicial={params.escala}
        prefill={prefill}
      />
    </Stack>
  );
}
