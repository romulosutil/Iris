import type { ReactNode } from "react";
import Link from "next/link";
import {
  getTenantContext,
  listarClinicasDoUsuario,
  listarPapeisNaClinicaAtiva,
} from "@/auth/tenant";
import { papelAtivo } from "@/auth/papel-ativo";
import { Container } from "@/components/ui/layout";
import { Banner } from "@/components/ui/banner";
import { FaixaTrial } from "@/components/app/faixa-trial";
import { FaixaRecusa } from "@/components/app/faixa-recusa";
import { estadoEstagio2 } from "./alertas-risco/queries";
import { contarBadgesGovernanca } from "@/lib/governanca/contadores";
import { contarTravadas } from "@/lib/sessao/fila";
import { obterSituacaoConta, obterAvisoRecusa } from "./queries";
import { SignOutButton } from "./sign-out-button";
import { AppHeader } from "./app-header";
import { montarNav } from "./nav";
import { logarAvisoSemPII } from "@/lib/observabilidade/logar-erro";

/**
 * Shell protegido com suporte responsivo a Mobile e Desktop.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  const ehClinico = ctx.role === "coordenador" || ctx.role === "terapeuta";
  const ehCoordenador = ctx.role === "coordenador";

  const [
    clinicas,
    papeisNaClinica,
    travadas,
    { quantidade: riscoEstagio2, protocoloInterno },
    situacaoConta,
    avisoRecusa,
    badgesGovernanca,
  ] = await Promise.all([
    listarClinicasDoUsuario(ctx.userId),
    // #512 · T08 (R-24) — papéis NÃO resolvidos na clínica ativa, só para o
    // shell decidir se há troca de papel disponível (combo disjunto, E6).
    // Independente de `ehClinico`: `admin_recepcao` também pode ter combo.
    listarPapeisNaClinicaAtiva(ctx.userId, ctx.clinicId),
    // #512 · T09 (R-21) — UMA leitura de contagem para o badge de `Sessões`,
    // igual para coordenador e terapeuta (mesma estrutura de nav, R-21). Sai
    // do MESMO módulo/predicado da lista de sessões travadas
    // (`src/lib/sessao/fila.ts`, T02/R-12/R-13) — não é mais o antigo
    // contador de `listarPendencias` do terapeuta, que virou nav diferente da
    // do coordenador (o próprio bug que o #512 fecha). `admin_recepcao` não
    // entra aqui: `coletarTravadas` já devolve `[]` para ela sem tocar o
    // banco (R-23), e o item `Sessões` nem existe na nav dela (`nav.ts`).
    //
    // O `.catch` de `a0e7563` sobrevive de propósito: falha transitória de
    // contagem vira badge 0, nunca `error.tsx` em toda rota do app.
    ehClinico
      ? contarTravadas(ctx).catch(() => ({ total: 0 }))
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
      // Nem `erro.message` (#531): erro de driver carrega os params da query.
      logarAvisoSemPII("[faixa-recusa] falha ao ler aviso de recusa", erro, {
        clinicId: ctx.clinicId,
      });
      return null;
    }),
    // #533 (`PR-01`/`PR-02`) — os dois badges de governança (Validação,
    // Alertas de risco) numa única ida ao banco, só para o coordenador (único
    // papel com esses itens em `nav.ts`); os outros nem tocam o banco. Sem
    // cache de propósito — o porquê está em `contarBadgesGovernanca`. Mesmo
    // `.catch` de `contarTravadas`: contagem que falha vira badge 0, nunca
    // `error.tsx` em toda rota do app por causa de um número na nav.
    ehCoordenador
      ? contarBadgesGovernanca(ctx).catch(() => ({
          validacao: 0,
          alertasAbertos: 0,
        }))
      : Promise.resolve({ validacao: 0, alertasAbertos: 0 }),
  ]);

  const totalTravadas = travadas.total;

  // #512 · T08 (R-24) — só existe troca de papel quando `papelAtivo` teria
  // pedido seleção para este conjunto (combo disjunto). Coordenador vence
  // sozinho e nunca cai aqui.
  const resolvidoPapel = papelAtivo(papeisNaClinica);
  const papeisAlternativos =
    "needsSelection" in resolvidoPapel ? resolvidoPapel.needsSelection : [];

  // #512 · T09 (R-21, R-22, R-23) — nav pura, função só de `role` + contagem
  // já lida (`nav.ts`, testado isolado). `/perfil` (D56) entra por `nav.ts`
  // em `itemsAdmin`, para TODO papel — não é mais empurrado aqui.
  const { itemsNav, itemsAdmin } = montarNav({
    role: ctx.role,
    totalTravadas,
    totalValidacao: badgesGovernanca.validacao,
    totalAlertasAbertos: badgesGovernanca.alertasAbertos,
  });

  return (
    <AppHeader
      clinicas={clinicas}
      ativaId={ctx.clinicId}
      role={ctx.role}
      papeisAlternativos={papeisAlternativos}
      itemsNav={itemsNav}
      itemsAdmin={itemsAdmin}
      signOutSlot={<SignOutButton />}
    >
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
    </AppHeader>
  );
}
