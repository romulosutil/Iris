import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "02. FOUNDATIONS/Spacing & Borders",
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

const BORDER_RADIUS_ITEMS = [
  {
    name: "None (0px)",
    token: "--radius-none",
    className: "rounded-none",
    px: "0px",
    description: "Bordas retas sem raio.",
  },
  {
    name: "XS (3px)",
    token: "--radius-xs",
    className: "rounded-[var(--radius-xs)]",
    px: "3px",
    description: "Micro-chips e indicadores pontuais.",
  },
  {
    name: "SM (4px)",
    token: "--radius-sm",
    className: "rounded-[var(--radius-sm)]",
    px: "4px",
    description: "Badges compactos e sub-elementos.",
  },
  {
    name: "Control (5px)",
    token: "--radius-control",
    className: "rounded-[var(--radius-control)]",
    px: "5px",
    description: "Inputs, botões e controles interativos.",
  },
  {
    name: "MD (6px - Surface Default)",
    token: "--radius-md",
    className: "rounded-[var(--radius-md)]",
    px: "6px",
    description: "Fator de forma padrão das superfícies e cards.",
  },
  {
    name: "LG (8px)",
    token: "--radius-lg",
    className: "rounded-[var(--radius-lg)]",
    px: "8px",
    description: "Containers de destaque e diálogos internos.",
  },
  {
    name: "XL (10px)",
    token: "--radius-xl",
    className: "rounded-[var(--radius-xl)]",
    px: "10px",
    description: "Painéis e modais.",
  },
  {
    name: "2XL (12px)",
    token: "--radius-2xl",
    className: "rounded-[var(--radius-2xl)]",
    px: "12px",
    description: "Overlays de grande escala.",
  },
  {
    name: "Pill (999px)",
    token: "--radius-pill",
    className: "rounded-[var(--radius-pill)]",
    px: "999px",
    description: "Formato pílula/circular.",
  },
];

const ELEVATIONS = [
  {
    name: "Raise Sutil (Nível 1)",
    variable: "--elevation-1",
    utility: "shadow-[var(--elevation-1)]",
    className: "shadow-[var(--elevation-1)]",
    description:
      "Elevação sutil (2px dura). Usada para micro-cards e elevações secundárias.",
  },
  {
    name: "Base Mode-Aware (Nível 2 / --ds-shadow)",
    variable: "--ds-shadow",
    utility: "shadow-[var(--ds-shadow)]",
    className: "shadow-[var(--ds-shadow)]",
    description:
      "Sombra base dura neobrutalista (4px modo Clínico / 2px modo Família).",
  },
  {
    name: "Hover Peak (Nível 3 / --ds-shadow-hover)",
    variable: "--ds-shadow-hover",
    utility: "shadow-[var(--ds-shadow-hover)]",
    className:
      "shadow-[var(--ds-shadow-hover)] -translate-x-0.5 -translate-y-0.5",
    description:
      "Elevação máxima no hover com deslocamento mecânico (+1 nível).",
  },
  {
    name: "Inset Shadow (IA / Tentativo)",
    variable: "--elevation-inset",
    utility: "shadow-[var(--elevation-inset)]",
    className: "shadow-[var(--elevation-inset)]",
    description:
      "Sombra interna que AFUNDA o card. Assinatura visual de dados sugeridos pela IA.",
  },
  {
    name: "Overlay Shadow (Modais/Popovers)",
    variable: "--elevation-overlay",
    utility: "shadow-[var(--elevation-overlay)]",
    className: "shadow-[var(--elevation-overlay)]",
    description:
      "Sombra suave de sobreposição para diálogos flutuantes e modais.",
  },
];

const CONTROL_HEIGHTS = [
  {
    name: "Control Small (--control-sm)",
    variable: "var(--control-sm)",
    px: "44px",
    description: "Piso absoluto para alvo de toque no mobile (WCAG 2.5.5).",
  },
  {
    name: "Control Medium (--control-md)",
    variable: "var(--control-md)",
    px: "48px",
    description:
      "Altura padrão para a maioria dos inputs, botões secundários e controles de UI.",
  },
  {
    name: "Control Large (--control-lg)",
    variable: "var(--control-lg)",
    px: "56px",
    description:
      "Altura generosa para formulários e botões de chamada primária principais.",
  },
];

