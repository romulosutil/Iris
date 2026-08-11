import type { Meta } from "@storybook/nextjs-vite";
import { Header, type NavItem } from "./header";

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
      <div className="p-8 text-center text-[var(--text-secondary)] font-body">
        Visualização de Header em Desktop (≥ 640px)
      </div>
    </div>
  ),
};

export const Mobile = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  render: () => (
    <div className="min-h-[500px] bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris — Matriz"
        outrasClinicas={outrasClinicasExemplo}
        onTrocarClinica={(id) => alert(`Trocar para clínica ${id}`)}
        itemsNav={itemsNavExemplo}
        onSignOut={() => alert("Sair")}
      />
      <div className="p-6 text-center text-sm text-[var(--text-secondary)] font-body">
        Visualização de Header em Celular (375px). Toque no botão hambúrguer para abrir o menu deslizante.
      </div>
    </div>
  ),
};
