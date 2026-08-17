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
          {ICONS.map((icon) => {
            const IconComponent = icon.Icon;
            return (
              <div
                key={icon.name}
                className="shadow-brutal-sm hover:shadow-brutal flex flex-col items-center rounded-lg border-2 border-black bg-stone-50 p-4 text-center transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
              >
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
          })}
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
