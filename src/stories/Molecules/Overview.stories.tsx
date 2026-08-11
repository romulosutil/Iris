import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "04. UI COMPONENTS/Data Display & Feedback/Overview",
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
          Nível 2 — Moléculas
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight font-mono mb-3">
          Molecules
        </h1>
        <p className="text-stone-600 text-base leading-relaxed">
          As <strong>moléculas</strong> são combinações relativamente simples de átomos que formam
          uma unidade funcional com propósito claro. Um campo de formulário (label + input + mensagem de erro)
          é uma molécula: os elementos isolados têm pouca utilidade, mas juntos criam algo utilizável.
        </p>
      </div>

      {/* Rules */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Composição de átomos",
            desc: "Agrupa dois ou mais átomos criando uma unidade funcional com comportamento próprio.",
          },
          {
            title: "Responsabilidade única",
            desc: "Faz apenas uma coisa bem feita: busca, campo de formulário, notificação, seletor de data.",
          },
          {
            title: "Contexto-agnóstica",
            desc: "Não sabe onde será renderizada — deve funcionar em cards, drawers, modais e páginas.",
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
          {[
            "FormField (Label + Input + ErrorMessage)",
            "SearchBar (Input + Icon Button)",
            "Alert (Icon + Title + Description + Action)",
            "Card (Header + Body + Footer)",
            "AvatarWithName (Avatar + Name + Role)",
            "DatePicker",
            "Pagination",
            "Breadcrumb",
          ].map((c) => (
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
