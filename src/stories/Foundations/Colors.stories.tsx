import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "02. FOUNDATIONS/Colors",
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
  {
    name: "brand.primary",
    variable: "var(--color-brand-primary)",
    hex: "#F2B705",
    description: "Cor principal da marca e ações primárias.",
  },
  {
    name: "primary.hover",
    variable: "var(--color-brand-primary-hover)",
    hex: "#D29E04",
    description: "Estado de hover das ações primárias.",
  },
  {
    name: "primary.tint",
    variable: "var(--color-brand-primary-tint)",
    hex: "#FFF6DB",
    description: "Fundo suave de marca para destaque sutil.",
  },
  {
    name: "ink.anchor",
    variable: "var(--color-ink-anchor)",
    hex: "#0A0A0A",
    description: "Âncora de tipografia e elementos de alto contraste.",
  },
];

const DATA_STATES: StateRow[] = [
  {
    label: "Sucesso",
    tint: {
      label: "tint",
      variable: "var(--status-success-bg)",
      hex: "#ECFDF5",
      textColor: "text-[#065F46]",
    },
    accent: {
      label: "accent",
      variable: "var(--status-success-border)",
      hex: "#059669",
      textColor: "text-white",
    },
    deep: {
      label: "deep",
      variable: "var(--status-success-fg)",
      hex: "#065F46",
      textColor: "text-white",
    },
  },
  {
    label: "Informação",
    tint: {
      label: "tint",
      variable: "var(--status-info-bg)",
      hex: "#EFF6FF",
      textColor: "text-[#1E40AF]",
    },
    accent: {
      label: "accent",
      variable: "var(--status-info-border)",
      hex: "#2563EB",
      textColor: "text-white",
    },
    deep: {
      label: "deep",
      variable: "var(--status-info-fg)",
      hex: "#1E40AF",
      textColor: "text-white",
    },
  },
  {
    label: "IA / sugerida",
    tint: {
      label: "tint",
      variable: "var(--status-ia-bg)",
      hex: "#F1E9F6",
      textColor: "text-[#45286E]",
    },
    accent: {
      label: "accent",
      variable: "var(--status-ia-border)",
      hex: "#6A4C93",
      textColor: "text-white",
    },
    deep: {
      label: "deep",
      variable: "var(--status-ia-fg)",
      hex: "#45286E",
      textColor: "text-white",
    },
  },
  {
    label: "Aviso",
    tint: {
      label: "tint",
      variable: "var(--status-warning-bg)",
      hex: "#FFFBEB",
      textColor: "text-[#92400E]",
    },
    accent: {
      label: "accent",
      variable: "var(--status-warning-border)",
      hex: "#D97706",
      textColor: "text-white",
    },
    deep: {
      label: "deep",
      variable: "var(--status-warning-fg)",
      hex: "#92400E",
      textColor: "text-white",
    },
  },
  {
    label: "Erro / Perigo",
    tint: {
      label: "tint",
      variable: "var(--status-error-bg)",
      hex: "#FEF2F2",
      textColor: "text-[#991B1B]",
    },
    accent: {
      label: "accent",
      variable: "var(--status-error-border)",
      hex: "#DC2626",
      textColor: "text-white",
    },
    deep: {
      label: "deep",
      variable: "var(--status-error-fg)",
      hex: "#991B1B",
      textColor: "text-white",
    },
  },
];

const ESTRUTURA_TOKENS: ColorToken[] = [
  {
    name: "Canvas BG",
    variable: "var(--color-bg-canvas)",
    hex: "#F8F9FA",
    description:
      "Fundo principal da tela, off-white para reduzir o brilho (glare).",
  },
  {
    name: "Surface BG",
    variable: "var(--color-bg-surface)",
    hex: "#FFFFFF",
    description: "Fundo de elementos sobrepostos (cards, modais, inputs).",
  },
  {
    name: "Border Brutal",
    variable: "var(--color-border-brutal)",
    hex: "#1A1A1A",
    description: "Bordas neobrutalistas marcantes de componentes.",
  },
  {
    name: "Body Text",
    variable: "var(--color-text-body)",
    hex: "#2B2B2B",
    description: "Texto padrão corrido para alta legibilidade.",
  },
  {
    name: "Heading Text",
    variable: "var(--color-text-heading)",
    hex: "#0A0A0A",
    description: "Preto puro para títulos principais e âncoras visuais.",
  },
];

