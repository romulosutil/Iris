import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "Foundations/Colors",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type ColorToken = {
  name: string;
  variable: string;
  hex: string;
  description: string;
};

type StateCell = {
  label: string;
  variable: string;
  hex: string;
  textColor: string;
};

type StateRow = {
  label: string;
  tint: StateCell;
  accent: StateCell;
  deep: StateCell;
};

const BRAND_TOKENS: ColorToken[] = [
  { name: "brand.primary", variable: "var(--color-brand-primary)", hex: "#F2B705", description: "Cor principal da marca e ações primárias." },
  { name: "primary.hover", variable: "var(--color-brand-primary-hover)", hex: "#D29E04", description: "Estado de hover das ações primárias." },
  { name: "primary.tint", variable: "var(--color-brand-primary-tint)", hex: "#FFF6DB", description: "Fundo suave de marca para destaque sutil." },
  { name: "ink.anchor", variable: "var(--color-ink-anchor)", hex: "#0A0A0A", description: "Âncora de tipografia e elementos de alto contraste." },
];

const DATA_STATES: StateRow[] = [
  {
    label: "Sucesso",
    tint: { label: "tint", variable: "var(--color-status-success-bg)", hex: "#E6F4F1", textColor: "text-[#0A5C54]" },
    accent: { label: "accent", variable: "var(--color-status-success-accent)", hex: "#14857A", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--color-status-success-text)", hex: "#0A5C54", textColor: "text-white" },
  },
  {
    label: "Informação",
    tint: { label: "tint", variable: "var(--color-status-info-bg)", hex: "#E7F0FB", textColor: "text-[#124A78]" },
    accent: { label: "accent", variable: "var(--color-status-info-accent)", hex: "#1F6FB2", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--color-status-info-text)", hex: "#124A78", textColor: "text-white" },
  },
  {
    label: "IA / sugerida",
    tint: { label: "tint", variable: "var(--color-status-ia-bg)", hex: "#F1E9F6", textColor: "text-[#45286E]" },
    accent: { label: "accent", variable: "var(--color-status-ia-accent)", hex: "#6A4C93", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--color-status-ia-text)", hex: "#45286E", textColor: "text-white" },
  },
  {
    label: "Alerta",
    tint: { label: "tint", variable: "var(--color-status-error-bg)", hex: "#FBE9E9", textColor: "text-[#7E1F16]" },
    accent: { label: "accent", variable: "var(--color-status-error-accent)", hex: "#C0392B", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--color-status-error-text)", hex: "#7E1F16", textColor: "text-white" },
  },
];

const ESTRUTURA_TOKENS: ColorToken[] = [
  { name: "Canvas BG", variable: "var(--color-bg-canvas)", hex: "#F8F9FA", description: "Fundo principal da tela, off-white para reduzir o brilho (glare)." },
  { name: "Surface BG", variable: "var(--color-bg-surface)", hex: "#FFFFFF", description: "Fundo de elementos sobrepostos (cards, modais, inputs)." },
  { name: "Border Brutal", variable: "var(--color-border-brutal)", hex: "#1A1A1A", description: "Bordas neobrutalistas marcantes de componentes." },
  { name: "Body Text", variable: "var(--color-text-body)", hex: "#2B2B2B", description: "Texto padrão corrido para alta legibilidade." },
  { name: "Heading Text", variable: "var(--color-text-heading)", hex: "#0A0A0A", description: "Preto puro para títulos principais e âncoras visuais." },
];

const ESPECTRO_TOKENS: ColorToken[] = [
  { name: "Spectrum Red", variable: "var(--color-spectrum-red)", hex: "#E4572E", description: "Stop vermelho do arco-íris." },
  { name: "Spectrum Orange", variable: "var(--color-spectrum-orange)", hex: "#F2A71B", description: "Stop laranja do arco-íris." },
  { name: "Spectrum Yellow", variable: "var(--color-spectrum-yellow)", hex: "#F2B705", description: "Stop amarelo do arco-íris." },
  { name: "Spectrum Green", variable: "var(--color-spectrum-green)", hex: "#3FA34D", description: "Stop verde do arco-íris." },
  { name: "Spectrum Blue", variable: "var(--color-spectrum-blue)", hex: "#2274A5", description: "Stop azul do arco-íris." },
  { name: "Spectrum Violet", variable: "var(--color-spectrum-violet)", hex: "#6A4C93", description: "Stop violeta do arco-íris." },
];

