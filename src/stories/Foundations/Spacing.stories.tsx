import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "Foundations/Spacing & Borders",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type SpacingItem = {
  token: string;
  rem: string;
  px: number;
};

const SPACING_ITEMS: SpacingItem[] = [
  { token: "1", rem: "0.25rem", px: 4 },
  { token: "2", rem: "0.5rem", px: 8 },
  { token: "3", rem: "0.75rem", px: 12 },
  { token: "4", rem: "1rem", px: 16 },
  { token: "5", rem: "1.25rem", px: 20 },
  { token: "6", rem: "1.5rem", px: 24 },
  { token: "8", rem: "2rem", px: 32 },
  { token: "10", rem: "2.5rem", px: 40 },
  { token: "12", rem: "3rem", px: 48 },
  { token: "16", rem: "4rem", px: 64 },
];

const ELEVATIONS = [
  {
    name: "Standard Shadow (Modo Clínico)",
    variable: "--shadow-brutal",
    utility: "shadow-brutal",
    className: "shadow-brutal",
    description: "Sombra dura sem desfoque (4px). Assinatura visual neobrutalista para cards e botões no Modo Clínico.",
  },
  {
    name: "Medium Shadow (Modo Família)",
    variable: "--shadow-brutal-sm",
    utility: "shadow-brutal-sm",
    className: "shadow-brutal-sm",
    description: "Sombra dura reduzida (2px). Usada no Modo Família para atenuar a aspereza visual.",
  },
  {
    name: "Hover Shadow",
    variable: "--shadow-brutal-hover",
    utility: "shadow-brutal-hover",
    className: "shadow-brutal-hover -translate-x-0.5 -translate-y-0.5",
    description: "Sombra dura expandida (6px) com deslocamento negativo para simular elevação ao pairar.",
  },
  {
    name: "Suggested Inset Shadow (IA)",
    variable: "--shadow-brutal-inset",
    utility: "shadow-brutal-inset",
    className: "shadow-brutal-inset translate-x-1 translate-y-1",
    description: "Sombra interna invertida (-4px). Representa o estado 'afundado' ou 'tentativo' de sugestões da IA.",
  },
];

const CONTROL_HEIGHTS = [
  { name: "Control Small (--control-sm)", variable: "var(--control-sm)", px: "44px", description: "Piso absoluto para alvo de toque no mobile (WCAG 2.5.5)." },
  { name: "Control Medium (--control-md)", variable: "var(--control-md)", px: "48px", description: "Altura padrão para a maioria dos inputs, botões secundários e controles de UI." },
  { name: "Control Large (--control-lg)", variable: "var(--control-lg)", px: "56px", description: "Altura generosa para formulários e botões de chamada primária principais." },
];

