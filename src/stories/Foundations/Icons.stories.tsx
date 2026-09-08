import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";
import {
  SparkleIcon,
  CheckIcon,
  LayersIcon,
  UndoIcon,
  PencilIcon,
  DiscardIcon,
  ClockIcon,
  ChevronDownIcon,
  CloseIcon,
  AlertTriangleIcon,
  BuildingIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  HelpCircleIcon,
  IdBadgeIcon,
  ImageIcon,
  LogOutIcon,
  MenuIcon,
  NotebookIcon,
  SlidersIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
  IconProps,
} from "@/components/ui/icon";

const meta = {
  title: "02. FOUNDATIONS/Icons",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type IconItem = {
  name: string;
  source: string; // Ex: StatusBadge, Alert, etc.
  Icon: React.ComponentType<IconProps>;
  description: string;
};

const ICONS: IconItem[] = [
  {
    name: "Sparkle",
    source: "StatusBadge (Sugerida)",
    description:
      "Representa sugestão da Inteligência Artificial. Indica dados que ainda não foram revisados ou confirmados por humanos.",
    Icon: SparkleIcon,
  },
  {
    name: "Check",
    source: "StatusBadge (Aprovada) / Button",
    description:
      "Confirmação de que o dado clínico foi validado pelo terapeuta ou ação de sucesso.",
    Icon: CheckIcon,
  },
  {
    name: "Layers",
    source: "StatusBadge (Reclassificada)",
    description:
      "Indica dados com versões sobrepostas ou modificação de categoria/metas.",
    Icon: LayersIcon,
  },
  {
    name: "Undo / Return",
    source: "StatusBadge (Devolvida)",
    description:
      "Ação de devolução, retorno ou desfazer. Usado quando o coordenador devolve a ficha para ajustes do terapeuta.",
    Icon: UndoIcon,
  },
  {
    name: "Pencil / Edit",
    source: "StatusBadge (Editada)",
    description:
      "Edição de dado. Indica que o terapeuta ajustou a transcrição sugerida pela IA.",
    Icon: PencilIcon,
  },
  {
    name: "Discard / Slash",
    source: "StatusBadge (Descartada)",
    description:
      "Descarte ou invalidação de um dado/sugestão. Representa que a informação foi desconsiderada.",
    Icon: DiscardIcon,
  },
  {
    name: "Clock / Pending",
    source: "StatusBadge (Pendente)",
    description:
      "Indica estado de carregamento ou pendência em fila de processamento da IA.",
    Icon: ClockIcon,
  },
  {
    name: "Chevron Down",
    source: "Accordion / Select",
    description:
      "Indica que o controle de UI (dropdown, accordion, etc.) é expansível para baixo.",
    Icon: ChevronDownIcon,
  },
  {
    name: "Close / Remove",
    source: "Dialog (Close) / Chip (Dismiss)",
    description: "Fecha um modal/dialog ou remove um chip do grupo ativo.",
    Icon: CloseIcon,
  },
];

/**
 * Iconografia de NAVEGAÇÃO e AÇÃO. Separada da lista acima de propósito: os
 * ícones de estado descrevem o que aconteceu com um dado (sugerido, validado,
 * devolvido); estes descrevem para ONDE se vai ou o que se vai FAZER. Confundir
 * as duas famílias é como o produto acaba com dois "check" querendo dizer
 * coisas diferentes na mesma tela.
 *
 * Resolvidos pelo `href` em `src/components/ui/nav-icon.tsx` — o rail, a
 * `BottomNav` e o Drawer mobile leem do MESMO mapa, então um destino tem uma
 * única forma no produto inteiro.
 */
const NAV_ICONS: IconItem[] = [
  {
    name: "Calendar",
    source: "Rail / BottomNav — /agenda",
    description:
      "Agenda do dia. O ponto marca o dia corrente e distingue do ícone de AÇÃO de agendar.",
    Icon: CalendarIcon,
  },
  {
    name: "Notebook",
    source: "Rail / BottomNav — /sessoes",
    description:
      "Sessões. Caderno é o que se ESCREVE (registro clínico), em oposição à folha entregue de Relatórios.",
    Icon: NotebookIcon,
  },
  {
    name: "Users",
    source: "Rail / BottomNav — /pacientes",
    description: "Pacientes — quem é atendido na clínica.",
    Icon: UsersIcon,
  },
  {
    name: "File Text",
    source: "Rail / BottomNav — /relatorios",
    description:
      "Relatórios (família e convênio). Folha com canto dobrado: documento que sai da clínica.",
    Icon: FileTextIcon,
  },
  {
    name: "Clipboard Check",
    source: "Menu do usuário — /validacao",
    description:
      "Fila de validação do coordenador. Reaproveita o gesto do Check dentro do suporte da fila.",
    Icon: ClipboardCheckIcon,
  },
  {
    name: "Alert Triangle",
    source: "StatusBadge / Menu do usuário — /alertas-risco",
    description:
      "Alerta de risco. Único destino que compartilha ícone com a família de estado — é o mesmo significado.",
    Icon: AlertTriangleIcon,
  },
  {
    name: "Eye",
    source: "Menu do usuário — /supervisao",
    description: "Supervisão — observação do trabalho da equipe.",
    Icon: EyeIcon,
  },
  {
    name: "Id Badge",
    source: "Menu do usuário — /equipe",
    description:
      "Equipe — quem TRABALHA na clínica. Crachá separa do grupo de pacientes (Users).",
    Icon: IdBadgeIcon,
  },
  {
    name: "Building",
    source: "Menu do usuário — /clinica/dados",
    description:
      "Dados da Clínica. Prédio, não engrenagem: é a identidade da clínica, não preferência de app.",
    Icon: BuildingIcon,
  },
  {
    name: "Image",
    source: "Menu do usuário — /clinica/marca",
    description:
      "Marca nos PDFs (#258). Moldura de imagem: o que a tela recebe é o ARQUIVO do logotipo, não uma paleta de cores.",
    Icon: ImageIcon,
  },
  {
    name: "Download",
    source: "Menu do usuário — /clinica/exportacao",
    description: "Exportar Acervo — saída de dados do tenant.",
    Icon: DownloadIcon,
  },
  {
    name: "Credit Card",
    source: "Menu do usuário — /assinatura",
    description: "Assinatura — o plano cobrado, não a rubrica de documento.",
    Icon: CreditCardIcon,
  },
  {
    name: "Help Circle",
    source: "Menu do usuário — /duvidas",
    description: "Dúvidas — ajuda e suporte.",
    Icon: HelpCircleIcon,
  },
  {
    name: "User",
    source: "Menu do usuário — /perfil",
    description: "Meu Perfil — a pessoa logada, no singular.",
    Icon: UserIcon,
  },
  {
    name: "Sliders",
    source: "Rail (gatilho do menu do usuário)",
    description:
      "Administração. Dois cursores em vez de engrenagem: os dentes somem no traço de 1.8 a 16px.",
    Icon: SlidersIcon,
  },
  {
    name: "Menu",
    source: "BottomNav (abre o Drawer)",
    description:
      "Acesso aos destinos que não cabem nos 4 slots da barra inferior.",
    Icon: MenuIcon,
  },
  {
    name: "Calendar Plus",
    source: "Ação — Agendar no Calendário",
    description:
      'Ação de agendar. Substitui o "+" que era texto no rótulo (e que o leitor de tela lia em voz alta).',
    Icon: CalendarPlusIcon,
  },
  {
    name: "User Plus",
    source: "Ação — Novo Paciente / Convidar Membro",
    description:
      "Ação de cadastrar ou convidar pessoa. Mesma forma nas duas ações porque o gesto é o mesmo.",
    Icon: UserPlusIcon,
  },
  {
    name: "Log Out",
    source: "Ação — Sair",
    description: "Encerra a sessão. Porta com seta para fora.",
    Icon: LogOutIcon,
  },
];

function CardIcone({ icon }: { icon: IconItem }) {
  const IconComponent = icon.Icon;
  return (
    <div className="shadow-brutal-sm hover:shadow-brutal flex flex-col items-center rounded-lg border-2 border-black bg-stone-50 p-4 text-center transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5">
      <div className="shadow-brutal-sm mb-4 flex h-16 w-16 items-center justify-center rounded-md border-2 border-black bg-white text-black">
        <IconComponent size={24} className="text-stone-900" />
      </div>
      <h3 className="mb-1 text-base font-extrabold">{icon.name}</h3>
      <span className="mb-2 font-mono text-[10px] font-bold text-stone-500 uppercase">
        Origem: {icon.source}
      </span>
      <p className="mt-auto w-full border-t border-stone-200 pt-2 text-xs leading-relaxed text-stone-600">
        {icon.description}
      </p>
    </div>
  );
}

export const Gallery: StoryObj = {
  render: () => (
    <div className="max-w-6xl space-y-12 font-sans text-stone-900">
      <div className="shadow-brutal relative overflow-hidden border-4 border-black bg-[#F2B705] p-8">
        <h1 className="font-mono text-4xl font-black tracking-tight text-black uppercase md:text-5xl">
          Iconografia
        </h1>
        <p className="mt-4 max-w-3xl text-lg font-bold text-black md:text-xl">
          Design System Espectro Brutal — Galeria de ícones integrados do
          componente oficial (icon.tsx).
        </p>
      </div>

      <div className="shadow-brutal flex items-start gap-4 rounded-lg border-2 border-black bg-[#E3F2FD] p-6">
        <div className="mt-1 shrink-0 text-blue-900">
          <InfoCircleCustom />
        </div>
        <div>
          <h2 className="font-mono text-lg font-extrabold text-blue-950 uppercase">
            Regra de Acessibilidade (§4C)
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-blue-900">
            O significado dos componentes de status e dados{" "}
            <strong>nunca</strong> deve depender exclusivamente da cor. Todos os
            status ou mensagens críticas devem ser representados de forma
            redundante por um <strong>ícone estático</strong> correspondente e
            por texto explícito.
          </p>
        </div>
      </div>

      <section className="shadow-brutal rounded-lg border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Biblioteca de Ícones Core (src/components/ui/icon.tsx)
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {ICONS.map((icon) => (
            <CardIcone key={icon.name} icon={icon} />
          ))}
        </div>
      </section>

      <section className="shadow-brutal rounded-lg border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-2 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Navegação e Ação (src/components/ui/nav-icon.tsx)
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-stone-600">
          Um destino, uma forma: o rail, a barra inferior e o Drawer mobile
          resolvem o ícone pelo <code>href</code> no mesmo mapa. O ícone entra
          sempre <code>aria-hidden</code>, ao lado do rótulo visível — no rail
          colapsado, quem nomeia o destino é o <code>aria-label</code> do link
          (R-26). Rota sem ícone no mapa não some da navegação: cai no monograma
          de duas letras.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {NAV_ICONS.map((icon) => (
            <CardIcone key={icon.name} icon={icon} />
          ))}
        </div>
      </section>
    </div>
  ),
};

function InfoCircleCustom() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <circle cx="10" cy="5" r="1.4" fill="currentColor" />
      <path d="M10 9v7" />
    </svg>
  );
}
