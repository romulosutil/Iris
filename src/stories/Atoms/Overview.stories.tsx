import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "Atoms/Overview",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

export const Visão_Geral: StoryObj = {
  name: "Visão Geral",
  render: () => (
    <div className="max-w-3xl font-sans text-stone-900 space-y-8">
      {/* Header */}
      <div className="border-4 border-black p-8 bg-white shadow-brutal">
        <span className="bg-black text-white font-mono font-bold text-xs uppercase px-3 py-1 inline-block tracking-widest mb-4">
          Nível 1 — Átomos
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight font-mono mb-3">
          Atoms
        </h1>
        <p className="text-stone-600 text-base leading-relaxed">
          Os <strong>átomos</strong> são os menores blocos de construção indivisíveis da interface.
          Correspondem a elementos HTML com estilos aplicados: botões, inputs, badges, ícones, tags de cor.
          Nenhum átomo depende de outro componente do sistema — apenas de tokens de design.
        </p>
      </div>

      {/* Rules */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Indivisível",
            desc: "Não pode ser decomposto em componentes menores sem perder seu significado funcional.",
          },
          {
            title: "Sem dependências",
            desc: "Importa apenas tokens (CSS vars, Tailwind classes) — nunca outros componentes do DS.",
          },
          {
            title: "Altamente reutilizável",
            desc: "Deve funcionar em qualquer contexto: formulários, cards, modais, tabelas.",
          },
        ].map(({ title, desc }) => (
          <div key={title} className="border-2 border-black p-5 bg-stone-50 shadow-brutal-sm">
            <h2 className="font-black font-mono uppercase text-sm border-b border-black pb-1 mb-2">
              {title}
            </h2>
            <p className="text-stone-600 text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Examples hint */}
      <div className="border-2 border-black p-5 bg-[#F2B705] shadow-brutal">
        <h2 className="font-black font-mono uppercase text-sm mb-2">
          Exemplos nesta categoria
        </h2>
        <ul className="text-xs font-mono space-y-1 text-stone-900">
          {["Button", "Input", "Label", "Badge / Chip", "StatusBadge", "Avatar", "Icon", "Spinner / Skeleton", "Tooltip"].map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-black inline-block shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};
