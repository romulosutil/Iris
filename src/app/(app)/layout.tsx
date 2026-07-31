import type { ReactNode } from "react";
import Link from "next/link";
import { getTenantContext, listarClinicasDoUsuario } from "@/auth/tenant";
import { Container } from "@/components/ui/layout";
import { Banner } from "@/components/ui/banner";
import { resolverDiasRestantesParaFaixa } from "@/lib/trial";
import { FaixaTrial } from "@/components/app/faixa-trial";
import { estadoEstagio2 } from "./alertas-risco/queries";
import { listarPendencias } from "./pendencias/queries";
import { obterDadosTrialDaClinica } from "./queries";
import { SignOutButton } from "./sign-out-button";
import { AppHeader, type NavItem } from "./app-header";

/**
 * Shell protegido com suporte responsivo a Mobile e Desktop.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  const clinicas = await listarClinicasDoUsuario(ctx.userId);
  const { total: totalPendencias } = await listarPendencias(ctx);
  // #122 §4.2.1, ação 1 — estágio 2 satura a clínica inteira, não só a fila de
  // quem tem acesso ao caso. Sem nome de paciente e sem categoria aqui: quem vê
  // este banner pode não ter acesso clínico ao caso (H3 aplicado à tela).
  const { quantidade: riscoEstagio2, protocoloInterno } = await estadoEstagio2(ctx);

  // Fatia A — dados de trial para exibir faixa de dias restantes
  const dadosTrial = await obterDadosTrialDaClinica(ctx);
  const diasRestantes = resolverDiasRestantesParaFaixa(dadosTrial) ?? -1;

  let itemsNav: NavItem[] = [];

  if (ctx.role === "coordenador") {
    itemsNav = [
      { href: "/validacao", label: "Central de Validação", badge: totalPendencias },
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
      { href: "/equipe", label: "Equipe" },
      { href: "/duvidas", label: "Dúvidas" },
    ];
  } else if (ctx.role === "terapeuta") {
    itemsNav = [
      { href: "/agenda", label: "Agenda do Dia" },
      { href: "/pacientes", label: "Pacientes & PEIs" },
      { href: "/pendencias", label: "Pendências", badge: totalPendencias },
      { href: "/duvidas", label: "Dúvidas" },
    ];
  } else {
    itemsNav = [
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
      { href: "/pendencias", label: "Pendências", badge: totalPendencias },
    ];
  }


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
                <p className="mt-3 font-display font-bold uppercase">
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
                <Link href="/clinica/emergencia" className="font-bold underline">
                  Cadastrar o protocolo
                </Link>
              </p>
            )}
          </Banner>
        </Container>
      ) : null}
      {diasRestantes >= 0 ? <FaixaTrial diasRestantes={diasRestantes} /> : null}
      <Container como="main" largura="md" className="flex-1 py-6 sm:py-10">
        {children}
      </Container>
    </div>
  );
}
