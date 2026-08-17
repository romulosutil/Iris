import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "03. PRIMITIVES/Overview",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

export const Visão_Geral: StoryObj = {
  name: "Visão Geral",
  render: () => (
    <div className="max-w-3xl space-y-8 font-sans text-stone-900">
      {/* Header */}
      <div className="shadow-brutal border-4 border-black bg-white p-8">
        <span className="mb-4 inline-block bg-black px-3 py-1 font-mono text-xs font-bold tracking-widest text-white uppercase">
          Nível 1 — Átomos
        </span>
        <h1 className="mb-3 font-mono text-4xl font-black tracking-tight uppercase">
          Atoms
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          Os <strong>átomos</strong> são os menores blocos de construção
          indivisíveis da interface. Correspondem a elementos HTML com estilos
          aplicados: botões, inputs, badges, ícones, tags de cor. Nenhum átomo
          depende de outro componente do sistema — apenas de tokens de design.
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
          <div
            key={title}
            className="shadow-brutal-sm border-2 border-black bg-stone-50 p-5"
          >
            <h2 className="mb-2 border-b border-black pb-1 font-mono text-sm font-black uppercase">
              {title}
            </h2>
            <p className="text-xs leading-relaxed text-stone-600">{desc}</p>
          </div>
        ))}
      </div>

      {/* Examples hint */}
      <div className="shadow-brutal border-2 border-black bg-[#F2B705] p-5">
        <h2 className="mb-2 font-mono text-sm font-black uppercase">
          Exemplos nesta categoria
        </h2>
        <ul className="space-y-1 font-mono text-xs text-stone-900">
          {[
            "Button",
            "Input",
            "Label",
            "Badge / Chip",
            "StatusBadge",
            "Avatar",
            "Icon",
            "Spinner / Skeleton",
            "Tooltip",
          ].map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 shrink-0 bg-black" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};
