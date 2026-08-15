import type { ReactNode } from "react";
import Link from "next/link";
import { getTenantContext } from "@/auth/tenant";
import { Stack } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { TabsNav, type TabsNavItem } from "@/components/ui/tabs-nav";
import { Pill } from "@/components/ui/primitives/pill";
import { Tooltip } from "@/components/ui/tooltip";
import { mensagemDeEstado } from "@/lib/billing/estado-conta";
import { obterSituacaoConta } from "../../queries";

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
  const situacao = await obterSituacaoConta(ctx);

  const base = `/pacientes/${id}`;
  // Todas as rotas irmãs que de fato existem sob `[id]/` (as que têm
  // `page.tsx`). `consentimento/` e `timeline/` são pastas de lógica sem tela
  // própria — a timeline é renderizada dentro da aba Evolução — e por isso não
  // entram aqui: aba que leva a 404 é pior que aba ausente.
  const abas: TabsNavItem[] = [
    { href: base, rotulo: "Evolução", exato: true },
    { href: `${base}/briefing`, rotulo: "Briefing" },
    { href: `${base}/cadastro-clinico`, rotulo: "Ficha Clínica" },
    { href: `${base}/metas`, rotulo: "PEI & Metas" },
    { href: `${base}/tcc`, rotulo: "TCC" },
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
      {!situacao.podeEscrever ? (
        <Alert severidade="info" destacado titulo="Conta em somente-leitura">
          <p>{mensagemDeEstado(situacao.estado, situacao.debitoCentavos)}</p>
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
