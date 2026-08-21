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
  { href: "#pendencias", label: "Pendências", badge: 3, badgeTom: "ia" },
  { href: "#duvidas", label: "Dúvidas" },
  { href: "#supervisao", label: "Supervisão" },
  { href: "#equipe", label: "Equipe" },
];

/** Carga real do coordenador: 7 destinos + contagem. É o caso que quebrava. */
const itemsNavCoordenador: NavItem[] = [
  {
    href: "#validacao",
    label: "Central de Validação",
    badge: 12,
    badgeTom: "ia",
  },
  { href: "#agenda", label: "Agenda" },
  { href: "#pacientes", label: "Pacientes", active: true },
  { href: "#equipe", label: "Equipe" },
  { href: "#relatorios", label: "Relatórios" },
  { href: "#clinica", label: "Dados da Clínica" },
  { href: "#duvidas", label: "Dúvidas" },
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
          "Duas faixas: identidade (marca + clínica ativa à esquerda, usuário + Sair à direita) e navegação em linha própria. O item ativo lê como fato consolidado — preenche em tinta de marca, ganha borda contínua e LEVANTA (`--elevation-1`).",
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
          '1920px. Fundo, borda e sombra sangram até as bordas do viewport; marca, conta e navegação param na mesma coluna do `Container` (`largura="md"` → 1280px aqui). A linha tracejada marca onde o conteúdo da página começa.',
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

export const CoordenadorCargaCheia = {
  parameters: {
    docs: {
      description: {
        story:
          'Os 7 destinos do coordenador com contagem na Central de Validação. Numa faixa única eles disputavam a linha com a marca e o botão Sair, e o `flex-wrap` empurrava Sair e o nome da clínica para uma segunda linha órfã. Com a navegação em faixa própria a linha inteira do container fica disponível — nada é escondido atrás de um menu "Mais", que é o oposto da densidade que o perfil pede.',
      },
    },
  },
  render: () => (
    <div className="min-h-[400px] bg-[var(--bg-app)]">
      <Header
        clinicaAtivaNome="Clínica Iris - Desenvolvimento Infantil"
        itemsNav={itemsNavCoordenador}
        usuarioNome="Rômulo Sutil"
        onSignOut={() => alert("Sair")}
      />
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
