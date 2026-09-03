import type { ReactNode } from "react";
import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { TabsNav, type TabsNavItem } from "@/components/ui/tabs-nav";
import { Pill } from "@/components/ui/primitives/pill";
import { Tooltip } from "@/components/ui/tooltip";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db/rls";
import { patient } from "@/db/schema";
import { mensagemDeEstado } from "@/lib/billing/estado-conta";
import { obterSituacaoConta } from "../../queries";
import { capacidadesDaModalidade } from "./modalidade";
import { montarProntidao } from "@/lib/patient/prontidao";
import { logarAvisoSemPII } from "@/lib/observabilidade/logar-erro";
import { obterFatosProntidao } from "@/lib/patient/prontidao-queries";
import { CartaoProntidao } from "@/components/app/cartao-prontidao";

/**
 * Casca comum de TODAS as telas de um paciente.
 *
 * Duas coisas moram aqui porque não podem morar em `page.tsx`:
 *
 * **1. A situação da conta é consultada UMA vez.** Cada aba é uma rota própria
 * (`briefing`, `metas`, `horas`…). Se cada uma perguntasse "esta clínica pode
 * escrever?", seriam 7 lugares para manter em sincronia e uma consulta a mais
 * por navegação — com o risco clássico de a aba nova nascer sem o aviso e
 * mostrar formulário editável numa conta em somente-leitura. O layout do App
 * Router não remonta ao trocar de aba dentro do mesmo segmento, então o custo é
 * pago uma vez por entrada no prontuário, não por clique.
 *
 * **2. A faixa de abas.** Antes ela era markup solto dentro de `page.tsx`,
 * apontando para as rotas irmãs — o que fazia a aba sumir em todas as outras
 * telas do paciente (só a "Evolução" a mostrava) e listava 4 das 7 rotas reais.
 * Aba que só existe numa das abas é um beco sem saída de navegação.
 *
 * O aviso é `severidade="info"`, não `erro`, deliberadamente: a conta em
 * somente-leitura não é falha de quem está lendo a tela nem risco clínico, e
 * neste produto a semântica de alerta (`role="alert"`, que interrompe o leitor
 * de tela) é reservada ao risco. Ver a mesma decisão em `FaixaTrial`.
 */
