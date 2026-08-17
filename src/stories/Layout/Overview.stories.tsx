import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "04. UI COMPONENTS/Layout/Overview",
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
          Nível 4 — Layout & Templates
        </span>
        <h1 className="mb-3 font-mono text-4xl font-black tracking-tight uppercase">
          Layout / Templates
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          Os <strong>templates</strong> são a estrutura de wireframe de uma
          página — organizando os organismos em um layout sem dados reais. Eles
          definem <em>onde</em> cada organismo se encaixa: grade, proporções de
          coluna, posicionamento de sidebar, zonas de conteúdo. Nenhum conteúdo
          específico de negócio é inserido aqui.
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
            "AppShell (Navbar + Sidebar + Main content area)",
            "DashboardLayout (grid com métricas e listas)",
            "AuthLayout (centralizado, sem sidebar)",
            "PatientDetailLayout (header + tabs + aside)",
            "SettingsLayout (nav lateral + painel direito)",
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
