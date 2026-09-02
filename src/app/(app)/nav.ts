import type { NavItem } from "./app-header";

// #512 · T09 — nav por papel (R-21, R-22, R-23), extraída de `layout.tsx`
// como função PURA para ser testável sem I/O: `montarNav` só recebe o papel e
// as contagens já lidas (badges), nunca decide o que contar.

export type MontarNavInput = {
  role: string;
  /** Badge de `Sessões` — mesmo predicado/contagem de `contarTravadas`
   * (T02, R-12/R-13). Ignorado para `admin_recepcao` (R-23). */
  totalTravadas: number;
  /** #533 (`PR-01`) — badge de `Validação`: mesmo predicado da fila
   * (`contarBadgesGovernanca().validacao` = `contarFilaValidacao`). Só o
   * coordenador tem o item; os demais ignoram. */
  totalValidacao: number;
  /** #533 (`PR-02`) — badge de `Alertas de risco`: alertas `aberto`
   * (`contarBadgesGovernanca().alertasAbertos`, mesmo número do cabeçalho de
   * `/alertas-risco`). */
  totalAlertasAbertos: number;
};

export type NavPorPapel = {
  /** Menu diário — mesma estrutura para `coordenador` e `terapeuta` (R-21). */
  itemsNav: NavItem[];
  /** Administração — movida para o menu do usuário no rodapé do rail (R-22).
   * `Meu Perfil` entra aqui para TODO papel (D56, layout.tsx original). */
  itemsAdmin: NavItem[];
};

/**
 * R-21 — Agenda · Sessões(badge) · Pacientes · Relatórios, ESTRUTURA IDÊNTICA
 * para coordenador e terapeuta. O escopo (o que cada um vê dentro de cada
 * rota) é decidido pela RLS, nunca por um item de nav a mais ou a menos.
 *
 * R-23 — `admin_recepcao` não recebe `Sessões`: um badge que ela nunca zera é
 * ansiedade permanente (§3.2 do doc de UX). A nav dela é só `Agenda ·
 * Pacientes` — nada de fila clínica.
 *
 * #533 (`PR-01`/`PR-02`, auditoria 360) — a #512 tirou da nav as três
 * superfícies de governança do coordenador (Validação, Alertas de risco,
 * Supervisão) e a fila de validação por evidência ficou sem porta nenhuma.
 * Elas voltam em `itemsAdmin` (menu do usuário), NÃO no menu diário: R-21
 * continua valendo — o dia a dia do coordenador é igual ao do terapeuta; a
 * governança é o que o distingue, e mora com o resto da administração.
 * `src/app/(app)/alcance-de-rotas.test.ts` (Q-04) trava esta decisão.
 */
export function montarNav({
  role,
  totalTravadas,
  totalValidacao,
  totalAlertasAbertos,
}: MontarNavInput): NavPorPapel {
  if (role === "coordenador" || role === "terapeuta") {
    return {
      itemsNav: [
        { href: "/agenda", label: "Agenda" },
        {
          href: "/sessoes",
          label: "Sessões",
          badge: totalTravadas,
          // Fila alimentada pela extração da IA: violeta é o tom de
          // "candidato pendente de olhar clínico" (mesmo tom do antigo
          // `/validacao`). Vermelho fica reservado a alerta de risco.
          badgeTom: "ia",
        },
        { href: "/pacientes", label: "Pacientes" },
        { href: "/relatorios", label: "Relatórios" },
      ],
      // R-22 — só o coordenador administra a clínica (Equipe, Dados,
      // Exportação, Assinatura); terapeuta só tem Dúvidas + Perfil, igual à
      // nav diária de antes do #512. `Meu Perfil` é comum aos dois (D56).
      itemsAdmin:
        role === "coordenador"
          ? [
              // Governança primeiro (#533): é o que o coordenador vem fazer
              // aqui; a administração de cadastro vem depois.
              {
                href: "/validacao",
                label: "Validação",
                badge: totalValidacao,
                badgeTom: "ia",
              },
              {
                href: "/alertas-risco",
                label: "Alertas de risco",
                badge: totalAlertasAbertos,
                badgeTom: "risco",
              },
              { href: "/supervisao", label: "Supervisão" },
              { href: "/equipe", label: "Equipe" },
              { href: "/clinica/dados", label: "Dados da Clínica" },
              { href: "/clinica/exportacao", label: "Exportar Acervo" },
              { href: "/assinatura", label: "Assinatura" },
              { href: "/duvidas", label: "Dúvidas" },
              { href: "/perfil", label: "Meu Perfil" },
            ]
          : [
              { href: "/duvidas", label: "Dúvidas" },
              { href: "/perfil", label: "Meu Perfil" },
            ],
    };
  }

  // `admin_recepcao` (R-23): sem Sessões, sem administração de clínica.
  return {
    itemsNav: [
      { href: "/agenda", label: "Agenda" },
      { href: "/pacientes", label: "Pacientes" },
    ],
    itemsAdmin: [{ href: "/perfil", label: "Meu Perfil" }],
  };
}
