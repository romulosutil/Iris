import * as React from "react";
import {
  AlertTriangleIcon,
  BuildingIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  HelpCircleIcon,
  IdBadgeIcon,
  ImageIcon,
  NotebookIcon,
  UserIcon,
  UsersIcon,
  type IconProps,
} from "@/components/ui/icon";

/**
 * Ícone de cada destino da navegação, resolvido pelo `href`.
 *
 * Por que pelo `href` e não por um campo `icone` no `NavItem`: `montarNav`
 * (`src/app/(app)/nav.ts`) é uma função PURA em `.ts`, testada sem React —
 * é ela que decide QUAIS destinos cada papel enxerga (R-21/R-22/R-23), e
 * enfiar um componente React ali obrigaria a virar `.tsx` e a levar JSX para
 * dentro de uma decisão de autorização. A rota é o identificador estável que
 * as duas camadas já compartilham.
 *
 * Modo de falha escolhido: rota desconhecida renderiza o `fallback` de quem
 * chamou (o monograma de 2 letras que já existia no rail, ou um espaçador
 * vazio). Um destino novo nunca some da navegação por falta de ícone — no
 * pior caso ele volta a se parecer com o rail de antes desta mudança.
 *
 * R-26 — o ícone NUNCA é o portador de significado. Ele entra `aria-hidden`
 * ao lado do rótulo visível (rail expandido, BottomNav, Drawer) ou do
 * `aria-label`/`title` do link (rail colapsado).
 */
const ICONE_POR_ROTA: Record<string, React.ComponentType<IconProps>> = {
  // Menu diário (R-21).
  "/agenda": CalendarIcon,
  "/sessoes": NotebookIcon,
  "/pacientes": UsersIcon,
  "/relatorios": FileTextIcon,
  // Governança do coordenador (#533).
  "/validacao": ClipboardCheckIcon,
  "/alertas-risco": AlertTriangleIcon,
  "/supervisao": EyeIcon,
  // Administração da clínica (R-22).
  "/equipe": IdBadgeIcon,
  "/clinica/dados": BuildingIcon,
  "/clinica/marca": ImageIcon,
  "/clinica/exportacao": DownloadIcon,
  "/assinatura": CreditCardIcon,
  "/duvidas": HelpCircleIcon,
  "/perfil": UserIcon,
};

/**
 * Resolve o componente de ícone de um `href` de navegação, ou `null`.
 *
 * Casa do mais específico para o mais genérico depois de descartar query e
 * hash: `/agenda?escala=semana` e `/pacientes/abc/timeline` continuam
 * resolvendo para Agenda e Pacientes. Sem isso, um item de nav que ganhasse
 * um parâmetro (a Agenda já tem `?escala=`) perderia o ícone em silêncio.
 *
 * Interno de propósito: quem consome renderiza `<IconeDaRota>` e pergunta
 * `temIconeDeRota` — devolver o COMPONENTE para fora espalharia tags JSX
 * dinâmicas pelo app, que é exatamente o que o `react-hooks/static-components`
 * proíbe (e o que a suppression abaixo concentra num lugar só).
 */
function resolver(href: string): React.ComponentType<IconProps> | null {
  const caminho = href.split(/[?#]/)[0] ?? "";
  if (!caminho.startsWith("/")) return null;

  const segmentos = caminho.replace(/\/+$/, "").split("/").filter(Boolean);
  for (let corte = segmentos.length; corte > 0; corte -= 1) {
    const candidato = "/" + segmentos.slice(0, corte).join("/");
    const Icone = ICONE_POR_ROTA[candidato];
    if (Icone) return Icone;
  }
  return null;
}

/** Há ícone mapeado para esta rota? Use quando o call-site precisa ESCOLHER
 * o que desenhar no lugar (o rail troca por monograma, e não por vazio). */
export function temIconeDeRota(href: string): boolean {
  return resolver(href) !== null;
}

export interface IconeDaRotaProps {
  href: string;
  size?: number;
  className?: string;
  /** O que desenhar quando a rota não tem ícone. Sem isto, um destino novo
   * abriria um buraco na coluna e desalinharia os rótulos vizinhos. */
  fallback?: React.ReactNode;
}

/**
 * Ícone do destino, pronto para renderizar. Único ponto do app que monta uma
 * tag JSX a partir de um componente resolvido em tempo de execução.
 *
 * `react-hooks/static-components` existe para impedir componente DEFINIDO
 * dentro do render (que perderia estado a cada ciclo). Aqui os componentes
 * são todos declarados no topo de `icon.tsx`, são funções puras de SVG sem
 * estado nem hooks, e o mapa é uma constante de módulo — a análise estática é
 * que não enxerga através do índice. A suppression fica NESTE arquivo, uma
 * vez, em vez de se repetir em cada consumidor.
 */
export function IconeDaRota({
  href,
  size = 20,
  className,
  fallback = null,
}: IconeDaRotaProps) {
  const Icone = resolver(href);
  if (!Icone) return <>{fallback}</>;
  return (
    // eslint-disable-next-line react-hooks/static-components -- componente vem de constante de módulo (ICONE_POR_ROTA), não é criado no render.
    <Icone size={size} aria-hidden focusable="false" className={className} />
  );
}
