import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { carregarTimeline } from "./timeline/queries";
import { TimelineClient } from "./timeline/timeline-client";
import { Stack, Cluster } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { ArquivamentoDialog } from "./arquivamento-dialog";
import { AvisosArquivamento } from "./avisos-arquivamento";
import { carregarAvisosArquivamento } from "./arquivamento-queries";
import { capacidadesDaModalidade } from "./modalidade";
import { EvolucaoTcc } from "./timeline/evolucao-tcc";
import { obterRPDEntries } from "./tcc/logic";
import { obterInstrumentoAplicacoes } from "./tcc/instrumento-logic";
import { vistaValida } from "./timeline/vista-nav";

interface PacientePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PacientePage({
  params,
  searchParams,
}: PacientePageProps) {
  const { id } = await params;
  const { vista: vistaBruta } = await searchParams;
  const vista = vistaValida(vistaBruta);
  const ctx = await getTenantContext();
  requireRole(ctx, "terapeuta", "coordenador");

  const paciente = await withTenant(ctx, async (tx) => {
    const [pac] = await tx
      .select({
        id: patient.id,
        nome: patient.nome,
        // #174: o estado de arquivamento comercial precisa ser visível aqui —
        // sem ele a única pista de que o paciente saiu da contagem de ativos
        // seria a fatura no fechamento do ciclo.
        arquivadoEm: patient.arquivadoEm,
        // A modalidade decide se esta aba existe e o que ela lê. Sem ela, a
        // rota base servia um hexágono de eixos VB-MAPP para os três modos.
        clinicalModality: patient.clinicalModality,
      })
      .from(patient)
      .where(eq(patient.id, id));

    return pac ?? null;
  });

  if (!paciente) {
    notFound();
  }

  const capacidades = capacidadesDaModalidade(paciente.clinicalModality);

  // Sai ANTES de `carregarTimeline`: em `conventional` a timeline não seria
  // usada, e a consulta custa uma varredura de snapshots por entrada no
  // prontuário. `redirect` lança — nada abaixo executa.
  if (!capacidades.temEvolucao && capacidades.rotaDeEntrada) {
    redirect(`/pacientes/${id}/${capacidades.rotaDeEntrada}`);
  }

  // Subiu para cá porque o ramo de TCC (abaixo) precisa dos avisos e sai antes
  // de `carregarTimeline`. Não depende da timeline.
  const avisos = await carregarAvisosArquivamento(ctx, id);

  // Paciente de TCC tem leitura de evolução PRÓPRIA: escore de instrumento
  // padronizado no tempo e reestruturação de crenças. Sai antes de
  // `carregarTimeline` porque a timeline é protocol-driven — os eixos que ela
  // materializa (mando, tato, ecoico) descrevem uma intervenção que este
  // paciente não recebe, e consultá-la aqui seria custo puro.
  if (capacidades.leituraDeEvolucao === "tcc") {
    const [aplicacoes, entriesRpd] = await Promise.all([
      obterInstrumentoAplicacoes(ctx, id),
      obterRPDEntries(ctx, id),
    ]);

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Stack gap="lg">
          <PageHeader
            breadcrumb={
              <Breadcrumb
                itens={[
                  { rotulo: "Pacientes", href: "/pacientes" },
                  { rotulo: paciente.nome, atual: true },
                ]}
              />
            }
            title={paciente.nome}
            badge={
              paciente.arquivadoEm ? (
                <StatusBadge variante="neutral">Arquivado</StatusBadge>
              ) : undefined
            }
            description="Evolução clínica em Terapia Cognitivo-Comportamental"
          />
          <AvisosArquivamento {...avisos} />
          <EvolucaoTcc
            aplicacoes={aplicacoes}
            entriesRpd={entriesRpd.map((e) => ({
              ...e,
              distorcoesCognitivas: e.distorcoesCognitivas as string[] | null,
            }))}
          />
        </Stack>
      </div>
    );
  }

  const timeline = await carregarTimeline(ctx, id);
  const temSnapshots = timeline && timeline.snapshots.length > 0;

  // Mesmo predicado do `requireRole` do core (`logic.ts`): mostrar o botão a
  // quem a policy `patient_update` não deixa escrever produziria um "arquivado"
  // na tela em cima de 0 linhas afetadas — RLS filtra em silêncio.
  const podeArquivar =
    ctx.role === "coordenador" || ctx.role === "admin_recepcao";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Stack gap="lg">
        {/* PageHeader Padronizado */}
        <PageHeader
          breadcrumb={
            <Breadcrumb
              itens={[
                { rotulo: "Pacientes", href: "/pacientes" },
                { rotulo: paciente.nome, atual: true },
              ]}
            />
          }
          title={paciente.nome}
          badge={
            paciente.arquivadoEm ? (
              <StatusBadge variante="neutral">Arquivado</StatusBadge>
            ) : undefined
          }
          description="Prontuário e linha do tempo de evolução clínica"
          actions={
            <Cluster gap="sm">
              {podeArquivar ? (
                <ArquivamentoDialog
                  patientId={paciente.id}
                  arquivado={!!paciente.arquivadoEm}
                />
              ) : null}
              <Link href={`/pacientes/${paciente.id}/cadastro-clinico`}>
                <Button variante="neutra" tamanho="sm">
                  Ficha Clínica
                </Button>
              </Link>
              <Link href={`/pacientes/${paciente.id}/metas`}>
                <Button variante="secundaria" tamanho="sm">
                  PEI & Metas
                </Button>
              </Link>
            </Cluster>
          }
        />

        {/* A faixa de abas vive em `layout.tsx` desde a Fatia C. Estava aqui,
            hardcoded, e por isso só existia NESTA aba: quem entrasse em
            "Briefing" ou "Horas" perdia a navegação e só voltava pelo botão do
            browser. Além disso listava 4 das 7 rotas irmãs reais. */}

        {/* #174 — o que o job de arquivamento fez sozinho com a contagem de
            ativos, dito na tela em vez de só na fatura. */}
        <AvisosArquivamento {...avisos} />

        {/* Estado Vazio ou Timeline */}
        {!temSnapshots ? (
          <div className="mx-auto my-8 max-w-2xl rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-12 text-center">
            {/* Ícone de traço em currentColor, no mesmo estilo de
                `timeline/estado-de-erro.tsx`. Emoji tem leitura imprevisível
                em leitor de tela e não herda a cor do texto. */}
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              focusable="false"
              className="mx-auto mb-4 text-[var(--text-secondary)]"
            >
              <path
                d="M3 13h5l1.5 3h5L16 13h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
              <path
                d="M3 13l3-8h12l3 8v6H3v-6z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
            <h2 className="mb-2 text-2xl font-black text-[var(--text-primary)]">
              Sem sessões registradas
            </h2>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              Este paciente ainda não possui sessões registradas. Assim que a
              primeira sessão for finalizada e consolidada, o histórico e
              timeline de evolução aparecerão aqui.
            </p>
            <Link
              href={`/agenda`}
              className="focus-visible:outline-focus inline-flex items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] px-4 py-2 text-sm font-bold text-[var(--action-primary-fg)] focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
            >
              Agendar Primeira Sessão &rarr;
            </Link>
          </div>
        ) : (
          <TimelineClient
            patientId={paciente.id}
            pacienteNome={paciente.nome}
            initialData={timeline}
            vista={vista}
          />
        )}
      </Stack>
    </div>
  );
}
