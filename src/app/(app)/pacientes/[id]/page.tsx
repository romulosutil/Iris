import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/auth/tenant";
import { requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { carregarTimeline, carregarRotinas } from "./timeline/queries";
import { TimelineClient } from "./timeline/timeline-client";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AvisosArquivamento } from "./avisos-arquivamento";
import { carregarAvisosArquivamento } from "./arquivamento-queries";
import { capacidadesDaModalidade } from "./modalidade";
import { EvolucaoTcc } from "./timeline/evolucao-tcc";
import { obterRPDEntries } from "./tcc/logic";
import { obterInstrumentoAplicacoes } from "./tcc/instrumento-logic";
import { vistaValida } from "./timeline/vista-nav";
import { montarProntidao } from "@/lib/patient/prontidao";
import { logarAvisoSemPII } from "@/lib/observabilidade/logar-erro";
import { obterFatosProntidao } from "@/lib/patient/prontidao-queries";
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
        // D65: `arquivadoEm`/`altaEm` NÃO são lidos aqui. O estado de ciclo de
        // vida e as ações que o mudam vivem em `layout.tsx` desde o D65 — a
        // única casca comum às três modalidades. Reler as colunas nesta página
        // seria uma segunda fonte para o mesmo fato, livre para divergir.
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
          // §7 da spec: log por `logarErroSemPII`/`logarAvisoSemPII`, não por
          // template montado à mão. O helper (`@/lib/observabilidade/logar-erro`)
          // já emite o conjunto FECHADO — `nome`, `codigo` (via `codigoPg`,
          // que lê raiz e `.cause`, porque a posição do SQLSTATE depende de
          // quem lançou), `constraint`, `hashMensagem`, `correlacaoId` — e não
          // tem caminho de dado da `message` para a saída. O template à mão
          // tinha: bastava alguém trocar `erro.name` por `erro` num apuro e o
          // SQL com os `params` (nota clínica inteira, numa escrita do diário)
          // iria para o stdout do container.
          //
          // `warn`, não `error`: aqui a falha DEGRADA uma faixa informativa —
          // o cartão da prontidão some e a aba do paciente segue útil. Nível é
          // sinal para quem lê o log, e `error` num cartão que não renderizou
          // gasta atenção de plantão que outra coisa vai precisar.
          //
          // Só chega aqui SQLSTATE que não é de guarda: `IR001`/`IR002` já
          // viraram `null` dentro de `obterFatosProntidao` (migração `0152`).
          // Isto é falha REAL de leitura.
          logarAvisoSemPII("[prontidao] falha ao ler fatos", erro, {
            patientId: id,
          });
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

  // #558 · T5 — leitura SEPARADA da timeline, e com falha separada: se a
  // consulta de rotinas cair, o resto da aba continua servindo. `null` viaja
  // até o bloco como "não sabemos" e vira estado de ERRO lá (R4.3); colapsar
  // em `[]` aqui faria uma oscilação de rede afirmar que o paciente não tem
  // rotina registrada — afirmação clínica falsa.
  const rotinas = temSnapshots
    ? await carregarRotinas(ctx, id).catch((erro: unknown) => {
        // Sem `console.*` com `message` de driver (R4.4): o helper emite o
        // conjunto FECHADO (`nome`, código PG, constraint, hash, correlação).
        // `warn`, não `error`: degrada UM bloco, a aba segue útil.
        logarAvisoSemPII("[rotinas] falha ao ler cadeias", erro, {
          patientId: id,
        });
        return null;
      })
    : [];

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
          description="Prontuário e linha do tempo de evolução clínica"
        />

        {/* A faixa de abas vive em `layout.tsx` desde a Fatia C. Estava aqui,
            hardcoded, e por isso só existia NESTA aba: quem entrasse em
            "Briefing" ou "Horas" perdia a navegação e só voltava pelo botão do
            browser. Além disso listava 4 das 7 rotas irmãs reais.

            #619 — os botões "Ficha Clínica" e "PEI & Metas" no `actions` acima
            eram a mesma duplicação: hardcoded aqui, sem gate por modalidade
            (linkavam `/metas` mesmo para paciente TCC/convencional), enquanto
            `layout.tsx` já resolve a aba central certa via
            `capacidadesDaModalidade`. Removidos — a faixa de abas abaixo é a
            única fonte de navegação. */}

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
            rotinas={rotinas}
            papel={ctx.role}
          />
        )}
      </Stack>
    </div>
  );
}
