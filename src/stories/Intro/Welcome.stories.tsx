import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";
import { Logo } from "../../components/ui/logo";

const meta = {
  title: "Intro/Welcome",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

export const Introduction: StoryObj = {
  render: () => (
    <div className="max-w-4xl font-sans text-stone-900 space-y-12">
      {/* Hero Header */}
      <div className="border-4 border-black p-8 md:p-12 bg-[#F2B705] shadow-[8px_8px_0px_#000000] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-4 max-w-xl z-10">
          <span className="bg-black text-[#F2B705] font-mono font-bold text-xs uppercase px-3 py-1 border-2 border-black inline-block tracking-widest">
            Design System Core
          </span>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight text-black font-mono">
            Espectro Brutal
          </h1>
          <p className="text-lg md:text-xl font-bold text-black leading-relaxed">
            O sistema de design honesto e transparente para a clínica Iris. A estética neobrutalista expondo a estrutura e integridade dos dados clínicos.
          </p>
        </div>
        <div className="shrink-0 bg-white p-4 border-2 border-black shadow-[4px_4px_0px_#000000] max-w-max self-start md:self-auto">
          <Logo variante="marca" altura={80} tom="cor" animado={true} className="iris-animado" />
        </div>
      </div>

      {/* Pillars Grid */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="border-2 border-black p-6 bg-white shadow-[4px_4px_0px_#000000]">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Honestidade Epistêmica
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Recusamo-nos a maquiar incertezas. A IA nunca decide sozinha. Todo dado sugerido tem indicação visual diferente (borda tracejada violeta) de dados aprovados por humanos (borda sólida).
          </p>
        </div>
        <div className="border-2 border-black p-6 bg-white shadow-[4px_4px_0px_#000000]">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Ergonomia de Corredor
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Desenhado para terapeutas operando sob pressão de tempo e luz instável. Alvos de toque grandes (mínimo 44px) e alto contraste cromático garantem legibilidade instantânea.
          </p>
        </div>
        <div className="border-2 border-black p-6 bg-white shadow-[4px_4px_0px_#000000]">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Acessibilidade é Número
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Alinhamento estrito com WCAG 2.2 AA. Contraste mínimo de 4.5:1, compatibilidade daltonismo sem colisão, respeito a prefers-reduced-motion e zoom nativo de 200%.
          </p>
        </div>
        <div className="border-2 border-black p-6 bg-white shadow-[4px_4px_0px_#000000]">
          <h2 className="text-xl font-black font-mono uppercase border-b border-black pb-2 mb-3">
            Modos Integrados
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed font-medium">
            Mesmo conjunto de tokens adaptável via <code>data-mode</code>. O <strong>Modo Clínico</strong> prioriza velocidade e elevação total (4px). O <strong>Modo Família</strong> amortece a tensão com elevação suave (2px).
          </p>
        </div>
      </section>

      {/* Getting Started / Code */}
      <section className="border-2 border-black bg-white p-6 md:p-8 shadow-[4px_4px_0px_#000000]">
        <h2 className="text-2xl font-black font-mono uppercase border-b-2 border-black pb-2 mb-6">
          Como Utilizar
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-extrabold text-base mb-2">1. Importando Componentes</h3>
            <p className="text-stone-600 text-sm mb-3">
              Todos os componentes primitivos residem em <code>src/components/ui/</code> e podem ser importados utilizando o alias padrão:
            </p>
            <pre className="text-xs font-mono bg-stone-50 border border-stone-200 p-4 rounded overflow-x-auto text-rose-600 font-semibold leading-relaxed">
{`import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function Exemplo() {
  return (
    <Alert severidade="sucesso" titulo="Ação concluída">
      Os dados foram sincronizados localmente.
      <Button className="mt-4">Entendido</Button>
    </Alert>
  );
}`}
            </pre>
          </div>

          <div>
            <h3 className="font-extrabold text-base mb-2">2. Estilização com Tokens (Tailwind v4)</h3>
            <p className="text-stone-600 text-sm mb-3">
              Os tokens são injetados diretamente nas variáveis do tema do Tailwind v4 CSS. Use as classes utilitárias semânticas equivalentes:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">bg-brand-primary</span>
                <span className="text-stone-500 text-xs">Fundo ouro de destaque primário</span>
              </div>
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">border-border-brutal</span>
                <span className="text-stone-500 text-xs">Aplica a largura de borda padrão (2px)</span>
              </div>
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">shadow-[var(--shadow-brutal)]</span>
                <span className="text-stone-500 text-xs">Aplica a sombra dura brutalista de 4px</span>
              </div>
              <div className="border border-black p-3 bg-stone-50">
                <span className="font-mono text-xs font-bold text-rose-600 block">font-display</span>
                <span className="text-stone-500 text-xs">Aplica a fonte Space Grotesk para títulos</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
};