export const Spacing: StoryObj = {
  render: () => (
    <div className="space-y-12 max-w-6xl font-sans text-stone-900">
      <div className="border-4 border-black p-8 bg-[#F2B705] shadow-brutal relative overflow-hidden">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-black font-mono">
          Espaçamento, Bordas & Elevação
        </h1>
        <p className="mt-4 text-lg md:text-xl font-bold max-w-3xl text-black">
          Design System Espectro Brutal — Grade de espaçamento base 4px, alturas de controle mobile-friendly e física neobrutalista de sombras.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Espaçamento */}
        <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-black border-b-2 border-black pb-2 mb-6 uppercase font-mono">
              Escala de Espaçamento
            </h2>
            <div className="space-y-4">
              {SPACING_ITEMS.map((item) => (
                <div key={item.token} className="flex items-center text-sm">
                  <div className="w-20 shrink-0 font-bold font-mono">
                    p-{item.token} <span className="text-stone-400 text-xs font-normal">({item.px}px)</span>
                  </div>
                  <div className="flex-1 bg-stone-100 border border-stone-200 h-6 relative rounded overflow-hidden">
                    <div 
                      className="bg-yellow-400 h-full border-r border-black" 
                      style={{ width: `${item.px * 2}px`, maxWidth: "100%" }}
                    />
                  </div>
                  <div className="w-16 text-right font-mono text-stone-500 font-bold text-xs shrink-0">
                    {item.rem}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-stone-600 text-xs font-medium leading-relaxed mt-6 pt-4 border-t border-stone-200">
            A escala é baseada no multiplicador de 4px (0.25rem). Recomendado usar paddings e gaps simétricos para manter o alinhamento da grade brutalista.
          </p>
        </section>

        {/* Alturas de Controle */}
        <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-black border-b-2 border-black pb-2 mb-6 uppercase font-mono">
              Alvos de Toque (Heights)
            </h2>
            <p className="text-stone-600 text-sm font-medium mb-6">
              Alturas de componentes interativos tokenizadas para garantir ergonomia perfeita e target size seguro de toque no mobile.
            </p>
            <div className="space-y-6">
              {CONTROL_HEIGHTS.map((control) => (
                <div key={control.name} className="flex flex-col gap-2">
                  <div className="flex justify-between items-baseline text-sm">
                    <h3 className="font-extrabold">{control.name}</h3>
                    <span className="font-mono text-stone-500 text-xs font-bold">{control.px} ({control.variable})</span>
                  </div>
                  <div 
                    className="border-2 border-black bg-[#E0F2F1] text-[#004D40] flex items-center px-4 font-mono font-bold text-sm shadow-brutal-sm"
                    style={{ height: control.variable }}
                  >
                    Alvo de Toque: {control.px}
                  </div>
                  <p className="text-stone-500 text-xs leading-relaxed">
                    {control.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-stone-600 text-xs font-medium leading-relaxed mt-6 pt-4 border-t border-stone-200">
            * O Modo Clínico segue estritamente a diretriz mobile-first de toque mínimo de 44px (control-sm) para permitir o uso ágil por terapeutas em corredores de clínicas.
          </p>
        </section>
      </div>

      {/* Sombras e Elevações */}
      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal">
        <h2 className="text-2xl font-black border-b-2 border-black pb-2 mb-6 uppercase font-mono">
          Elevação & Sombras (Neo-Brutalismo)
        </h2>
        <p className="text-stone-600 text-sm font-medium mb-8 max-w-3xl">
          Ao contrário do design clássico com sombras difusas (soft shadows), o Espectro Brutal utiliza sombras projetadas 100% rígidas (sem blur), com deslocamento mecânico direto dos botões e cards no clique.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {ELEVATIONS.map((shadow) => (
            <div 
              key={shadow.name} 
              className="border-2 border-black p-6 flex flex-col justify-between bg-stone-50 shadow-brutal-sm"
            >
              <div>
                <div className={`w-full h-24 bg-white border-2 border-black flex items-center justify-center font-mono font-extrabold text-xs uppercase ${shadow.className} mb-6 transition-all duration-150`}>
                  Elevado
                </div>
                <h3 className="font-extrabold text-base mb-1">{shadow.name}</h3>
                <div className="flex flex-col gap-1 mb-3">
                  <code className="text-[10px] text-stone-500 font-bold bg-stone-100 px-1.5 py-0.5 border border-stone-200 rounded block max-w-max">
                    var({shadow.variable})
                  </code>
                  <code className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 border border-rose-200 rounded block max-w-max">
                    {shadow.utility}
                  </code>
                </div>
              </div>
              <p className="text-stone-600 text-xs leading-relaxed border-t border-stone-200 pt-3">
                {shadow.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* DO'S & DON'TS DE ESPAÇAMENTO E BORDAS */}
      <section className="space-y-4 pt-6 border-t-2 border-dashed border-stone-200">
        <h2 className="text-2xl font-black font-mono text-black uppercase tracking-wider">
          Do's & Don'ts (Espaçamento & Bordas)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* DO */}
          <div className="border-2 border-black rounded-lg p-6 bg-emerald-50 shadow-brutal-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-emerald-500 text-white font-mono font-bold text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[1px_1px_0_0_#000000]">
                DO (SIM)
              </span>
              <h3 className="text-lg font-black text-emerald-950">Alinhamento Modular</h3>
            </div>
            <ul className="space-y-3 text-emerald-900 text-sm list-disc pl-5">
              <li>
                <strong>Uso da Escala de 4px/8px:</strong> Utilize exclusivamente classes utilitárias de espaçamento baseadas na escala (<code>p-1</code>, <code>p-2</code>, <code>p-4</code>, <code>p-6</code>, <code>p-8</code>).
              </li>
              <li>
                <strong>Borda Brutal Uniforme:</strong> Use a classe de borda brutalista nativa ou a variável <code>border-[length:var(--border-brutal)]</code> (1.5px) para manter a uniformidade de delineamento.
              </li>
              <li>
                <strong>Sombras Rígidas Físicas:</strong> Aplique <code>shadow-brutal</code> (Modo Clínico) ou <code>shadow-brutal-sm</code> (Modo Família) para refletir o nível correto de elevação mecânica.
              </li>
            </ul>
          </div>

          {/* DON'T */}
          <div className="border-2 border-black rounded-lg p-6 bg-rose-50 shadow-brutal-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-rose-500 text-white font-mono font-bold text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[1px_1px_0_0_#000000]">
                DON'T (NÃO)
              </span>
              <h3 className="text-lg font-black text-rose-950">Desvios de Grade</h3>
            </div>
            <ul className="space-y-3 text-rose-900 text-sm list-disc pl-5">
              <li>
                <strong>Valores Ad-Hoc/Arbitrários:</strong> Não use valores em pixel arbitrários nas classes de margin ou padding (ex: <code>p-[13px]</code>, <code>mt-[21px]</code>).
              </li>
              <li>
                <strong>Soft Shadows (Desfoque):</strong> Evite utilizar sombras clássicas do Tailwind (como <code>shadow-md</code> ou <code>shadow-lg</code>), pois elas quebram a consistência física e estética do design system.
              </li>
              <li>
                <strong>Bordas Arbitrárias:</strong> Evite definir larguras de borda cruas fora da escala (ex: <code>border-4</code> ou <code>border-[3px]</code>) em componentes de conteúdo comuns.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  ),
};
