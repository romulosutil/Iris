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
    <div className="max-w-3xl space-y-8 font-sans text-stone-900">
      {/* Header */}
      <div className="shadow-brutal border-4 border-black bg-white p-8">
        <span className="mb-4 inline-block bg-black px-3 py-1 font-mono text-xs font-bold tracking-widest text-white uppercase">
          Nível 2 — Moléculas
        </span>
        <h1 className="mb-3 font-mono text-4xl font-black tracking-tight uppercase">
          Molecules
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          As <strong>moléculas</strong> são combinações relativamente simples de
          átomos que formam uma unidade funcional com propósito claro. Um campo
          de formulário (label + input + mensagem de erro) é uma molécula: os
          elementos isolados têm pouca utilidade, mas juntos criam algo
          utilizável.
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
              <span className="inline-block h-1.5 w-1.5 shrink-0 bg-black" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};
