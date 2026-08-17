import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "02. FOUNDATIONS/Typography",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type ScaleItem = {
  name: string;
  className: string;
  sizeDesc: string;
  sample: string;
};

const FAMILY_GROUPS = [
  {
    name: "Display Font (Títulos & Destaques)",
    fontFamily: "Space Grotesk",
    variable: "var(--font-display)",
    className: "font-display",
    description:
      "Fonte geométrica pesada de alta legibilidade para títulos e chamadas rápidas. Proibida em corpo de texto corrido ou abaixo de 20px.",
  },
  {
    name: "Body Font (Corpo de Texto & Controles)",
    fontFamily: "Plus Jakarta Sans",
    variable: "var(--font-body)",
    className: "font-body",
    description:
      "Fonte sans-serif limpa e moderna com letter-spacing levemente aumentado para máxima clareza em leituras apressadas ou em trânsito.",
  },
  {
    name: "Mono Font (Código & Rótulos de Dados)",
    fontFamily: "Space Mono",
    variable: "var(--font-mono)",
    className: "font-mono",
    description:
      "Fonte monoespaçada para exibição de dados estruturados, códigos de tokens, timestamps e metadados.",
  },
];

const SCALES: ScaleItem[] = [
  {
    name: "Display Hero",
    className: "text-5xl font-black font-display uppercase tracking-tight",
    sizeDesc: "48px / 3rem (Black)",
    sample: "Honestidade Epistêmica",
  },
  {
    name: "Heading 1 (H1)",
    className: "text-4xl font-black font-display uppercase tracking-tight",
    sizeDesc: "36px / 2.25rem (Black)",
    sample: "A IA nunca decide sozinha",
  },
  {
    name: "Heading 2 (H2)",
    className: "text-3xl font-extrabold font-display uppercase tracking-tight",
    sizeDesc: "30px / 1.875rem (Extrabold)",
    sample: "O diário clínico nunca se perde",
  },
  {
    name: "Heading 3 (H3)",
    className: "text-2xl font-bold font-display uppercase",
    sizeDesc: "24px / 1.5rem (Bold)",
    sample: "Candidato contra Conquistado",
  },
  {
    name: "Heading 4 (H4)",
    className: "text-xl font-bold font-display uppercase",
    sizeDesc: "20px / 1.25rem (Bold)",
    sample: "Acessibilidade é compromisso",
  },
  {
    name: "Heading 5 (H5)",
    className: "text-lg font-bold font-display uppercase",
    sizeDesc: "18px / 1.125rem (Bold)",
    sample: "Modo Clínico vs Modo Família",
  },
  {
    name: "Body Large",
    className: "text-lg font-semibold font-body",
    sizeDesc: "18px / 1.125rem (Semibold)",
    sample: "O terapeuta mobile-first opera no corredor com alta legibilidade.",
  },
  {
    name: "Body Regular",
    className: "text-base font-normal font-body",
    sizeDesc: "16px / 1rem (Normal)",
    sample:
      "Selo persistente do estado do dado clínico. 'Sugerida' nunca se parece com um fato consolidado.",
  },
  {
    name: "Body Medium/Bold (Controles)",
    className: "text-base font-bold font-body",
    sizeDesc: "16px / 1rem (Bold)",
    sample: "Aprovar sessão de terapia",
  },
  {
    name: "Body Small / Caption",
    className: "text-xs font-medium font-body text-stone-500",
    sizeDesc: "12px / 0.75rem (Medium)",
    sample: "O áudio não foi enviado — toque para tentar de novo.",
  },
  {
    name: "Code Block",
    className:
      "text-xs font-mono bg-stone-100 p-1 border border-stone-200 block max-w-max rounded",
    sizeDesc: "12px / 0.75rem (Mono)",
    sample: "--ds-shadow: var(--shadow-brutal);",
  },
];