export const Palette: StoryObj = {
  render: () => (
    <div className="space-y-12 max-w-6xl font-sans text-stone-900 bg-[#FAF9F5] p-6 md:p-8 border-4 border-black shadow-[8px_8px_0px_#000000]">
      {/* Banner Superior Brutalista */}
      <div className="border-4 border-black p-8 bg-[#F2B705] shadow-[8px_8px_0px_#000000] relative overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black font-mono">
          Cores & Paleta
        </h1>
        <p className="mt-4 text-lg md:text-xl font-bold max-w-3xl text-black">
          Design System Espectro Brutal — Paleta de cores semântica baseada na lente conceitual da neurodiversidade-afirmativa.
        </p>
      </div>

      {/* MARCA & AÇÃO */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          MARCA & AÇÃO
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {BRAND_TOKENS.map((token) => (
            <div 
              key={token.variable} 
              className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150"
            >
              <div 
                className="w-full h-24 border-b-2 border-black" 
                style={{ backgroundColor: token.variable }}
              />
              <div className="p-4 bg-white">
                <span className="font-mono text-base font-extrabold text-black block mb-0.5">
                  {token.name}
                </span>
                <span className="font-mono text-sm text-stone-400 block uppercase">
                  {token.hex}
                </span>
                <code className="text-[10px] text-rose-600 font-semibold bg-stone-50 px-1 py-0.5 border border-stone-200 block mt-2 break-all rounded w-fit">
                  {token.variable}
                </code>
                <p className="text-stone-600 text-xs mt-2 leading-relaxed">
                  {token.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ESTADOS DO DADO */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          ESTADOS DO DADO — TINTA · ACENTO · PROFUNDO
        </h2>
        
        <div className="border-2 border-black rounded-lg bg-white p-6 shadow-[4px_4px_0px_#000000] space-y-6">
          {DATA_STATES.map((row) => (
            <div key={row.label} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border-b border-stone-100 last:border-0 pb-6 last:pb-0">
              {/* Nome do Estado */}
              <div className="md:col-span-3 text-lg font-bold text-black font-sans">
                {row.label}
              </div>

              {/* Grid das Cores (tint, accent, deep) */}
              <div className="md:col-span-9 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* TINT */}
                <div 
                  className={`border-2 border-black rounded-lg p-4 flex flex-col justify-between h-18 shadow-[2px_2px_0px_#000000] ${row.tint.textColor}`}
                  style={{ backgroundColor: row.tint.variable }}
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">{row.tint.label}</span>
                  <span className="font-mono text-sm font-black uppercase">{row.tint.hex}</span>
                </div>

                {/* ACCENT */}
                <div 
                  className={`border-2 border-black rounded-lg p-4 flex flex-col justify-between h-18 shadow-[2px_2px_0px_#000000] ${row.accent.textColor}`}
                  style={{ backgroundColor: row.accent.variable }}
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">{row.accent.label}</span>
                  <span className="font-mono text-sm font-black uppercase">{row.accent.hex}</span>
                </div>

                {/* DEEP */}
                <div 
                  className={`border-2 border-black rounded-lg p-4 flex flex-col justify-between h-18 shadow-[2px_2px_0px_#000000] ${row.deep.textColor}`}
                  style={{ backgroundColor: row.deep.variable }}
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">{row.deep.label}</span>
                  <span className="font-mono text-sm font-black uppercase">{row.deep.hex}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ESTRUTURA E TIPOGRAFIA */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          ESTRUTURA & TIPOGRAFIA
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ESTRUTURA_TOKENS.map((token) => (
            <div 
              key={token.variable} 
              className="border-2 border-black p-4 flex flex-col justify-between bg-white shadow-[2px_2px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150 rounded-lg"
            >
              <div>
                <div 
                  className="w-full h-16 border-2 border-black mb-4 relative rounded" 
                  style={{ backgroundColor: token.variable }}
                >
                  <span className="absolute bottom-2 right-2 bg-black text-white text-[10px] px-2 py-0.5 font-bold uppercase font-mono border border-white">
                    {token.hex}
                  </span>
                </div>
                <h3 className="font-extrabold text-base mb-1 text-black">{token.name}</h3>
                <code className="text-xs text-rose-600 font-semibold bg-stone-50 px-1 py-0.5 border border-stone-200 block mb-2 break-all rounded w-fit">
                  {token.variable}
                </code>
              </div>
              <p className="text-stone-600 text-xs mt-2 leading-relaxed">
                {token.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ESPECTRO DE MARCA */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          ESPECTRO (ASSINATURA DE MARCA)
        </h2>
        <p className="text-stone-600 font-medium text-sm">
          Régua fina arco-íris representando a neurodivergência. Usada exclusivamente para fins institucionais e identidade de marca (nunca em botões ou status).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {ESPECTRO_TOKENS.map((token) => (
            <div 
              key={token.variable} 
              className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-[2px_2px_0px_#000000]"
            >
              <div 
                className="w-full h-8 border-b border-black" 
                style={{ backgroundColor: token.variable }}
              />
              <div className="p-3">
                <span className="font-mono text-xs font-bold text-black block truncate">
                  {token.name}
                </span>
                <span className="font-mono text-[10px] text-stone-400 block uppercase">
                  {token.hex}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};
