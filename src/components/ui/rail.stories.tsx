import type { Meta } from "@storybook/nextjs-vite";
import { Rail } from "./rail";
import type { NavItem } from "./header";

const meta = {
  title: "04. UI COMPONENTS/Layout/Rail",
  component: Rail,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Rail>;

export default meta;

/**
 * Os `href` são os REAIS: é por eles que `nav-icon.tsx` resolve o ícone. Uma
 * story com `#agenda` mostraria o monograma de fallback e não o produto.
 */
const itemsNav: NavItem[] = [
  { href: "/agenda", label: "Agenda", active: true },
  { href: "/sessoes", label: "Sessões", badge: 4, badgeTom: "ia" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/relatorios", label: "Relatórios" },
];

const itemsAdmin: NavItem[] = [
  { href: "/validacao", label: "Validação", badge: 12, badgeTom: "ia" },
  {
    href: "/alertas-risco",
    label: "Alertas de risco",
    badge: 1,
    badgeTom: "risco",
  },
  { href: "/supervisao", label: "Supervisão" },
  { href: "/equipe", label: "Equipe" },
  { href: "/clinica/dados", label: "Dados da Clínica" },
  { href: "/clinica/marca", label: "Marca nos PDFs" },
  { href: "/clinica/exportacao", label: "Exportar Acervo" },
  { href: "/assinatura", label: "Assinatura" },
  { href: "/duvidas", label: "Dúvidas" },
  { href: "/perfil", label: "Meu Perfil" },
];

/** O rail é `fixed`; a moldura só dá fundo e altura para vê-lo isolado. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[560px] bg-[var(--bg-app)]">{children}</div>
  );
}

export const Expandido = {
  name: "Expandido (236px)",
  parameters: {
    docs: {
      description: {
        story:
          "Ícone + rótulo. O ícone é `aria-hidden`: quem nomeia o destino continua sendo o texto (R-26). A forma serve para achar o destino sem ler — o terapeuta escaneia em pé, entre sessões.",
      },
    },
  },
  render: () => (
    <Moldura>
      <Rail itemsNav={itemsNav} itemsAdmin={itemsAdmin} colapsado={false} />
    </Moldura>
  ),
};

export const Colapsado = {
  name: "Colapsado (68px)",
  parameters: {
    docs: {
      description: {
        story:
          "Sem rótulo visível, o ícone é a única marca na tela — e é exatamente por isso que ele NÃO carrega o significado: o `aria-label` e o `title` do link levam o nome completo. O badge migra para o canto do ícone, nunca some.",
      },
    },
  },
  render: () => (
    <Moldura>
      <Rail itemsNav={itemsNav} itemsAdmin={itemsAdmin} colapsado />
    </Moldura>
  ),
};

export const RotaSemIcone = {
  name: "Fallback — rota fora do mapa",
  parameters: {
    docs: {
      description: {
        story:
          "Destino novo que ainda não entrou em `nav-icon.tsx`: cai no monograma de duas letras, ocupa o mesmo slot de 28px e continua navegável. Degradação, não buraco.",
      },
    },
  },
  render: () => (
    <Moldura>
      <Rail
        itemsNav={[
          ...itemsNav,
          { href: "/superficie-nova", label: "Superfície Nova" },
        ]}
        colapsado={false}
      />
    </Moldura>
  ),
};
