import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "Foundations/Typography",
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
    fontFamily: "Space Grotesk / Archivo Black",
    variable: "var(--font-display)",
    className: "font-display",
    description: "Fonte geométrica pesada de alta legibilidade para títulos e chamadas rápidas. Proibida em corpo de texto corrido ou abaixo de 20px.",
  },
  {
    name: "Body Font (Corpo de Texto & Controles)",
    fontFamily: "Plus Jakarta Sans / Inter",
    variable: "var(--font-body)",
    className: "font-body",
    description: "Fonte sans-serif limpa e moderna com letter-spacing levemente aumentado para máxima clareza em leituras apressadas ou em trânsito.",
  },
];

const SCALES: ScaleItem[] = [
  { name: "Display Hero", className: "text-5xl font-black font-display uppercase tracking-tight", sizeDesc: "48px / 3rem (Black)", sample: "Honestidade Epistêmica" },
  { name: "Heading 1 (H1)", className: "text-4xl font-black font-display uppercase tracking-tight", sizeDesc: "36px / 2.25rem (Black)", sample: "A IA nunca decide sozinha" },
  { name: "Heading 2 (H2)", className: "text-3xl font-extrabold font-display uppercase tracking-tight", sizeDesc: "30px / 1.875rem (Extrabold)", sample: "O diário clínico nunca se perde" },
  { name: "Heading 3 (H3)", className: "text-2xl font-bold font-display uppercase", sizeDesc: "24px / 1.5rem (Bold)", sample: "Candidato contra Conquistado" },
  { name: "Heading 4 (H4)", className: "text-xl font-bold font-display uppercase", sizeDesc: "20px / 1.25rem (Bold)", sample: "Acessibilidade é compromisso" },
  { name: "Heading 5 (H5)", className: "text-lg font-bold font-display uppercase", sizeDesc: "18px / 1.125rem (Bold)", sample: "Modo Clínico vs Modo Família" },
  { name: "Body Large", className: "text-lg font-semibold font-body", sizeDesc: "18px / 1.125rem (Semibold)", sample: "O terapeuta mobile-first opera no corredor com alta legibilidade." },
  { name: "Body Regular", className: "text-base font-normal font-body", sizeDesc: "16px / 1rem (Normal)", sample: "Selo persistente do estado do dado clínico. 'Sugerida' nunca se parece com um fato consolidado." },
  { name: "Body Medium/Bold (Controles)", className: "text-base font-bold font-body", sizeDesc: "16px / 1rem (Bold)", sample: "Aprovar sessão de terapia" },
  { name: "Body Small / Caption", className: "text-xs font-medium font-body text-stone-500", sizeDesc: "12px / 0.75rem (Medium)", sample: "O áudio não foi enviado — toque para tentar de novo." },
  { name: "Code Block", className: "text-xs font-mono bg-stone-100 p-1 border border-stone-200 block max-w-max rounded", sizeDesc: "12px / 0.75rem (Mono)", sample: "--ds-shadow: var(--shadow-brutal);" },
];