interface PacienteLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default async function PacienteLayout({
  children,
  params,
}: PacienteLayoutProps) {
  const { id } = await params;
  const ctx = await getTenantContext();
  const [situacao, dadosPaciente, fatos] = await Promise.all([
    obterSituacaoConta(ctx),
    withTenant(ctx, async (tx) => {
      const [p] = await tx
        .select({ clinicalModality: patient.clinicalModality })
        .from(patient)
        .where(eq(patient.id, id));
      return p;
    }),
    // `admin_recepcao` não entra: sob a RLS dela todo EXISTS clínico devolve
    // false para linhas que existem. `montarProntidao` já devolve a escada
    // vazia para ela — não gastar a consulta é só a consequência.
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

  const base = `/pacientes/${id}`;

  // A aba clínica central troca por modalidade: cada uma tem exatamente UM
  // registro estruturado que faz sentido para o modo de tratamento —
  // pontuação de protocolo (PEI & Metas), diário de pensamentos (TCC) ou
  // registro narrativo livre (Temas). Nunca duas ao mesmo tempo: a aba errada
  // levaria o terapeuta a preencher um instrumento que o modo não usa.
  // O `switch` que ficava aqui virou `./modalidade.ts`: `page.tsx` precisa da
  // MESMA decisão para saber se a rota base redireciona, e duas cópias da
  // regra divergem no primeiro modo novo.
  const capacidades = capacidadesDaModalidade(dadosPaciente?.clinicalModality);

  // Sem aba central quando a modalidade não resolve (paciente que a RLS não
  // enxerga): array vazio em vez de lançar — ainda é preciso navegar.
  const abaModalidade: TabsNavItem[] = capacidades.abaCentral
    ? [
        {
          href: `${base}/${capacidades.abaCentral.slug}`,
          rotulo: capacidades.abaCentral.rotulo,
        },
      ]
    : [];

  // Todas as rotas irmãs que de fato existem sob `[id]/` (as que têm
  // `page.tsx`). `consentimento/` e `timeline/` são pastas de lógica sem tela
  // própria — a timeline é renderizada dentro da aba Evolução — e por isso não
  // entram aqui: aba que leva a 404 é pior que aba ausente.
  const abas: TabsNavItem[] = [
    // "Evolução" some em `conventional`: o acompanhamento desse modo é
    // narrativo, a rota base redireciona para `Temas` (ver `./page.tsx`), e
    // aba que só redireciona é aba que mente sobre existir.
    ...(capacidades.temEvolucao
      ? [{ href: base, rotulo: "Evolução", exato: true } as TabsNavItem]
      : []),
    { href: `${base}/briefing`, rotulo: "Briefing" },
    { href: `${base}/cadastro-clinico`, rotulo: "Ficha Clínica" },
    ...(capacidades.temAnamnese
      ? [{ href: `${base}/anamnese`, rotulo: "Anamnese" }]
      : []),
    ...abaModalidade,
    { href: `${base}/equipe`, rotulo: "Equipe" },
    { href: `${base}/horas`, rotulo: "Horas" },
    { href: `${base}/ausencias`, rotulo: "Ausências" },
  ];

  // Link SÓ onde ativar/reativar é de fato a saída. Em
  // `pagamento_em_processamento` já existe cobrança em voo: devolver a pessoa ao
  // checkout gera uma segunda cobrança para o mesmo mês.
  const comLinkParaAssinatura =
    situacao.estado === "trial_expirado" || situacao.estado === "cancelada";

  return (
    <Stack gap="md">
      <div className="flex flex-col gap-2">
        <TabsNav itens={abas} ariaLabel="Seções do prontuário do paciente" />
        <div className="-mt-2 flex justify-end">
          {/*
            O selo é focalizável (`tabIndex`) porque é o gatilho do tooltip:
            sem isso a explicação só existiria no hover e sumiria para teclado.
            O nome acessível vem do próprio texto visível — `aria-label` aqui
            era ignorado (ARIA proíbe nomear elemento sem role, `<span>` cru
            resolve para `generic`; axe acusa `aria-prohibited-attr`) e ainda
            criava divergência com o texto na tela (WCAG 2.5.3). O cadeado vai
            no slot `icon` com `aria-hidden` para o leitor de tela não soletrar
            "emoji de cadeado fechado" antes da frase.
          */}
          <Tooltip conteudo="Este prontuário está visível apenas para a equipe autorizada desta clínica.">
            <Pill
              variant="inset"
              colorScheme="neutral"
              className="focus-visible:outline-focus cursor-help outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]"
              tabIndex={0}
              icon={<span aria-hidden="true">🔒</span>}
            >
              Dados Criptografados (RLS Ativo)
            </Pill>
          </Tooltip>
        </div>
      </div>
      {fatos ? (
        <CartaoProntidao
          prontidao={montarProntidao({
            // Aqui a modalidade continua vindo da linha `patient`, e não da
            // `fatos.modalidade` do definer: quem alcança a página do paciente
            // passou por `patient_select` (é da equipe ou é coordenação), então
            // a leitura é legítima. Diferente dos call sites de SESSÃO
            // (`logic.ts`, `sessoes/[id]/queries.ts`), onde o chamador pode ser
            // um terapeuta de cobertura que não lê a linha `patient` nenhuma.
            modalidade: dadosPaciente?.clinicalModality,
            fatos: fatos.fatos,
            role: ctx.role,
            patientId: id,
          })}
          // Mesma chamada que a tarja abaixo faz: `mensagemDeEstado` é a fonte
          // única da razão. O cartão não escreve copy própria — se escrevesse,
          // duas frases sobre o mesmo bloqueio conviveriam na mesma tela,
          // livres para divergir na próxima mudança de política de cobrança.
          motivoSomenteLeitura={
            situacao.podeEscrever ? null : mensagemDeEstado(situacao.estado)
          }
        />
      ) : null}
      {!situacao.podeEscrever ? (
        <Alert severidade="info" destacado titulo="Conta em somente-leitura">
          <p>{mensagemDeEstado(situacao.estado)}</p>
          {comLinkParaAssinatura ? (
            <p className="mt-2">
              <Link
                href="/assinatura"
                className="font-semibold underline underline-offset-4"
              >
                Ativar assinatura
              </Link>
            </p>
          ) : null}
        </Alert>
      ) : null}
      {children}
    </Stack>
  );
}