export const Scales: StoryObj = {
  render: () => (
    <div className="max-w-6xl space-y-12 font-sans text-stone-900">
      <div className="shadow-brutal relative overflow-hidden border-4 border-black bg-[#F2B705] p-8">
        <h1 className="font-mono text-4xl font-black tracking-tight text-black uppercase md:text-5xl">
          Tipografia & Escala
        </h1>
        <p className="mt-4 max-w-3xl text-lg font-bold text-black md:text-xl">
          Design System Espectro Brutal — Famílias tipográficas, escalas de
          tamanhos e regras ergonômicas de legibilidade.
        </p>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        {FAMILY_GROUPS.map((family) => (
          <section
            key={family.name}
            className="shadow-brutal border-2 border-black bg-white p-6"
          >
            <h2 className="mb-4 border-b-2 border-black pb-2 font-mono text-xl font-black uppercase">
              {family.name}
            </h2>
            <div className="space-y-4">
              <div>
                <span className="block font-mono text-xs font-bold text-stone-400 uppercase">
                  Família
                </span>
                <span className="text-xl font-extrabold">
                  {family.fontFamily}
                </span>
              </div>
              <div>
                <span className="block font-mono text-xs font-bold text-stone-400 uppercase">
                  CSS Token
                </span>
                <code className="rounded border border-stone-200 bg-stone-100 px-2 py-1 text-xs font-semibold text-rose-600">
                  {family.variable}
                </code>
              </div>
              <p className="text-sm leading-relaxed font-medium text-stone-600">
                {family.description}
              </p>
              <div
                className={`mt-4 rounded border border-black bg-stone-50 p-4 ${family.className}`}
              >
                <div className="mb-1 text-3xl font-black">ABCDEFGHIJKLM</div>
                <div className="text-3xl font-normal">abcdefghijklm</div>
                <div className="text-3xl font-light">1234567890!?@</div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="shadow-brutal border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Rampa de Escala Visual (Font Scales)
        </h2>
        <div className="divide-y-2 divide-stone-200">
          {SCALES.map((scale) => (
            <div
              key={scale.name}
              className="flex flex-col justify-between gap-4 py-6 first:pt-0 last:pb-0 lg:flex-row lg:items-center"
            >
              <div className="lg:w-1/4">
                <h3 className="text-lg font-extrabold text-black">
                  {scale.name}
                </h3>
                <span className="mt-1 block font-mono text-xs font-bold text-stone-500 uppercase">
                  {scale.sizeDesc}
                </span>
                <code className="mt-2 inline-block rounded border border-stone-200 bg-stone-50 px-1 text-[10px] font-bold text-rose-600">
                  {scale.className}
                </code>
              </div>
              <div className="rounded border border-stone-200 bg-stone-50 p-4 lg:w-3/4">
                <div className={scale.className}>{scale.sample}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DO'S & DON'TS DE TIPOGRAFIA */}
      <section className="space-y-4 border-t-2 border-dashed border-stone-200 pt-6">
        <h2 className="font-mono text-2xl font-black tracking-wider text-black uppercase">
          Do&apos;s &amp; Don&apos;ts (Tipografia &amp; Hierarquia)
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* DO */}
          <div className="shadow-brutal-sm rounded-lg border-2 border-black bg-emerald-50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="border-2 border-black bg-emerald-500 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase shadow-[1px_1px_0_0_#000000]">
                DO (SIM)
              </span>
              <h3 className="text-lg font-black text-emerald-950">
                Hierarquia Clara
              </h3>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-sm text-emerald-900">
              <li>
                <strong>Display apenas para Títulos:</strong> Limite o uso de{" "}
                <code>font-display</code> (Space Grotesk) para títulos
                principais (headings) maiores que 20px.
              </li>
              <li>
                <strong>Body Sans para Leitura:</strong> Use a família{" "}
                <code>font-body</code> (Plus Jakarta Sans) para controles,
                labels, descrições e parágrafos.
              </li>
              <li>
                <strong>Letter-spacing Ergonômico:</strong> Preserve o
                espaçamento de caracteres (<code>letter-spacing: 0.01em</code>)
                nas descrições clínicas para otimizar a leitura rápida.
              </li>
            </ul>
          </div>

          {/* DON'T */}
          <div className="shadow-brutal-sm rounded-lg border-2 border-black bg-rose-50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="border-2 border-black bg-rose-500 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase shadow-[1px_1px_0_0_#000000]">
                DON&apos;T (NÃO)
              </span>
              <h3 className="text-lg font-black text-rose-950">
                Desvios de Legibilidade
              </h3>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-sm text-rose-900">
              <li>
                <strong>Display em Texto Corrido:</strong> Nunca use a fonte{" "}
                <code>font-display</code> para blocos explicativos ou
                parágrafos, pois o peso geométrico excessivo fadiga os olhos.
              </li>
              <li>
                <strong>Display Abaixo de 20px:</strong> Evite utilizar a fonte
                display em tamanhos pequenos de fonte (como 12px ou 14px), pois
                inviabiliza o escaneamento rápido.
              </li>
              <li>
                <strong>Copy Longa ou Ambígua:</strong> Evite parágrafos densos
                ou termos metafóricos/subjetivos na interface. Mantenha as
                frases curtas, literais e diretas.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  ),
};