export const Scales: StoryObj = {
  render: () => (
    <div className="space-y-12 max-w-6xl font-sans text-stone-900">
      <div className="border-4 border-black p-8 bg-[#F2B705] shadow-brutal relative overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black font-mono">
          Tipografia & Escala
        </h1>
        <p className="mt-4 text-lg md:text-xl font-bold max-w-3xl text-black">
          Design System Espectro Brutal — Famílias tipográficas, escalas de tamanhos e regras ergonômicas de legibilidade.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mt-12">
        {FAMILY_GROUPS.map((family) => (
          <section key={family.name} className="border-2 border-black bg-white p-6 shadow-brutal">
            <h2 className="text-xl font-black border-b-2 border-black pb-2 mb-4 uppercase font-mono">
              {family.name}
            </h2>
            <div className="space-y-4">
              <div>
                <span className="text-stone-400 text-xs font-bold uppercase font-mono block">Família</span>
                <span className="text-xl font-extrabold">{family.fontFamily}</span>
              </div>
              <div>
                <span className="text-stone-400 text-xs font-bold uppercase font-mono block">CSS Token</span>
                <code className="text-xs text-rose-600 font-semibold bg-stone-100 px-2 py-1 border border-stone-200 rounded">
                  {family.variable}
                </code>
              </div>
              <p className="text-stone-600 text-sm font-medium leading-relaxed">
                {family.description}
              </p>
              <div className={`p-4 border border-black bg-stone-50 rounded mt-4 ${family.className}`}>
                <div className="text-3xl font-black mb-1">ABCDEFGHIJKLM</div>
                <div className="text-3xl font-normal">abcdefghijklm</div>
                <div className="text-3xl font-light">1234567890!?@</div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal">
        <h2 className="text-2xl font-black border-b-2 border-black pb-2 mb-6 uppercase font-mono">
          Rampa de Escala Visual (Font Scales)
        </h2>
        <div className="divide-y-2 divide-stone-200">
          {SCALES.map((scale) => (
            <div key={scale.name} className="py-6 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="lg:w-1/4">
                <h3 className="font-extrabold text-lg text-black">{scale.name}</h3>
                <span className="text-xs text-stone-500 font-bold uppercase font-mono block mt-1">
                  {scale.sizeDesc}
                </span>
                <code className="text-[10px] text-rose-600 font-bold bg-stone-50 px-1 border border-stone-200 rounded mt-2 inline-block">
                  {scale.className}
                </code>
              </div>
              <div className="lg:w-3/4 bg-stone-50 p-4 border border-stone-200 rounded">
                <div className={scale.className}>
                  {scale.sample}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DO'S & DON'TS DE TIPOGRAFIA */}
      <section className="space-y-4 pt-6 border-t-2 border-dashed border-stone-200">
        <h2 className="text-2xl font-black font-mono text-black uppercase tracking-wider">
          Do&apos;s &amp; Don&apos;ts (Tipografia &amp; Hierarquia)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* DO */}
          <div className="border-2 border-black rounded-lg p-6 bg-emerald-50 shadow-brutal-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-emerald-500 text-white font-mono font-bold text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[1px_1px_0_0_#000000]">
                DO (SIM)
              </span>
              <h3 className="text-lg font-black text-emerald-950">Hierarquia Clara</h3>
            </div>
            <ul className="space-y-3 text-emerald-900 text-sm list-disc pl-5">
              <li>
                <strong>Display apenas para Títulos:</strong> Limite o uso de <code>font-display</code> (Space Grotesk) para títulos principais (headings) maiores que 20px.
              </li>
              <li>
                <strong>Body Sans para Leitura:</strong> Use a família <code>font-body</code> (Plus Jakarta Sans) para controles, labels, descrições e parágrafos.
              </li>
              <li>
                <strong>Letter-spacing Ergonômico:</strong> Preserve o espaçamento de caracteres (<code>letter-spacing: 0.01em</code>) nas descrições clínicas para otimizar a leitura rápida.
              </li>
            </ul>
          </div>

          {/* DON'T */}
          <div className="border-2 border-black rounded-lg p-6 bg-rose-50 shadow-brutal-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-rose-500 text-white font-mono font-bold text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[1px_1px_0_0_#000000]">
                DON&apos;T (NÃO)
              </span>
              <h3 className="text-lg font-black text-rose-950">Desvios de Legibilidade</h3>
            </div>
            <ul className="space-y-3 text-rose-900 text-sm list-disc pl-5">
              <li>
                <strong>Display em Texto Corrido:</strong> Nunca use a fonte <code>font-display</code> para blocos explicativos ou parágrafos, pois o peso geométrico excessivo fadiga os olhos.
              </li>
              <li>
                <strong>Display Abaixo de 20px:</strong> Evite utilizar a fonte display em tamanhos pequenos de fonte (como 12px ou 14px), pois inviabiliza o escaneamento rápido.
              </li>
              <li>
                <strong>Copy Longa ou Ambígua:</strong> Evite parágrafos densos ou termos metafóricos/subjetivos na interface. Mantenha as frases curtas, literais e diretas.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  ),
};
