import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "06. PAGES/Overview",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const Visão_Geral: StoryObj = {
  name: "Visão Geral",
  render: () => (
    <div className="max-w-3xl mx-auto font-sans text-stone-900 space-y-8 p-8">
      {/* Header */}
      <div className="border-4 border-black p-8 bg-white shadow-brutal">
        <span className="bg-black text-white font-mono font-bold text-xs uppercase px-3 py-1 inline-block tracking-widest mb-4">
          Nível 5 — Páginas
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight font-mono mb-3">
          Pages
        </h1>
        <p className="text-stone-600 text-base leading-relaxed">
          As <strong>páginas</strong> são o nível final da hierarquia atômica. Os templates são
          preenchidos com dados reais e conteúdo específico para testar a interface em{" "}
          <strong>cenários reais de uso</strong>. Aqui é onde validamos se o design system
          funciona na prática — com dados de produção simulados, edge cases e fluxos completos.
        </p>
      </div>

      {/* Rules */}
      <div className="grid gap-4 md:grid-cols-2">
        {[
          {
            title: "Dados reais simulados",
            desc: "Usa fixtures próximas da produção: nomes de pacientes reais (anonimizados), sessões, diagnósticos, horários.",
          },
          {
            title: "Cenários de uso",
            desc: "Cada story representa um cenário: fluxo vazio, estado de erro, usuário novo, lista cheia, permissão negada.",
          },
          {
            title: "Teste de integração visual",
            desc: "Valida que átomos + moléculas + organismos + layout funcionam juntos sem conflitos visuais.",
          },
          {
            title: "Documentação de UX",
            desc: "Serve como referência viva para stakeholders e QA — mostra o produto como o usuário final vê.",
          },
        ].map(({ title, desc }) => (
          <div key={title} className="border-2 border-black p-5 bg-stone-50 shadow-brutal-sm">
            <h2 className="font-black font-mono uppercase text-sm border-b border-black pb-1 mb-2">
              {title}
            </h2>
            <p className="text-stone-600 text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Warning */}
      <div className="border-2 border-black p-5 bg-rose-50 shadow-brutal">
        <h2 className="font-black font-mono uppercase text-sm mb-2 text-rose-800">
          ⚠ Atenção com dados sensíveis
        </h2>
        <p className="text-rose-700 text-xs leading-relaxed">
          Todas as histórias em Pages devem usar dados <strong>fictícios ou anonimizados</strong>.
          Nunca inserir CPFs, emails, prontuários ou qualquer dado pessoal real de pacientes.
          Compliance LGPD é obrigatório — inclusive no ambiente de desenvolvimento.
        </p>
      </div>

      {/* Examples hint */}
      <div className="border-2 border-black p-5 bg-[#F2B705] shadow-brutal">
        <h2 className="font-black font-mono uppercase text-sm mb-2">
          Exemplos nesta categoria
        </h2>
        <ul className="text-xs font-mono space-y-1 text-stone-900">
          {[
            "Dashboard — estado vazio (sem agendamentos)",
            "Dashboard — dia cheio (8 sessões)",
            "PatientDetail — paciente novo (sem histórico)",
            "PatientDetail — paciente recorrente (histórico longo)",
            "Login — erro de credenciais",
            "Login — primeiro acesso",
            "SessionRecord — rascunho salvo",
            "Settings — plano de conta ativo",
          ].map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-black inline-block shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};
