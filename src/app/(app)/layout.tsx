import type { ReactNode } from "react";
import Link from "next/link";
import { getTenantContext, listarClinicasDoUsuario } from "@/auth/tenant";
import { Container } from "@/components/ui/layout";
import { Banner } from "@/components/ui/banner";
import { FaixaTrial } from "@/components/app/faixa-trial";
import { FaixaRecusa } from "@/components/app/faixa-recusa";
import { estadoEstagio2 } from "./alertas-risco/queries";
import { listarPendencias } from "./pendencias/queries";
import { contarFilaValidacao } from "./validacao/queries";
import { obterSituacaoConta, obterAvisoRecusa } from "./queries";
import { SignOutButton } from "./sign-out-button";
import { AppHeader, type NavItem } from "./app-header";

/**
 * Shell protegido com suporte responsivo a Mobile e Desktop.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  const ehClinico = ctx.role === "coordenador" || ctx.role === "terapeuta";

  const ehCoordenador = ctx.role === "coordenador";

  const [
    clinicas,
    pendencias,
    filaValidacao,
    { quantidade: riscoEstagio2, protocoloInterno },
    situacaoConta,
    avisoRecusa,
  ] = await Promise.all([
    listarClinicasDoUsuario(ctx.userId),
    ehClinico ? listarPendencias(ctx) : Promise.resolve({ total: 0 }),
    ehCoordenador
      ? contarFilaValidacao(ctx).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    // #122 §4.2.1, ação 1 — estágio 2 satura a clínica inteira, não só a fila de
    // quem tem acesso ao caso. Sem nome de paciente e sem categoria aqui: quem vê
    // este banner pode não ter acesso clínico ao caso (H3 aplicado à tela).
    estadoEstagio2(ctx),
    // Situação da conta: é ela — e não mais só o relógio de trial — que decide o
    // que a faixa mostra. Assinante pagante e trial vencido eram indistinguíveis
    // enquanto `resolverFaixaTrial` decidia sozinho (#163).
    obterSituacaoConta(ctx),
    // D36 — a recusa deixa de morrer no log. Em paralelo com as demais: é uma
    // consulta a mais no mesmo request, não uma ida em série.
    //
    // I2 — achado da revisão de branch: sem `.catch`, qualquer rejeição aqui
    // derrubava o `Promise.all` inteiro e, com ele, `AppLayout` — toda rota do
    // app virava `error.tsx` por causa de uma faixa puramente informativa.
    // Esta leitura falha FECHADA (vira `null`, `FaixaRecusa` já trata) porque
    // ela é só um aviso a mais; diferente de `obterSituacaoConta`, cujo
    // resultado decide se a assinatura pode cadastrar paciente — essa não pode
    // engolir erro sem quebrar uma regra de negócio.
    obterAvisoRecusa(ctx).catch((erro: unknown) => {
      // Sem PII: nada de nome de clínica nem dado de paciente. `clinicId` é
      // aceitável — é o suficiente para localizar o caso sem expor conteúdo.
      console.warn(
        `[faixa-recusa] falha ao ler aviso de recusa (clinicId=${ctx.clinicId}):`,
        erro instanceof Error ? erro.message : String(erro),
      );
      return null;
    }),
  ]);

  const totalPendencias = pendencias.total;
  const totalFilaValidacao = filaValidacao.total;

  let itemsNav: NavItem[] = [];

  if (ctx.role === "coordenador") {
    itemsNav = [
      {
        href: "/validacao",
        label: "Central de Validação",
        labelCurto: "Validação",
        badge: totalFilaValidacao,
        // Fila alimentada pela extração da IA: violeta é o tom de "candidato
        // pendente de olhar clínico". Vermelho fica reservado a alerta de risco.
        badgeTom: "ia",
      },
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
      { href: "/equipe", label: "Equipe" },
      { href: "/relatorios", label: "Relatórios" },
      { href: "/clinica/dados", label: "Dados da Clínica" },
      { href: "/clinica/exportacao", label: "Exportar Acervo" },
      { href: "/duvidas", label: "Dúvidas" },
    ];
  } else if (ctx.role === "terapeuta") {
    itemsNav = [
      { href: "/agenda", label: "Agenda do Dia", labelCurto: "Agenda" },
      {
        href: "/pacientes",
        label: "Pacientes & PEIs",
        labelCurto: "Pacientes",
      },
      {
        href: "/pendencias",
        label: "Pendências",
        badge: totalPendencias,
        badgeTom: "ia",
      },
      { href: "/relatorios", label: "Relatórios" },
      { href: "/duvidas", label: "Dúvidas" },
    ];
  } else {
    itemsNav = [
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
    ];
  }

  // D56 — `/perfil` vale para TODO papel autenticado, não só clínico: a
  // declaração de e-Psi (Res. CFP 009/2024) é sobre o cadastro da própria
  // pessoa. Fica fora do if/else de propósito, para que um papel novo não
  // nasça sem acesso ao próprio perfil.
  itemsNav.push({ href: "/perfil", label: "Meu Perfil" });

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-app)]">
      <AppHeader
        clinicas={clinicas}
        ativaId={ctx.clinicId}
        role={ctx.role}
        itemsNav={itemsNav}
        signOutSlot={<SignOutButton />}
      />
      {riscoEstagio2 > 0 ? (
        <Container largura="md" className="pt-4">
          <Banner variant="alerta" titulo="Alerta de risco sem reconhecimento">
            <p>
              {riscoEstagio2 === 1
                ? "Há 1 alerta de risco desta clínica sem reconhecimento além do segundo prazo de notificação e escalonamento interno."
                : `Há ${riscoEstagio2} alertas de risco desta clínica sem reconhecimento além do segundo prazo de notificação e escalonamento interno.`}{" "}
              <Link href="/alertas-risco" className="font-bold underline">
                Abrir a fila de alertas de risco
              </Link>
            </p>
            {protocoloInterno ? (
              <>
                <p className="font-display mt-3 font-bold uppercase">
                  Protocolo de Emergência Interno da clínica
                </p>
                {/* Texto DA CLÍNICA, exibido como está: o Iris mostra o
                    protocolo da clínica e nunca propõe conduta própria. */}
                <p className="whitespace-pre-wrap">{protocoloInterno}</p>
              </>
            ) : (
              <p className="mt-3">
                Esta clínica ainda não cadastrou seu Protocolo de Emergência
                Interno.{" "}
                <Link
                  href="/clinica/emergencia"
                  className="font-bold underline"
                >
                  Cadastrar o protocolo
                </Link>
              </p>
            )}
          </Banner>
        </Container>
      ) : null}
      <FaixaRecusa aviso={avisoRecusa} />
      <FaixaTrial
        estado={situacaoConta.estado}
        diasRestantes={situacaoConta.diasRestantesTrial}
        debitoCentavos={situacaoConta.debitoCentavos}
      />
      {/*
        O `pb` inferior reserva a altura da BottomNav (#185): ~56px de barra +
        a safe-area do aparelho. Sem isso, o último botão de cada tela (salvar
        diário, confirmar validação) fica embaixo da barra — invisível e
        inclicável, e nenhum teste de componente pega, porque o jsdom não
        conhece `position: fixed`.
      */}
      <Container
        como="main"
        largura="md"
        className="flex-1 py-6 pb-[calc(56px+env(safe-area-inset-bottom)+1.5rem)] sm:py-10 sm:pb-10"
      >
        {children}
      </Container>
    </div>
  );
}
