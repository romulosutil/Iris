import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";
import { Logo } from "../../components/ui/logo";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";

const DS_VERSION = "0.1.0";
const DS_STATUS = "Alpha";

const meta = {
  title: "01. INTRO/Welcome",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

// Helper para navegar no Storybook via API interna
function sbLink(storyId: string) {
  return `/?path=/story/${storyId}`;
}

const FOUNDATIONS = [
  { label: "Cores & Paleta", icon: "🎨", id: "foundations-colors--palette" },
  { label: "Tipografia", icon: "Aa", id: "foundations-typography--scales" },
  {
    label: "Espaçamento",
    icon: "↔",
    id: "foundations-spacing-borders--spacing",
  },
  {
    label: "Elevação & Sombras",
    icon: "◻",
    id: "foundations-spacing-borders--spacing",
  },
  { label: "Iconografia", icon: "✦", id: "foundations-icons--gallery" },
];

export const Introduction: StoryObj = {
  render: () => (
    <div className="max-w-4xl space-y-12 font-sans text-stone-900">
      {/* ── Hero Header ─────────────────────────────────────────────── */}
      <div className="shadow-brutal relative flex flex-col justify-between gap-8 overflow-hidden border-4 border-black bg-[#F2B705] p-8 md:flex-row md:items-center md:p-12">
        <div className="z-10 max-w-xl space-y-4">
          {/* Version badge */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-block border-2 border-black bg-black px-3 py-1 font-mono text-xs font-bold tracking-widest text-[#F2B705] uppercase">
              Design System Core
            </span>
            <span className="inline-flex items-center gap-1.5 border-2 border-black bg-white px-3 py-1 font-mono text-xs font-bold tracking-widest text-black uppercase">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              v{DS_VERSION} · {DS_STATUS}
            </span>
          </div>
          <h1 className="font-mono text-4xl font-black tracking-tight text-black uppercase md:text-6xl">
            Espectro Brutal
          </h1>
          <p className="text-lg leading-relaxed font-bold text-black md:text-xl">
            O sistema de design honesto e transparente para a clínica Iris. A
            estética neobrutalista expondo a estrutura e integridade dos dados
            clínicos.
          </p>
        </div>
        <div className="shadow-brutal max-w-max shrink-0 self-start border-2 border-black bg-white p-4 md:self-auto">
          <Logo
            variante="marca"
            altura={80}
            tom="cor"
            animado={true}
            className="iris-animado"
          />
        </div>
      </div>

      {/* ── Status Bar ──────────────────────────────────────────────── */}
      <div className="shadow-brutal-sm flex flex-wrap items-center gap-3 border-2 border-black bg-stone-50 p-3 font-mono text-xs font-bold">
        <span className="tracking-widest text-stone-400 uppercase">
          Status:
        </span>
        <span className="flex items-center gap-1.5 rounded-sm border border-amber-400 bg-amber-100 px-2 py-0.5 text-amber-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          Alpha · Componentes primitivos estáveis
        </span>
        <span className="flex items-center gap-1.5 rounded-sm border border-green-400 bg-green-50 px-2 py-0.5 text-green-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          Tailwind v4 · @theme tokens
        </span>
        <span className="flex items-center gap-1.5 rounded-sm border border-blue-400 bg-blue-50 px-2 py-0.5 text-blue-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          WCAG 2.2 AA target
        </span>
      </div>

      {/* ── Pillars Grid ────────────────────────────────────────────── */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="shadow-brutal border-2 border-black bg-white p-6">
          <h2 className="mb-3 border-b border-black pb-2 font-mono text-xl font-black uppercase">
            Honestidade Epistêmica
          </h2>
          <p className="text-sm leading-relaxed font-medium text-stone-600">
            Recusamo-nos a maquiar incertezas. A IA nunca decide sozinha. Todo
            dado sugerido tem indicação visual diferente (borda tracejada
            violeta) de dados aprovados por humanos (borda sólida).
          </p>
        </div>
        <div className="shadow-brutal border-2 border-black bg-white p-6">
          <h2 className="mb-3 border-b border-black pb-2 font-mono text-xl font-black uppercase">
            Ergonomia de Corredor
          </h2>
          <p className="text-sm leading-relaxed font-medium text-stone-600">
            Desenhado para terapeutas operando sob pressão de tempo e luz
            instável. Alvos de toque grandes (mínimo 44px) e alto contraste
            cromático garantem legibilidade instantânea.
          </p>
        </div>
        <div className="shadow-brutal border-2 border-black bg-white p-6">
          <h2 className="mb-3 border-b border-black pb-2 font-mono text-xl font-black uppercase">
            Acessibilidade é Número
          </h2>
          <p className="text-sm leading-relaxed font-medium text-stone-600">
            Alinhamento estrito com WCAG 2.2 AA. Contraste mínimo de 4.5:1,
            compatibilidade daltonismo sem colisão, respeito a
            prefers-reduced-motion e zoom nativo de 200%.
          </p>
        </div>
        <div className="shadow-brutal border-2 border-black bg-white p-6">
          <h2 className="mb-3 border-b border-black pb-2 font-mono text-xl font-black uppercase">
            Modos Integrados
          </h2>
          <p className="text-sm leading-relaxed font-medium text-stone-600">
            Mesmo conjunto de tokens adaptável via <code>data-mode</code>. O{" "}
            <strong>Modo Clínico</strong> prioriza velocidade e elevação total
            (4px). O <strong>Modo Família</strong> amortece a tensão com
            elevação suave (2px).
          </p>
        </div>
      </section>

      {/* ── Setup & Install ─────────────────────────────────────────── */}
      <section className="shadow-brutal border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Setup &amp; Instalação
        </h2>
        <div className="space-y-6">
          {/* Path aliases */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-extrabold">
              <span className="bg-black px-2 py-0.5 font-mono text-xs text-white">
                1
              </span>
              Configurar o alias de paths (tsconfig / next.config)
            </h3>
            <p className="mb-3 text-sm text-stone-600">
              O alias{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                @/
              </code>{" "}
              deve apontar para{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                src/
              </code>
              . Verifique o{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                tsconfig.json
              </code>
              :
            </p>
            <pre className="overflow-x-auto rounded border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-relaxed font-semibold text-rose-600">
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
            <h3 className="mb-2 flex items-center gap-2 text-base font-extrabold">
              <span className="bg-black px-2 py-0.5 font-mono text-xs text-white">
                2
              </span>
              Importar os tokens no entry point
            </h3>
            <p className="mb-3 text-sm text-stone-600">
              Certifique-se de que{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                globals.css
              </code>{" "}
              é importado no layout raiz — ele carrega o{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                @theme
              </code>{" "}
              do Tailwind v4 e os seletores de modo.
            </p>
            <pre className="overflow-x-auto rounded border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-relaxed font-semibold text-rose-600">
              {`// src/app/layout.tsx  (ou _app.tsx em Pages Router)
import "@/styles/globals.css";`}
            </pre>
          </div>

          {/* Importando componentes */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-extrabold">
              <span className="bg-black px-2 py-0.5 font-mono text-xs text-white">
                3
              </span>
              Importando componentes
            </h3>
            <p className="mb-3 text-sm text-stone-600">
              Todos os primitivos residem em{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                src/components/ui/
              </code>
              :
            </p>
            <pre className="overflow-x-auto rounded border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-relaxed font-semibold text-rose-600">
              {`import { Button } from "@/components/ui/button";
import { Alert }  from "@/components/ui/alert";`}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Como Utilizar + Live Preview ────────────────────────────── */}
      <section className="shadow-brutal border-2 border-black bg-white p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Como Utilizar
        </h2>

        <div className="space-y-8">
          {/* Estilização com Tokens */}
          <div>
            <h3 className="mb-2 text-base font-extrabold">
              1. Estilização com Tokens (Tailwind v4)
            </h3>
            <p className="mb-3 text-sm text-stone-600">
              Os tokens são injetados no bloco{" "}
              <code className="rounded border border-stone-200 bg-stone-100 px-1 text-xs">
                @theme
              </code>{" "}
              do Tailwind v4. Use as classes utilitárias semânticas — nenhum
              valor arbitrário necessário:
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="border border-black bg-stone-50 p-3">
                <span className="block font-mono text-xs font-bold text-rose-600">
                  bg-brand-primary
                </span>
                <span className="text-xs text-stone-500">
                  Fundo ouro de destaque primário
                </span>
              </div>
              <div className="border border-black bg-stone-50 p-3">
                <span className="block font-mono text-xs font-bold text-rose-600">
                  border-border-brutal
                </span>
                <span className="text-xs text-stone-500">
                  Aplica a largura de borda padrão (1.5px)
                </span>
              </div>
              <div className="border border-black bg-stone-50 p-3">
                <span className="block font-mono text-xs font-bold text-rose-600">
                  shadow-brutal
                </span>
                <span className="text-xs text-stone-500">
                  Sombra dura mode-aware via <code>--ds-shadow</code>
                </span>
              </div>
              <div className="border border-black bg-stone-50 p-3">
                <span className="block font-mono text-xs font-bold text-rose-600">
                  font-display
                </span>
                <span className="text-xs text-stone-500">
                  Aplica a fonte Space Grotesk para títulos
                </span>
              </div>
            </div>
          </div>

          {/* Componentes — code + live preview */}
          <div>
            <h3 className="mb-2 text-base font-extrabold">
              2. Renderizando Componentes
            </h3>
            <p className="mb-3 text-sm text-stone-600">
              Código e preview ao vivo lado a lado — o que você vê aqui é o
              mesmo componente renderizado em produção:
            </p>

            {/* Split: code | preview */}
            <div className="grid items-stretch gap-4 md:grid-cols-2">
              {/* Code */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2 border-2 border-black bg-black px-3 py-1.5 font-mono text-xs font-bold text-[#F2B705]">
                  <span>◉</span> código
                </div>
                <pre className="flex-1 overflow-x-auto border-2 border-t-0 border-black bg-stone-900 p-4 font-mono text-xs leading-relaxed text-green-400">
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
                <div className="flex items-center gap-2 border-2 border-black bg-stone-800 px-3 py-1.5 font-mono text-xs font-bold text-white">
                  <span>▶</span> preview ao vivo
                </div>
                <div className="flex flex-1 items-start border-2 border-t-0 border-black bg-stone-50 p-4">
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
      <section className="shadow-brutal border-2 border-black bg-[#F2B705] p-6 md:p-8">
        <h2 className="mb-6 border-b-2 border-black pb-2 font-mono text-2xl font-black uppercase">
          Explorar Foundations
        </h2>
        <p className="mb-5 text-sm font-medium text-stone-800">
          As Foundations documentam cada token do sistema. Clique para abrir a
          story correspondente:
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {FOUNDATIONS.map(({ label, icon, id }) => (
            <a
              key={id}
              href={sbLink(id)}
              className={[
                "flex items-center gap-3 p-4",
                "shadow-brutal-sm border-2 border-black bg-white",
                "font-mono text-sm font-bold tracking-wide text-black uppercase",
                "hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5",
                "active:translate-x-0 active:translate-y-0 active:shadow-none",
                "transition-[transform,box-shadow] duration-100 ease-out",
              ].join(" ")}
            >
              <span className="w-8 shrink-0 text-center text-xl leading-none">
                {icon}
              </span>
              <span>{label}</span>
              <span className="ml-auto text-stone-400">→</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  ),
};