const ESPECTRO_TOKENS: ColorToken[] = [
  {
    name: "Spectrum Red",
    variable: "var(--color-spectrum-red)",
    hex: "#E4572E",
    description: "Stop vermelho do arco-íris.",
  },
  {
    name: "Spectrum Orange",
    variable: "var(--color-spectrum-orange)",
    hex: "#F2A71B",
    description: "Stop laranja do arco-íris.",
  },
  {
    name: "Spectrum Yellow",
    variable: "var(--color-spectrum-yellow)",
    hex: "#F2B705",
    description: "Stop amarelo do arco-íris.",
  },
  {
    name: "Spectrum Green",
    variable: "var(--color-spectrum-green)",
    hex: "#3FA34D",
    description: "Stop verde do arco-íris.",
  },
  {
    name: "Spectrum Blue",
    variable: "var(--color-spectrum-blue)",
    hex: "#2274A5",
    description: "Stop azul do arco-íris.",
  },
  {
    name: "Spectrum Violet",
    variable: "var(--color-spectrum-violet)",
    hex: "#6A4C93",
    description: "Stop violeta do arco-íris.",
  },
];

const ACTION_TOKENS: ColorToken[] = [
  {
    name: "action.primary",
    variable: "var(--color-action-primary)",
    hex: "#F2B705",
    description: "Fundo dos botões primários (ouro alinhado à marca).",
  },
  {
    name: "action.primary.fg",
    variable: "var(--color-action-primary-fg)",
    hex: "#000000",
    description: "Texto/ícone dos botões primários (alto contraste).",
  },
  {
    name: "action.secondary.bg",
    variable: "var(--color-action-secondary-bg)",
    hex: "#FFFFFF",
    description: "Fundo dos botões secundários.",
  },
  {
    name: "action.secondary.fg",
    variable: "var(--color-action-secondary-fg)",
    hex: "#000000",
    description: "Texto/ícone dos botões secundários.",
  },
];

const RAW_PRIMITIVE_TOKENS: ColorToken[] = [
  {
    name: "Gold 100",
    variable: "var(--color-raw-gold-100)",
    hex: "#FFF6DB",
    description: "Tint suave de marca.",
  },
  {
    name: "Gold 500",
    variable: "var(--color-raw-gold-500)",
    hex: "#F2B705",
    description: "Ouro primário (infinito autismo).",
  },
  {
    name: "Gold 700",
    variable: "var(--color-raw-gold-700)",
    hex: "#D29E04",
    description: "Hover de marca.",
  },
  {
    name: "Mint 500",
    variable: "var(--color-raw-mint-500)",
    hex: "#14857A",
    description: "Acento de sucesso.",
  },
  {
    name: "Blue 500",
    variable: "var(--color-raw-blue-500)",
    hex: "#1F6FB2",
    description: "Acento de informação.",
  },
  {
    name: "Violet 500",
    variable: "var(--color-raw-violet-500)",
    hex: "#6A4C93",
    description: "Acento de IA / sugestão.",
  },
  {
    name: "Terracotta 500",
    variable: "var(--color-raw-terracotta-500)",
    hex: "#C0392B",
    description: "Acento de erro / perigo.",
  },
  {
    name: "Gray 900",
    variable: "var(--color-raw-gray-900)",
    hex: "#1A1A1A",
    description: "Âncora gráfica brutalista.",
  },
];

