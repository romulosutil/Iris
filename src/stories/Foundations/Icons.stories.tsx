import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "Foundations/Icons",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type IconItem = {
  name: string;
  source: string; // Ex: StatusBadge, Alert, etc.
  render: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  description: string;
};

const ICONS: IconItem[] = [
  {
    name: "Sparkle",
    source: "StatusBadge (Sugerida)",
    description: "Representa sugestão da Inteligência Artificial. Indica dados que ainda não foram revisados ou confirmados por humanos.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <path
          d="M8 1.5l1.4 3.7L13 6.6l-3.6 1.4L8 11.7 6.6 8 3 6.6l3.6-1.4L8 1.5z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "Check",
    source: "StatusBadge (Aprovada) / Button",
    description: "Confirmação de que o dado clínico foi validado pelo terapeuta ou ação de sucesso.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
      </svg>
    ),
  },
  {
    name: "Layers",
    source: "StatusBadge (Reclassificada)",
    description: "Indica dados com versões sobrepostas ou modificação de categoria/metas.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <path d="M8 2l6 3-6 3-6-3 6-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M2 9l6 3 6-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Undo / Return",
    source: "StatusBadge (Devolvida)",
    description: "Ação de devolução, retorno ou desfazer. Usado quando o coordenador devolve a ficha para ajustes do terapeuta.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <path d="M6 3L2.5 6.5 6 10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="round" />
        <path d="M2.5 6.5H10a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      </svg>
    ),
  },
  {
    name: "Pencil / Edit",
    source: "StatusBadge (Editada)",
    description: "Edição de dado. Indica que o terapeuta ajustou a transcrição sugerida pela IA.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <path d="M10.5 2.5l3 3L6 13l-3.5.5L3 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Slash / Discard",
    source: "StatusBadge (Descartada)",
    description: "Descarte ou invalidação de um dado/sugestão. Representa que a informação foi desconsiderada.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      </svg>
    ),
  },
  {
    name: "Clock / Pending",
    source: "StatusBadge (Pendente)",
    description: "Indica estado de carregamento ou pendência em fila de processamento da IA.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 16 16" fill="none" {...props}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 5v3.2l2.2 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: "Success Check (Alert)",
    source: "Alert (Sucesso)",
    description: "Símbolo de sucesso em alertas de sistema e notificações clínicas.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 20 20" fill="none" {...props}>
        <path
          d="M4 10.5l4 4 8-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
    ),
  },
  {
    name: "Info Circle (Alert)",
    source: "Alert (Info)",
    description: "Ícone informativo para mensagens neutras de orientação e instrução do sistema.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 20 20" fill="none" {...props}>
        <circle cx="10" cy="5" r="1.4" fill="currentColor" />
        <path
          d="M10 9v7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
    ),
  },
  {
    name: "Warning Exclamation (Alert)",
    source: "Alert (Erro)",
    description: "Alerta de erro redundante. Sempre acompanhado por texto, evitando listras pretas de alto contraste fotossensíveis.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 20 20" fill="none" {...props}>
        <path
          d="M10 3v9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
        <path
          d="M10 16v.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
    ),
  },
  {
    name: "Chevron Down",
    source: "Accordion / Select",
    description: "Indica que o controle de UI (dropdown, accordion, etc.) é expansível para baixo.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" {...props}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    ),
  },
  {
    name: "Close / Remove",
    source: "Dialog (Close) / Chip (Dismiss)",
    description: "Fecha um modal/dialog ou remove um chip do grupo ativo.",
    render: (props) => (
      <svg width={24} height={24} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" {...props}>
        <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
      </svg>
    ),
  },
];

export const Gallery: StoryObj = {
  render: () => (
    <div className="space-y-12 max-w-6xl font-sans text-stone-900">
      <div className="border-4 border-black p-8 bg-[#F2B705] shadow-[8px_8px_0px_#000000] relative overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black font-mono">
          Iconografia
        </h1>
        <p className="mt-4 text-lg md:text-xl font-bold max-w-3xl text-black">
          Design System Espectro Brutal — Galeria de ícones integrados e inline do sistema de dados da clínica Iris.
        </p>
      </div>

      <div className="border-2 border-black bg-[#E3F2FD] p-6 shadow-[4px_4px_0px_#000000] flex gap-4 items-start">
        <div className="text-blue-900 shrink-0 mt-1">
          <svg width={24} height={24} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="10" cy="5" r="1.4" fill="currentColor" />
            <path d="M10 9v7" />
          </svg>
        </div>
        <div>
          <h2 className="font-extrabold text-lg text-blue-950 uppercase font-mono">Regra de Acessibilidade (§4C)</h2>
          <p className="text-blue-900 text-sm mt-1 leading-relaxed">
            O significado dos componentes de status e dados <strong>nunca</strong> deve depender exclusivamente da cor. Todos os status ou mensagens críticas devem ser representados de forma redundante por um <strong>ícone estático</strong> correspondente e por texto explícito.
          </p>
        </div>
      </div>

      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-[4px_4px_0px_#000000]">
        <h2 className="text-2xl font-black border-b-2 border-black pb-2 mb-6 uppercase font-mono">
          Biblioteca de Ícones Core
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {ICONS.map((icon) => {
            const IconComponent = icon.render;
            return (
              <div 
                key={icon.name} 
                className="border-2 border-black p-4 flex flex-col items-center text-center bg-stone-50 shadow-[2px_2px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150"
              >
                <div className="w-16 h-16 border-2 border-black bg-white flex items-center justify-center text-black mb-4 shadow-[2px_2px_0px_#000000]">
                  <IconComponent className="text-stone-900" />
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
