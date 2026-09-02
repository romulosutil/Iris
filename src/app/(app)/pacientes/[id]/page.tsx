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
import { AltaDialog } from "./alta-dialog";
import { AvisosArquivamento } from "./avisos-arquivamento";
import { carregarAvisosArquivamento } from "./arquivamento-queries";
import { capacidadesDaModalidade } from "./modalidade";
import { EvolucaoTcc } from "./timeline/evolucao-tcc";
import { obterRPDEntries } from "./tcc/logic";
import { obterInstrumentoAplicacoes } from "./tcc/instrumento-logic";
import { vistaValida } from "./timeline/vista-nav";
import { montarProntidao } from "@/lib/patient/prontidao";
import { obterFatosProntidao } from "./prontidao-queries";
import { EvolucaoVazia } from "./evolucao-vazia";

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
        // #352: a alta clínica é o que abre o relógio de retenção do
        // prontuário. Sem ela na tela, o coordenador não sabe se o prazo de
        // guarda já está correndo — e não tinha como iniciá-lo.
        altaEm: patient.altaEm,
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

  // #352 — alta é `coordenador`-only, e o predicado é mais estrito que o do
  // arquivamento (que a recepção também faz): alta abre o prazo legal de guarda
  // e, no fim dele, a eliminação definitiva do prontuário. Mostrar o botão a
  // quem `requireRole` recusa produziria um erro no submit, não uma recusa
  // legível.
  const podeRegistrarAlta = ctx.role === "coordenador";

  // Sai ANTES de `carregarTimeline`: em `conventional` a timeline não seria
  // usada, e a consulta custa uma varredura de snapshots por entrada no
  // prontuário. `redirect` lança — nada abaixo executa.
  if (!capacidades.temEvolucao && capacidades.rotaDeEntrada) {
    redirect(`/pacientes/${id}/${capacidades.rotaDeEntrada}`);
  }

  // Subiu para cá porque o ramo de TCC (abaixo) precisa dos avisos e sai antes
  // de `carregarTimeline`. Não depende da timeline. `fatos` viaja junto num
  // `Promise.all` só para não serializar duas idas independentes ao banco —
  // mesmo raciocínio de `layout.tsx`. `requireRole` (linha 38) já restringiu
  // `ctx.role` a {coordenador, terapeuta}; o guard abaixo é o mesmo de
  // `layout.tsx` (que atende `admin_recepcao` também) por paridade — aqui
  // sempre cai no `true`, mas divergir do padrão custaria mais do que segue.
  const [avisos, fatos] = await Promise.all([
    carregarAvisosArquivamento(ctx, id),
    ctx.role === "coordenador" || ctx.role === "terapeuta"
      ? obterFatosProntidao(ctx, id).catch((erro: unknown) => {
          // NUNCA `erro.message`: em `DrizzleQueryError` a `message` é o SQL
          // inteiro com os `params` interpolados. `name` + código do Postgres
          // localiza o caso sem despejar consulta no log.
          const codigo =
            erro && typeof erro === "object" && "cause" in erro
              ? ((erro.cause as { code?: string })?.code ?? "sem-codigo")
              : "sem-codigo";
          console.warn(
            `[prontidao] falha ao ler fatos (patientId=${id}, erro=${
              erro instanceof Error ? erro.name : "desconhecido"
            }, pg=${codigo})`,
          );
          return null;
        })
      : Promise.resolve(null),
  ]);

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
            actions={
              podeRegistrarAlta ? (
                <AltaDialog
                  patientId={paciente.id}
                  comAlta={!!paciente.altaEm}
                />
              ) : undefined
            }
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
              {podeRegistrarAlta ? (
                <AltaDialog
                  patientId={paciente.id}
                  comAlta={!!paciente.altaEm}
                />
              ) : null}
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
          // `fatos === null` é falha de leitura (não "sem dado"): nesse caso
          // não afirma nada — nem "falta meta" nem "está pronto" seria
          // verdade garantida, e as duas mentem sob o mesmo risco que motivou
          // esta troca. Nada na tela é o único estado honesto.
          fatos ? (
            <EvolucaoVazia
              prontidao={montarProntidao({
                // Modalidade da linha `patient`, não a do definer — mesmo
                // motivo de `layout.tsx`: quem chega nesta página já passou
                // por `patient_select`. Só os call sites de SESSÃO precisam da
                // modalidade que sai por `app_fatos_prontidao`.
                modalidade: paciente.clinicalModality,
                fatos: fatos.fatos,
                role: ctx.role,
                patientId: id,
              })}
            />
          ) : null
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
