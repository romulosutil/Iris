import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";
import { Logo } from "../../components/ui/logo";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";

const DS_VERSION = "0.1.0";
const DS_STATUS = "Alpha";

const meta = {
  title: "Intro/Welcome",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

// Helper para navegar no Storybook via API interna
function sbLink(storyId: string) {
  return `/?path=/story/${storyId}`;
}

const FOUNDATIONS = [
  { label: "Cores & Paleta",      icon: "🎨", id: "foundations-colors--palette" },
  { label: "Tipografia",          icon: "Aa", id: "foundations-typography--scales" },
  { label: "Espaçamento",         icon: "↔",  id: "foundations-spacing-borders--spacing" },
  { label: "Elevação & Sombras",  icon: "◻",  id: "foundations-spacing-borders--spacing" },
  { label: "Iconografia",         icon: "✦",  id: "foundations-icons--gallery" },
];

export const Introduction: StoryObj = {
  render: () => (
    <div className="max-w-4xl font-sans text-stone-900 space-y-12">

      {/* ── Hero Header ─────────────────────────────────────────────── */}
      <div className="border-4 border-black p-8 md:p-12 bg-[#F2B705] shadow-brutal relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-4 max-w-xl z-10">
          {/* Version badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="bg-black text-[#F2B705] font-mono font-bold text-xs uppercase px-3 py-1 border-2 border-black inline-block tracking-widest">
              Design System Core
            </span>
            <span className="bg-white text-black font-mono font-bold text-xs uppercase px-3 py-1 border-2 border-black inline-flex items-center gap-1.5 tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              v{DS_VERSION} · {DS_STATUS}
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight text-black font-mono">
            Espectro Brutal
          </h1>
          <p className="text-lg md:text-xl font-bold text-black leading-relaxed">
            O sistema de design honesto e transparente para a clínica Iris. A estética neobrutalista expondo a estrutura e integridade dos dados clínicos.
          </p>
        </div>
        <div className="shrink-0 bg-white p-4 border-2 border-black shadow-brutal max-w-max self-start md:self-auto">
          <Logo variante="marca" altura={80} tom="cor" animado={true} className="iris-animado" />
        </div>
      </div>

      {/* ── Status Bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center border-2 border-black bg-stone-50 p-3 shadow-brutal-sm font-mono text-xs font-bold">
        <span className="text-stone-400 uppercase tracking-widest">Status:</span>
        <span className="flex items-center gap-1.5 bg-amber-100 border border-amber-400 text-amber-700 px-2 py-0.5 rounded-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
          Alpha · Componentes primitivos estáveis
        </span>
        <span className="flex items-center gap-1.5 bg-green-50 border border-green-400 text-green-700 px-2 py-0.5 rounded-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Tailwind v4 · @theme tokens
        </span>
        <span className="flex items-center gap-1.5 bg-blue-50 border border-blue-400 text-blue-700 px-2 py-0.5 rounded-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          WCAG 2.2 AA target
        </span>
      </div>

      {/* ── Pillars Grid ────────────────────────────────────────────── */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="border-2 border-black p-6 bg-white shadow-brutal">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Honestidade Epistêmica
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Recusamo-nos a maquiar incertezas. A IA nunca decide sozinha. Todo dado sugerido tem indicação visual diferente (borda tracejada violeta) de dados aprovados por humanos (borda sólida).
          </p>
        </div>
        <div className="border-2 border-black p-6 bg-white shadow-brutal">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Ergonomia de Corredor
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Desenhado para terapeutas operando sob pressão de tempo e luz instável. Alvos de toque grandes (mínimo 44px) e alto contraste cromático garantem legibilidade instantânea.
          </p>
        </div>
        <div className="border-2 border-black p-6 bg-white shadow-brutal">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Acessibilidade é Número
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Alinhamento estrito com WCAG 2.2 AA. Contraste mínimo de 4.5:1, compatibilidade daltonismo sem colisão, respeito a prefers-reduced-motion e zoom nativo de 200%.
          </p>
        </div>
        <div className="border-2 border-black p-6 bg-white shadow-brutal">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Modos Integrados
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Mesmo conjunto de tokens adaptável via <code>data-mode</code>. O <strong>Modo Clínico</strong> prioriza velocidade e elevação total (4px). O <strong>Modo Família</strong> amortece a tensão com elevação suave (2px).
          </p>
        </div>
      </section>

      {/* ── Setup & Install ─────────────────────────────────────────── */}
      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal">
        <h2 className="text-2xl font-black font-mono uppercase border-b-2 border-black pb-2 mb-6">
          Setup &amp; Instalação
        </h2>
        <div className="space-y-6">

          {/* Path aliases */}
          <div>
            <h3 className="font-extrabold text-base mb-2 flex items-center gap-2">
              <span className="bg-black text-white font-mono text-xs px-2 py-0.5">1</span>
              Configurar o alias de paths (tsconfig / next.config)
            </h3>
            <p className="text-stone-600 text-sm mb-3">
              O alias <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">@/</code> deve apontar para <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">src/</code>. Verifique o <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">tsconfig.json</code>:
            </p>
            <pre className="text-xs font-mono bg-stone-50 border border-stone-200 p-4 rounded overflow-x-auto text-rose-600 font-semibold leading-relaxed">
{`// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}`}
            </pre>
          </div>

          {/* CSS import */}
          <div>
            <h3 className="font-extrabold text-base mb-2 flex items-center gap-2">
              <span className="bg-black text-white font-mono text-xs px-2 py-0.5">2</span>
              Importar os tokens no entry point
            </h3>
            <p className="text-stone-600 text-sm mb-3">
              Certifique-se de que <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">globals.css</code> é importado no layout raiz — ele carrega o <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">@theme</code> do Tailwind v4 e os seletores de modo.
            </p>
            <pre className="text-xs font-mono bg-stone-50 border border-stone-200 p-4 rounded overflow-x-auto text-rose-600 font-semibold leading-relaxed">
{`// src/app/layout.tsx  (ou _app.tsx em Pages Router)
import "@/styles/globals.css";`}
            </pre>
          </div>

          {/* Importando componentes */}
          <div>
            <h3 className="font-extrabold text-base mb-2 flex items-center gap-2">
              <span className="bg-black text-white font-mono text-xs px-2 py-0.5">3</span>
              Importando componentes
            </h3>
            <p className="text-stone-600 text-sm mb-3">
              Todos os primitivos residem em <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">src/components/ui/</code>:
            </p>
            <pre className="text-xs font-mono bg-stone-50 border border-stone-200 p-4 rounded overflow-x-auto text-rose-600 font-semibold leading-relaxed">
{`import { Button } from "@/components/ui/button";
import { Alert }  from "@/components/ui/alert";`}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Como Utilizar + Live Preview ────────────────────────────── */}
      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-brutal">
        <h2 className="text-2xl font-black font-mono uppercase border-b-2 border-black pb-2 mb-6">
          Como Utilizar
        </h2>

        <div className="space-y-8">
          {/* Estilização com Tokens */}
          <div>
            <h3 className="font-extrabold text-base mb-2">1. Estilização com Tokens (Tailwind v4)</h3>
            <p className="text-stone-600 text-sm mb-3">
              Os tokens são injetados no bloco <code className="bg-stone-100 px-1 border border-stone-200 rounded text-xs">@theme</code> do Tailwind v4. Use as classes utilitárias semânticas — nenhum valor arbitrário necessário:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">bg-brand-primary</span>
                <span className="text-stone-500 text-xs">Fundo ouro de destaque primário</span>
              </div>
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">border-border-brutal</span>
                <span className="text-stone-500 text-xs">Aplica a largura de borda padrão (1.5px)</span>
              </div>
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">shadow-brutal</span>
                <span className="text-stone-500 text-xs">Sombra dura mode-aware via <code>--ds-shadow</code></span>
              </div>
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">font-display</span>
                <span className="text-stone-500 text-xs">Aplica a fonte Space Grotesk para títulos</span>
              </div>
            </div>
          </div>

          {/* Componentes — code + live preview */}
          <div>
            <h3 className="font-extrabold text-base mb-2">2. Renderizando Componentes</h3>
            <p className="text-stone-600 text-sm mb-3">
              Código e preview ao vivo lado a lado — o que você vê aqui é o mesmo componente renderizado em produção:
            </p>

            {/* Split: code | preview */}
            <div className="grid md:grid-cols-2 gap-4 items-stretch">
              {/* Code */}
              <div className="flex flex-col">
                <div className="bg-black text-[#F2B705] font-mono text-xs font-bold px-3 py-1.5 flex items-center gap-2 border-2 border-black">
                  <span>◉</span> código
                </div>
                <pre className="flex-1 text-xs font-mono bg-stone-900 text-green-400 border-2 border-t-0 border-black p-4 overflow-x-auto leading-relaxed">
{`<Alert
  severidade="sucesso"
  titulo="Sessão sincronizada"
>
  Prontuário salvo localmente.
  <Button
    className="mt-4"
    variante="primaria"
  >
    Entendido
  </Button>
</Alert>`}
                </pre>
              </div>

              {/* Live preview */}
              <div className="flex flex-col">
                <div className="bg-stone-800 text-white font-mono text-xs font-bold px-3 py-1.5 flex items-center gap-2 border-2 border-black">
                  <span>▶</span> preview ao vivo
                </div>
                <div className="flex-1 border-2 border-t-0 border-black bg-stone-50 p-4 flex items-start">
                  <Alert severidade="sucesso" titulo="Sessão sincronizada">
                    Prontuário salvo localmente.
                    <Button className="mt-4" variante="primaria">
                      Entendido
                    </Button>
                  </Alert>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Foundations Nav ─────────────────────────────────────────── */}
      <section className="border-2 border-black bg-[#F2B705] p-6 md:p-8 shadow-brutal">
        <h2 className="text-2xl font-black font-mono uppercase border-b-2 border-black pb-2 mb-6">
          Explorar Foundations
        </h2>
        <p className="text-sm font-medium text-stone-800 mb-5">
          As Foundations documentam cada token do sistema. Clique para abrir a story correspondente:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {FOUNDATIONS.map(({ label, icon, id }) => (
            <a
              key={id}
              href={sbLink(id)}
              className={[
                "flex items-center gap-3 p-4",
                "border-2 border-black bg-white shadow-brutal-sm",
                "font-mono font-bold text-sm text-black uppercase tracking-wide",
                "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal",
                "active:translate-x-0 active:translate-y-0 active:shadow-none",
                "transition-[transform,box-shadow] duration-100 ease-out",
              ].join(" ")}
            >
              <span className="text-xl leading-none shrink-0 w-8 text-center">{icon}</span>
              <span>{label}</span>
              <span className="ml-auto text-stone-400">→</span>
            </a>
          ))}
        </div>
      </section>

    </div>
  ),
};
