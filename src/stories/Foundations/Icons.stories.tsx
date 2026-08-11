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
    description: "Representa sugestão da Inteligência Artificial. Indica dados que ainda não foram revisados ou confirmados por humanos.",
    Icon: SparkleIcon,
  },
  {
    name: "Check",
    source: "StatusBadge (Aprovada) / Button",
    description: "Confirmação de que o dado clínico foi validado pelo terapeuta ou ação de sucesso.",
    Icon: CheckIcon,
  },
  {
    name: "Layers",
    source: "StatusBadge (Reclassificada)",
    description: "Indica dados com versões sobrepostas ou modificação de categoria/metas.",
    Icon: LayersIcon,
  },
  {
    name: "Undo / Return",
    source: "StatusBadge (Devolvida)",
    description: "Ação de devolução, retorno ou desfazer. Usado quando o coordenador devolve a ficha para ajustes do terapeuta.",
    Icon: UndoIcon,
  },
  {
    name: "Pencil / Edit",
    source: "StatusBadge (Editada)",
    description: "Edição de dado. Indica que o terapeuta ajustou a transcrição sugerida pela IA.",
    Icon: PencilIcon,
  },
  {
    name: "Discard / Slash",
    source: "StatusBadge (Descartada)",
    description: "Descarte ou invalidação de um dado/sugestão. Representa que a informação foi desconsiderada.",
    Icon: DiscardIcon,
  },
  {
    name: "Clock / Pending",
    source: "StatusBadge (Pendente)",
    description: "Indica estado de carregamento ou pendência em fila de processamento da IA.",
    Icon: ClockIcon,
  },
  {
    name: "Chevron Down",
    source: "Accordion / Select",
    description: "Indica que o controle de UI (dropdown, accordion, etc.) é expansível para baixo.",
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
    <div className="space-y-12 max-w-6xl font-sans text-stone-900">
      <div className="border-4 border-black p-8 bg-[#F2B705] shadow-brutal relative overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black font-mono">
          Iconografia
        </h1>
        <p className="mt-4 text-lg md:text-xl font-bold max-w-3xl text-black">
          Design System Espectro Brutal — Galeria de ícones integrados do componente oficial (icon.tsx).
        </p>
      </div>

      <div className="border-2 border-black bg-[#E3F2FD] p-6 shadow-brutal flex gap-4 items-start rounded-lg">
        <div className="text-blue-900 shrink-0 mt-1">
          <InfoCircleCustom />
        </div>
        <div>
          <h2 className="font-extrabold text-lg text-blue-950 uppercase font-mono">Regra de Acessibilidade (§4C)</h2>
          <p className="text-blue-900 text-sm mt-1 leading-relaxed">
            O significado dos componentes de status e dados <strong>nunca</strong> deve depender exclusivamente da cor. Todos os status ou mensagens críticas devem ser representados de forma redundante por um <strong>ícone estático</strong> correspondente e por texto explícito.
          </p>
        </div>
      </div>

      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal rounded-lg">
        <h2 className="text-2xl font-black border-b-2 border-black pb-2 mb-6 uppercase font-mono">
          Biblioteca de Ícones Core (src/components/ui/icon.tsx)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {ICONS.map((icon) => {
            const IconComponent = icon.Icon;
            return (
              <div 
                key={icon.name} 
                className="border-2 border-black p-4 flex flex-col items-center text-center bg-stone-50 shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150 rounded-lg"
              >
                <div className="w-16 h-16 border-2 border-black bg-white flex items-center justify-center text-black mb-4 shadow-brutal-sm rounded-md">
                  <IconComponent size={24} className="text-stone-900" />
                </div>
                <h3 className="font-extrabold text-base mb-1">{icon.name}</h3>
                <span className="text-[10px] text-stone-500 font-bold uppercase font-mono mb-2">
                  Origem: {icon.source}
                </span>
                <p className="text-stone-600 text-xs leading-relaxed mt-auto pt-2 border-t border-stone-200 w-full">
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
    <svg width={24} height={24} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="10" cy="5" r="1.4" fill="currentColor" />
      <path d="M10 9v7" />
    </svg>
  );
}
