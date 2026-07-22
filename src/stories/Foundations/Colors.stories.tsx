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
    tint: { label: "tint", variable: "var(--status-success-bg)", hex: "#ECFDF5", textColor: "text-[#065F46]" },
    accent: { label: "accent", variable: "var(--status-success-border)", hex: "#059669", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--status-success-fg)", hex: "#065F46", textColor: "text-white" },
  },
  {
    label: "Informação",
    tint: { label: "tint", variable: "var(--status-info-bg)", hex: "#EFF6FF", textColor: "text-[#1E40AF]" },
    accent: { label: "accent", variable: "var(--status-info-border)", hex: "#2563EB", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--status-info-fg)", hex: "#1E40AF", textColor: "text-white" },
  },
  {
    label: "IA / sugerida",
    tint: { label: "tint", variable: "var(--status-ia-bg)", hex: "#F1E9F6", textColor: "text-[#45286E]" },
    accent: { label: "accent", variable: "var(--status-ia-border)", hex: "#6A4C93", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--status-ia-fg)", hex: "#45286E", textColor: "text-white" },
  },
  {
    label: "Aviso",
    tint: { label: "tint", variable: "var(--status-warning-bg)", hex: "#FFFBEB", textColor: "text-[#92400E]" },
    accent: { label: "accent", variable: "var(--status-warning-border)", hex: "#D97706", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--status-warning-fg)", hex: "#92400E", textColor: "text-white" },
  },
  {
    label: "Erro / Perigo",
    tint: { label: "tint", variable: "var(--status-error-bg)", hex: "#FEF2F2", textColor: "text-[#991B1B]" },
    accent: { label: "accent", variable: "var(--status-error-border)", hex: "#DC2626", textColor: "text-white" },
    deep: { label: "deep", variable: "var(--status-error-fg)", hex: "#991B1B", textColor: "text-white" },
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

const ACTION_TOKENS: ColorToken[] = [
  { name: "action.primary", variable: "var(--color-action-primary)", hex: "#F2B705", description: "Fundo dos botões primários (ouro alinhado à marca)." },
  { name: "action.primary.fg", variable: "var(--color-action-primary-fg)", hex: "#000000", description: "Texto/ícone dos botões primários (alto contraste)." },
  { name: "action.secondary.bg", variable: "var(--color-action-secondary-bg)", hex: "#FFFFFF", description: "Fundo dos botões secundários." },
  { name: "action.secondary.fg", variable: "var(--color-action-secondary-fg)", hex: "#000000", description: "Texto/ícone dos botões secundários." },
];

const RAW_PRIMITIVE_TOKENS: ColorToken[] = [
  { name: "Gold 100", variable: "var(--color-raw-gold-100)", hex: "#FFF6DB", description: "Tint suave de marca." },
  { name: "Gold 500", variable: "var(--color-raw-gold-500)", hex: "#F2B705", description: "Ouro primário (infinito autismo)." },
  { name: "Gold 700", variable: "var(--color-raw-gold-700)", hex: "#D29E04", description: "Hover de marca." },
  { name: "Mint 500", variable: "var(--color-raw-mint-500)", hex: "#14857A", description: "Acento de sucesso." },
  { name: "Blue 500", variable: "var(--color-raw-blue-500)", hex: "#1F6FB2", description: "Acento de informação." },
  { name: "Violet 500", variable: "var(--color-raw-violet-500)", hex: "#6A4C93", description: "Acento de IA / sugestão." },
  { name: "Terracotta 500", variable: "var(--color-raw-terracotta-500)", hex: "#C0392B", description: "Acento de erro / perigo." },
  { name: "Gray 900", variable: "var(--color-raw-gray-900)", hex: "#1A1A1A", description: "Âncora gráfica brutalista." },
];

export const Palette: StoryObj = {
  render: () => (
    <div className="space-y-12 max-w-6xl font-sans text-stone-900 bg-[#FAF9F5] p-6 md:p-8 border-4 border-black shadow-brutal">
      {/* Banner Superior Brutalista */}
      <div className="border-4 border-black p-8 bg-[#F2B705] shadow-brutal relative overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black font-mono">
          Cores &amp; Paleta
        </h1>
        <p className="mt-4 text-lg md:text-xl font-bold max-w-3xl text-black">
          Design System Espectro Brutal — Paleta de cores semântica e primitivas brutais baseadas na neurodiversidade-afirmativa.
        </p>
      </div>

      {/* PRIMITIVAS BRUTALISTAS */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          PRIMITIVAS DE CORES BRUTALISTAS
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
          {RAW_PRIMITIVE_TOKENS.map((token) => (
            <div 
              key={token.variable} 
              className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-brutal-sm"
            >
              <div 
                className="w-full h-12 border-b border-black" 
                style={{ backgroundColor: token.variable }}
              />
              <div className="p-2 text-center">
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

      {/* MARCA & AÇÃO INSTITUCIONAL */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          MARCA &amp; AÇÃO INSTITUCIONAL
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {BRAND_TOKENS.map((token) => (
            <div 
              key={token.variable} 
              className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-brutal hover:shadow-brutal-hover hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150"
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

      {/* TOKENS SEMÂNTICOS DE AÇÃO (COMPONENTES / BOTÕES) */}
      <section className="space-y-4">
        <h2 className="text-xl font-black font-mono text-stone-500 uppercase tracking-wider">
          AÇÕES SEMÂNTICAS (BOTÕES &amp; CONTROLES)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {ACTION_TOKENS.map((token) => (
            <div 
              key={token.variable} 
              className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-brutal hover:shadow-brutal-hover hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150"
            >
              <div 
                className="w-full h-24 border-b-2 border-black flex items-center justify-center font-bold text-sm" 
                style={{ backgroundColor: token.variable }}
              >
                <span className="bg-black/10 px-2 py-1 rounded">Amostra</span>
              </div>
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
        
        <div className="border-2 border-black rounded-lg bg-white p-6 shadow-brutal space-y-6">
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
                  className={`border-2 border-black rounded-lg p-4 flex flex-col justify-between h-18 shadow-brutal-sm ${row.tint.textColor}`}
                  style={{ backgroundColor: row.tint.variable }}
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">{row.tint.label}</span>
                  <span className="font-mono text-sm font-black uppercase">{row.tint.hex}</span>
                </div>

                {/* ACCENT */}
                <div 
                  className={`border-2 border-black rounded-lg p-4 flex flex-col justify-between h-18 shadow-brutal-sm ${row.accent.textColor}`}
                  style={{ backgroundColor: row.accent.variable }}
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">{row.accent.label}</span>
                  <span className="font-mono text-sm font-black uppercase">{row.accent.hex}</span>
                </div>

                {/* DEEP */}
                <div 
                  className={`border-2 border-black rounded-lg p-4 flex flex-col justify-between h-18 shadow-brutal-sm ${row.deep.textColor}`}
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
              className="border-2 border-black p-4 flex flex-col justify-between bg-white shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-150 rounded-lg"
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
              className="border-2 border-black rounded-lg overflow-hidden bg-white shadow-brutal-sm"
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

      {/* DO'S & DON'TS */}
      <section className="space-y-4 pt-6 border-t-2 border-dashed border-stone-200">
        <h2 className="text-2xl font-black font-mono text-black uppercase tracking-wider">
          Do&apos;s &amp; Don&apos;ts (Boas Práticas de Cores)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* DO */}
          <div className="border-2 border-black rounded-lg p-6 bg-emerald-50 shadow-brutal-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-emerald-500 text-white font-mono font-bold text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[1px_1px_0_0_#000000]">
                DO (SIM)
              </span>
              <h3 className="text-lg font-black text-emerald-950">Práticas Recomendadas</h3>
            </div>
            <ul className="space-y-3 text-emerald-900 text-sm list-disc pl-5">
              <li>
                <strong>Contraste Seguro na Cor Primária:</strong> Use sempre <code>ink.anchor</code> (<code>#0A0A0A</code>) ou <code>Heading Text</code> sobre fundos <code>brand.primary</code> (amarelo).
              </li>
              <li>
                <strong>Tríade de Estados:</strong> Utilize a estrutura semântica <code>Tint</code> (fundo), <code>Accent</code> (borda/detalhe) e <code>Deep</code> (texto) para representar estados de dados clínicos.
              </li>
              <li>
                <strong>Redundância Visual:</strong> Combine cor com ícones e rótulos textuais para que o significado nunca dependa apenas da cor.
              </li>
            </ul>
            <div className="mt-4 p-3 bg-white border border-emerald-300 rounded text-xs flex items-center justify-between">
              <span className="font-bold text-emerald-950">Exemplo Correto:</span>
              <div className="bg-[#F2B705] text-[#0A0A0A] font-bold px-3 py-1 border border-black rounded font-mono">
                Texto Escuro no Amarelo (OK)
              </div>
            </div>
          </div>

          {/* DON'T */}
          <div className="border-2 border-black rounded-lg p-6 bg-rose-50 shadow-brutal-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-rose-500 text-white font-mono font-bold text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[1px_1px_0_0_#000000]">
                DON&apos;T (NÃO)
              </span>
              <h3 className="text-lg font-black text-rose-950">Práticas Proibidas</h3>
            </div>
            <ul className="space-y-3 text-rose-900 text-sm list-disc pl-5">
              <li>
                <strong>Texto Claro no Amarelo:</strong> Nunca utilize texto branco (<code>#FFFFFF</code>) ou tons claros sobre fundos <code>brand.primary</code>. A acessibilidade WCAG falha severamente.
              </li>
              <li>
                <strong>Spectrum como Chrome:</strong> Nunca aplique as cores da régua <code>Spectrum</code> em botões ou status badges interativos, pois gera confusão e ruído visual.
              </li>
              <li>
                <strong>Cores Puras para Status:</strong> Evite utilizar vermelho ou verde puro de alta saturação sem mitigação estrutural (como hachuras ou bordas diferenciadas).
              </li>
            </ul>
            <div className="mt-4 p-3 bg-white border border-rose-300 rounded text-xs flex items-center justify-between">
              <span className="font-bold text-rose-950">Exemplo Incorreto:</span>
              <div className="bg-[#F2B705] text-white font-bold px-3 py-1 border border-black rounded font-mono line-through opacity-70">
                Texto Branco no Amarelo (FALHA)
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
};
