import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "Layout/Overview",
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
          Nível 4 — Layout & Templates
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight font-mono mb-3">
          Layout / Templates
        </h1>
        <p className="text-stone-600 text-base leading-relaxed">
          Os <strong>templates</strong> são a estrutura de wireframe de uma página — organizando os
          organismos em um layout sem dados reais. Eles definem <em>onde</em> cada organismo
          se encaixa: grade, proporções de coluna, posicionamento de sidebar, zonas de conteúdo.
          Nenhum conteúdo específico de negócio é inserido aqui.
        </p>
      </div>

      {/* Rules */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Sem dados reais",
            desc: "Usa placeholders, lorem ipsum e dados fictícios — o foco é o esqueleto estrutural da página.",
          },
          {
            title: "Define o layout",
            desc: "Estabelece grid, proporções, zonas fixas (header, sidebar, footer) e áreas de conteúdo variável.",
          },
          {
            title: "Orquestra organismos",
            desc: "Posiciona e conecta os organismos; não cria lógica nova — delega comportamento para os filhos.",
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
            "AppShell (Navbar + Sidebar + Main content area)",
            "DashboardLayout (grid com métricas e listas)",
            "AuthLayout (centralizado, sem sidebar)",
            "PatientDetailLayout (header + tabs + aside)",
            "SettingsLayout (nav lateral + painel direito)",
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