export const Palette: StoryObj = {
  render: () => (
    <div className="shadow-brutal max-w-6xl space-y-12 border-4 border-black bg-[#FAF9F5] p-6 font-sans text-stone-900 md:p-8">
      {/* Banner Superior Brutalista */}
      <div className="shadow-brutal relative overflow-hidden border-4 border-black bg-[#F2B705] p-8">
        <h1 className="font-mono text-4xl font-black tracking-tight text-black uppercase md:text-5xl">
          Cores &amp; Paleta
        </h1>
        <p className="mt-4 max-w-3xl text-lg font-bold text-black md:text-xl">
          Design System Espectro Brutal — Paleta de cores semântica e primitivas
          brutais baseadas na neurodiversidade-afirmativa.
        </p>
      </div>

      {/* PRIMITIVAS BRUTALISTAS */}
      <section className="space-y-4">
        <h2 className="font-mono text-xl font-black tracking-wider text-stone-500 uppercase">
          PRIMITIVAS DE CORES BRUTALISTAS
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-8">
          {RAW_PRIMITIVE_TOKENS.map((token) => (
            <div
              key={token.variable}
              className="shadow-brutal-sm overflow-hidden rounded-lg border-2 border-black bg-white"
            >
              <div
                className="h-12 w-full border-b border-black"
                style={{ backgroundColor: token.variable }}
              />
              <div className="p-2 text-center">
                <span className="block truncate font-mono text-xs font-bold text-black">
                  {token.name}
                </span>
                <span className="block font-mono text-[10px] text-stone-400 uppercase">
                  {token.hex}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MARCA & AÇÃO INSTITUCIONAL */}
      <section className="space-y-4">
        <h2 className="font-mono text-xl font-black tracking-wider text-stone-500 uppercase">
          MARCA &amp; AÇÃO INSTITUCIONAL
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {BRAND_TOKENS.map((token) => (
            <div
              key={token.variable}
              className="shadow-brutal hover:shadow-brutal-hover overflow-hidden rounded-lg border-2 border-black bg-white transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <div
                className="h-24 w-full border-b-2 border-black"
                style={{ backgroundColor: token.variable }}
              />
              <div className="bg-white p-4">
                <span className="mb-0.5 block font-mono text-base font-extrabold text-black">
                  {token.name}
                </span>
                <span className="block font-mono text-sm text-stone-400 uppercase">
                  {token.hex}
                </span>
                <code className="mt-2 block w-fit rounded border border-stone-200 bg-stone-50 px-1 py-0.5 text-[10px] font-semibold break-all text-rose-600">
                  {token.variable}
                </code>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  {token.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TOKENS SEMÂNTICOS DE AÇÃO (COMPONENTES / BOTÕES) */}
      <section className="space-y-4">
        <h2 className="font-mono text-xl font-black tracking-wider text-stone-500 uppercase">
          AÇÕES SEMÂNTICAS (BOTÕES &amp; CONTROLES)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {ACTION_TOKENS.map((token) => (
            <div
              key={token.variable}
              className="shadow-brutal hover:shadow-brutal-hover overflow-hidden rounded-lg border-2 border-black bg-white transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <div
                className="flex h-24 w-full items-center justify-center border-b-2 border-black text-sm font-bold"
                style={{ backgroundColor: token.variable }}
              >
                <span className="rounded bg-black/10 px-2 py-1">Amostra</span>
              </div>
              <div className="bg-white p-4">
                <span className="mb-0.5 block font-mono text-base font-extrabold text-black">
                  {token.name}
                </span>
                <span className="block font-mono text-sm text-stone-400 uppercase">
                  {token.hex}
                </span>
                <code className="mt-2 block w-fit rounded border border-stone-200 bg-stone-50 px-1 py-0.5 text-[10px] font-semibold break-all text-rose-600">
                  {token.variable}
                </code>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  {token.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ESTADOS DO DADO */}
      <section className="space-y-4">
        <h2 className="font-mono text-xl font-black tracking-wider text-stone-500 uppercase">
          ESTADOS DO DADO — TINTA · ACENTO · PROFUNDO
        </h2>

        <div className="shadow-brutal space-y-6 rounded-lg border-2 border-black bg-white p-6">
          {DATA_STATES.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 items-center gap-4 border-b border-stone-100 pb-6 last:border-0 last:pb-0 md:grid-cols-12"
            >
              {/* Nome do Estado */}
              <div className="font-sans text-lg font-bold text-black md:col-span-3">
                {row.label}
              </div>

              {/* Grid das Cores (tint, accent, deep) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:col-span-9">
                {/* TINT */}
                <div
                  className={`shadow-brutal-sm flex h-18 flex-col justify-between rounded-lg border-2 border-black p-4 ${row.tint.textColor}`}
                  style={{ backgroundColor: row.tint.variable }}
                >
                  <span className="font-mono text-xs font-bold tracking-wider uppercase">
                    {row.tint.label}
                  </span>
                  <span className="font-mono text-sm font-black uppercase">
                    {row.tint.hex}
                  </span>
                </div>

                {/* ACCENT */}
                <div
                  className={`shadow-brutal-sm flex h-18 flex-col justify-between rounded-lg border-2 border-black p-4 ${row.accent.textColor}`}
                  style={{ backgroundColor: row.accent.variable }}
                >
                  <span className="font-mono text-xs font-bold tracking-wider uppercase">
                    {row.accent.label}
                  </span>
                  <span className="font-mono text-sm font-black uppercase">
                    {row.accent.hex}
                  </span>
                </div>

                {/* DEEP */}
                <div
                  className={`shadow-brutal-sm flex h-18 flex-col justify-between rounded-lg border-2 border-black p-4 ${row.deep.textColor}`}
                  style={{ backgroundColor: row.deep.variable }}
                >
                  <span className="font-mono text-xs font-bold tracking-wider uppercase">
                    {row.deep.label}
                  </span>
                  <span className="font-mono text-sm font-black uppercase">
                    {row.deep.hex}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ESTRUTURA E TIPOGRAFIA */}
      <section className="space-y-4">
        <h2 className="font-mono text-xl font-black tracking-wider text-stone-500 uppercase">
          ESTRUTURA & TIPOGRAFIA
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {ESTRUTURA_TOKENS.map((token) => (
            <div
              key={token.variable}
              className="shadow-brutal-sm hover:shadow-brutal flex flex-col justify-between rounded-lg border-2 border-black bg-white p-4 transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <div>
                <div
                  className="relative mb-4 h-16 w-full rounded border-2 border-black"
                  style={{ backgroundColor: token.variable }}
                >
                  <span className="absolute right-2 bottom-2 border border-white bg-black px-2 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
                    {token.hex}
                  </span>
                </div>
                <h3 className="mb-1 text-base font-extrabold text-black">
                  {token.name}
                </h3>
                <code className="mb-2 block w-fit rounded border border-stone-200 bg-stone-50 px-1 py-0.5 text-xs font-semibold break-all text-rose-600">
                  {token.variable}
                </code>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone-600">
                {token.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ESPECTRO DE MARCA */}
      <section className="space-y-4">
        <h2 className="font-mono text-xl font-black tracking-wider text-stone-500 uppercase">
          ESPECTRO (ASSINATURA DE MARCA)
        </h2>
        <p className="text-sm font-medium text-stone-600">
          Régua fina arco-íris representando a neurodivergência. Usada
          exclusivamente para fins institucionais e identidade de marca (nunca
          em botões ou status).
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {ESPECTRO_TOKENS.map((token) => (
            <div
              key={token.variable}
              className="shadow-brutal-sm overflow-hidden rounded-lg border-2 border-black bg-white"
            >
              <div
                className="h-8 w-full border-b border-black"
                style={{ backgroundColor: token.variable }}
              />
              <div className="p-3">
                <span className="block truncate font-mono text-xs font-bold text-black">
                  {token.name}
                </span>
                <span className="block font-mono text-[10px] text-stone-400 uppercase">
                  {token.hex}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DO'S & DON'TS */}
      <section className="space-y-4 border-t-2 border-dashed border-stone-200 pt-6">
        <h2 className="font-mono text-2xl font-black tracking-wider text-black uppercase">
          Do&apos;s &amp; Don&apos;ts (Boas Práticas de Cores)
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* DO */}
          <div className="shadow-brutal-sm rounded-lg border-2 border-black bg-emerald-50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="border-2 border-black bg-emerald-500 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase shadow-[1px_1px_0_0_#000000]">
                DO (SIM)
              </span>
              <h3 className="text-lg font-black text-emerald-950">
                Práticas Recomendadas
              </h3>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-sm text-emerald-900">
              <li>
                <strong>Contraste Seguro na Cor Primária:</strong> Use sempre{" "}
                <code>ink.anchor</code> (<code>#0A0A0A</code>) ou{" "}
                <code>Heading Text</code> sobre fundos{" "}
                <code>brand.primary</code> (amarelo).
              </li>
              <li>
                <strong>Tríade de Estados:</strong> Utilize a estrutura
                semântica <code>Tint</code> (fundo), <code>Accent</code>{" "}
                (borda/detalhe) e <code>Deep</code> (texto) para representar
                estados de dados clínicos.
              </li>
              <li>
                <strong>Redundância Visual:</strong> Combine cor com ícones e
                rótulos textuais para que o significado nunca dependa apenas da
                cor.
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-between rounded border border-emerald-300 bg-white p-3 text-xs">
              <span className="font-bold text-emerald-950">
                Exemplo Correto:
              </span>
              <div className="rounded border border-black bg-[#F2B705] px-3 py-1 font-mono font-bold text-[#0A0A0A]">
                Texto Escuro no Amarelo (OK)
              </div>
            </div>
          </div>

          {/* DON'T */}
          <div className="shadow-brutal-sm rounded-lg border-2 border-black bg-rose-50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="border-2 border-black bg-rose-500 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase shadow-[1px_1px_0_0_#000000]">
                DON&apos;T (NÃO)
              </span>
              <h3 className="text-lg font-black text-rose-950">
                Práticas Proibidas
              </h3>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-sm text-rose-900">
              <li>
                <strong>Texto Claro no Amarelo:</strong> Nunca utilize texto
                branco (<code>#FFFFFF</code>) ou tons claros sobre fundos{" "}
                <code>brand.primary</code>. A acessibilidade WCAG falha
                severamente.
              </li>
              <li>
                <strong>Spectrum como Chrome:</strong> Nunca aplique as cores da
                régua <code>Spectrum</code> em botões ou status badges
                interativos, pois gera confusão e ruído visual.
              </li>
              <li>
                <strong>Cores Puras para Status:</strong> Evite utilizar
                vermelho ou verde puro de alta saturação sem mitigação
                estrutural (como hachuras ou bordas diferenciadas).
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-between rounded border border-rose-300 bg-white p-3 text-xs">
              <span className="font-bold text-rose-950">
                Exemplo Incorreto:
              </span>
              <div className="rounded border border-black bg-[#F2B705] px-3 py-1 font-mono font-bold text-white line-through opacity-70">
                Texto Branco no Amarelo (FALHA)
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
};
