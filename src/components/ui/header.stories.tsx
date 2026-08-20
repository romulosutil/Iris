import type { Meta } from "@storybook/nextjs-vite";
import { Header, type NavItem } from "./header";
import { Container } from "./layout";

const meta = {
  title: "04. UI COMPONENTS/Layout/Header",
  component: Header,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Header>;

export default meta;

const itemsNavExemplo: NavItem[] = [
  { href: "#agenda", label: "Agenda", active: true },
  { href: "#pendencias", label: "Pendências", badge: 3 },
  { href: "#duvidas", label: "Dúvidas" },
  { href: "#supervisao", label: "Supervisão" },
  { href: "#equipe", label: "Equipe" },
];

const outrasClinicasExemplo = [
  { id: "c2", nome: "Filial NeuroDesenvolvimento" },
];

export const Desktop = {
  render: () => (
    <div className="min-h-[400px] bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        outrasClinicas={outrasClinicasExemplo}
        onTrocarClinica={(id) => alert(`Trocar para clínica ${id}`)}
        itemsNav={itemsNavExemplo}
        onSignOut={() => alert("Sair")}
      />
      <div className="font-body p-8 text-center text-[var(--text-secondary)]">
        Visualização de Header em Desktop (≥ 640px)
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Header com item de navegação ativo em superfície neutra elevada e borda inferior em Ouro (#F2B705).",
      },
    },
  },
};

export const DesktopUltra = {
  globals: { viewport: { value: "desktopUltra" } },
  parameters: {
    docs: {
      description: {
        story:
          '1920px. Fundo, borda e sombra sangram até as bordas do viewport; marca e controles do usuário param na coluna do `Container` (`largura="md"` → 1280px aqui). A linha tracejada marca onde o conteúdo da página começa.',
      },
    },
  },
  render: () => (
    <div className="min-h-[400px] bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        outrasClinicas={outrasClinicasExemplo}
        onTrocarClinica={(id) => alert(`Trocar para clínica ${id}`)}
        itemsNav={itemsNavExemplo}
        onSignOut={() => alert("Sair")}
      />
      <Container
        largura="md"
        className="font-body mt-6 border-2 border-dashed border-[var(--border-brutal)] py-6 text-[var(--text-primary)]"
      >
        Conteúdo da página — alinhado à mesma coluna da marca acima.
      </Container>
    </div>
  ),
};

export const Mobile = {
  globals: { viewport: { value: "terapeuta" } },
  render: () => (
    <div className="min-h-[500px] bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        outrasClinicas={outrasClinicasExemplo}
        onTrocarClinica={(id) => alert(`Trocar para clínica ${id}`)}
        itemsNav={itemsNavExemplo}
        onSignOut={() => alert("Sair")}
      />
      <div className="font-body p-6 text-center text-sm text-[var(--text-secondary)]">
        Visualização de Header em Celular (375px). Toque no botão hambúrguer
        para abrir o menu deslizante.
      </div>
    </div>
  ),
};