export const Spacing: StoryObj = {
  render: () => (
    <div className="max-w-6xl space-y-12 font-sans text-stone-900">
      <div className="shadow-brutal relative overflow-hidden border-4 border-black bg-[#F2B705] p-8">
        <h1 className="font-mono text-4xl font-black tracking-tight text-black uppercase md:text-5xl">
          Espaçamento, Bordas & Elevação
        </h1>
        <p className="mt-4 max-w-3xl text-lg font-bold text-black md:text-xl">
          Design System Espectro Brutal — Grade de espaçamento base 4px, escala
          de raio de bordas, alturas de controle e física de elevação
          (surface.ts).
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Espaçamento */}
        <section className="shadow-brutal flex flex-col justify-between border-2 border-black bg-white p-6 md:p-8">
          <div>
            <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
              Escala de Espaçamento
            </h2>
            <div className="space-y-4">
              {SPACING_ITEMS.map((item) => (
                <div key={item.token} className="flex items-center text-sm">
                  <div className="w-20 shrink-0 font-mono font-bold">
                    p-{item.token}{" "}
                    <span className="text-xs font-normal text-stone-400">
                      ({item.px}px)
                    </span>
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded border border-stone-200 bg-stone-100">
                    <div
                      className="h-full border-r border-black bg-yellow-400"
                      style={{ width: `${item.px * 2}px`, maxWidth: "100%" }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right font-mono text-xs font-bold text-stone-500">
                    {item.rem}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 border-t border-stone-200 pt-4 text-xs leading-relaxed font-medium text-stone-600">
            A escala é baseada no multiplicador de 4px (0.25rem). Recomendado
            usar paddings e gaps simétricos para manter o alinhamento da grade
            brutalista.
          </p>
        </section>

        {/* Alturas de Controle */}
        <section className="shadow-brutal flex flex-col justify-between border-2 border-black bg-white p-6 md:p-8">
          <div>
            <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
              Alvos de Toque (Heights)
            </h2>
            <p className="mb-6 text-sm font-medium text-stone-600">
              Alturas de componentes interativos tokenizadas para garantir
              ergonomia perfeita e target size seguro de toque no mobile.
            </p>
            <div className="space-y-6">
              {CONTROL_HEIGHTS.map((control) => (
                <div key={control.name} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <h3 className="font-extrabold">{control.name}</h3>
                    <span className="font-mono text-xs font-bold text-stone-500">
                      {control.px} ({control.variable})
                    </span>
                  </div>
                  <div
                    className="shadow-brutal-sm flex items-center border-2 border-black bg-[#E0F2F1] px-4 font-mono text-sm font-bold text-[#004D40]"
                    style={{ height: control.variable }}
                  >
                    Alvo de Toque: {control.px}
                  </div>
                  <p className="text-xs leading-relaxed text-stone-500">
                    {control.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 border-t border-stone-200 pt-4 text-xs leading-relaxed font-medium text-stone-600">
            * O Modo Clínico segue estritamente a diretriz mobile-first de toque
            mínimo de 44px (control-sm) para permitir o uso ágil por terapeutas
            em corredores de clínicas.
          </p>
        </section>
      </div>

      {/* Rampa de Border Radius */}
      <section className="shadow-brutal border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Rampa de Bordas &amp; Raio (Border Radius)
        </h2>
        <p className="mb-8 max-w-3xl text-sm font-medium text-stone-600">
          A rampa de border-radius suaviza os cantos neobrutalistas sem perder o
          peso da borda sólida (1.5px / 2px). As superfícies padrão nascem com{" "}
          <code>--radius-md</code> (6px).
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BORDER_RADIUS_ITEMS.map((item) => (
            <div
              key={item.token}
              className="shadow-brutal-sm flex flex-col justify-between rounded-lg border-2 border-black bg-stone-50 p-4"
            >
              <div>
                <div
                  className={`h-16 w-full border-2 border-black bg-white ${item.className} mb-3 flex items-center justify-center font-mono text-xs font-bold`}
                >
                  {item.px}
                </div>
                <h3 className="text-sm font-extrabold text-black">
                  {item.name}
                </h3>
                <code className="my-1 block max-w-max rounded border border-stone-200 bg-stone-100 px-1 font-mono text-[10px] font-bold text-rose-600">
                  {item.token}
                </code>
              </div>
              <p className="mt-2 border-t border-stone-200 pt-2 text-xs text-stone-600">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Sombras e Elevações */}
      <section className="shadow-brutal border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Elevação & Sombras (Neo-Brutalismo)
        </h2>
        <p className="mb-8 max-w-3xl text-sm font-medium text-stone-600">
          Ao contrário do design clássico com sombras difusas (soft shadows), o
          Espectro Brutal utiliza sombras projetadas 100% rígidas (sem blur),
          com deslocamento mecânico direto dos botões e cards no clique.
        </p>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ELEVATIONS.map((shadow) => (
            <div
              key={shadow.name}
              className="shadow-brutal-sm flex flex-col justify-between border-2 border-black bg-stone-50 p-6"
            >
              <div>
                <div
                  className={`flex h-24 w-full items-center justify-center border-2 border-black bg-white font-mono text-xs font-extrabold uppercase ${shadow.className} mb-6 transition-all duration-150`}
                >
                  Elevado
                </div>
                <h3 className="mb-1 text-base font-extrabold">{shadow.name}</h3>
                <div className="mb-3 flex flex-col gap-1">
                  <code className="block max-w-max rounded border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
                    var({shadow.variable})
                  </code>
                  <code className="block max-w-max rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                    {shadow.utility}
                  </code>
                </div>
              </div>
              <p className="border-t border-stone-200 pt-3 text-xs leading-relaxed text-stone-600">
                {shadow.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* DO'S & DON'TS DE ESPAÇAMENTO E BORDAS */}
      <section className="space-y-4 border-t-2 border-dashed border-stone-200 pt-6">
        <h2 className="font-mono text-2xl font-black tracking-wider text-black uppercase">
          Do&apos;s &amp; Don&apos;ts (Espaçamento &amp; Bordas)
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* DO */}
          <div className="shadow-brutal-sm rounded-lg border-2 border-black bg-emerald-50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="border-2 border-black bg-emerald-500 px-2.5 py-1 font-mono text-xs font-bold text-white uppercase shadow-[1px_1px_0_0_#000000]">
                DO (SIM)
              </span>
              <h3 className="text-lg font-black text-emerald-950">
                Alinhamento Modular
              </h3>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-sm text-emerald-900">
              <li>
                <strong>Uso da Escala de 4px/8px:</strong> Utilize
                exclusivamente classes utilitárias de espaçamento baseadas na
                escala (<code>p-1</code>, <code>p-2</code>, <code>p-4</code>,{" "}
                <code>p-6</code>, <code>p-8</code>).
              </li>
              <li>
                <strong>Borda Brutal Uniforme:</strong> Use a classe de borda
                brutalista nativa ou a variável{" "}
                <code>border-[length:var(--border-brutal-width)]</code> (2px)
                para manter a uniformidade de delineamento.
              </li>
              <li>
                <strong>Sombras Rígidas Físicas:</strong> Aplique{" "}
                <code>shadow-brutal</code> (Modo Clínico) ou{" "}
                <code>shadow-brutal-sm</code> (Modo Família) para refletir o
                nível correto de elevação mecânica.
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
                Desvios de Grade
              </h3>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-sm text-rose-900">
              <li>
                <strong>Valores Ad-Hoc/Arbitrários:</strong> Não use valores em
                pixel arbitrários nas classes de margin ou padding (ex:{" "}
                <code>p-[13px]</code>, <code>mt-[21px]</code>).
              </li>
              <li>
                <strong>Soft Shadows (Desfoque):</strong> Evite utilizar sombras
                clássicas do Tailwind (como <code>shadow-md</code> ou{" "}
                <code>shadow-lg</code>), pois elas quebram a consistência física
                e estética do design system.
              </li>
              <li>
                <strong>Bordas Arbitrárias:</strong> Evite definir larguras de
                borda cruas fora da escala (ex: <code>border-4</code> ou{" "}
                <code>border-[3px]</code>) em componentes de conteúdo comuns.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  ),
};
