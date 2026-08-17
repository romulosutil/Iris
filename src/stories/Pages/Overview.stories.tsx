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
    <div className="mx-auto max-w-3xl space-y-8 p-8 font-sans text-stone-900">
      {/* Header */}
      <div className="shadow-brutal border-4 border-black bg-white p-8">
        <span className="mb-4 inline-block bg-black px-3 py-1 font-mono text-xs font-bold tracking-widest text-white uppercase">
          Nível 5 — Páginas
        </span>
        <h1 className="mb-3 font-mono text-4xl font-black tracking-tight uppercase">
          Pages
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          As <strong>páginas</strong> são o nível final da hierarquia atômica.
          Os templates são preenchidos com dados reais e conteúdo específico
          para testar a interface em <strong>cenários reais de uso</strong>.
          Aqui é onde validamos se o design system funciona na prática — com
          dados de produção simulados, edge cases e fluxos completos.
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
          <div
            key={title}
            className="shadow-brutal-sm border-2 border-black bg-stone-50 p-5"
          >
            <h2 className="mb-2 border-b border-black pb-1 font-mono text-sm font-black uppercase">
              {title}
            </h2>
            <p className="text-xs leading-relaxed text-stone-600">{desc}</p>
          </div>
        ))}
      </div>

      {/* Warning */}
      <div className="shadow-brutal border-2 border-black bg-rose-50 p-5">
        <h2 className="mb-2 font-mono text-sm font-black text-rose-800 uppercase">
          ⚠ Atenção com dados sensíveis
        </h2>
        <p className="text-xs leading-relaxed text-rose-700">
          Todas as histórias em Pages devem usar dados{" "}
          <strong>fictícios ou anonimizados</strong>. Nunca inserir CPFs,
          emails, prontuários ou qualquer dado pessoal real de pacientes.
          Compliance LGPD é obrigatório — inclusive no ambiente de
          desenvolvimento.
        </p>
      </div>

      {/* Examples hint */}
      <div className="shadow-brutal border-2 border-black bg-[#F2B705] p-5">
        <h2 className="mb-2 font-mono text-sm font-black uppercase">
          Exemplos nesta categoria
        </h2>
        <ul className="space-y-1 font-mono text-xs text-stone-900">
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
              <span className="inline-block h-1.5 w-1.5 shrink-0 bg-black" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};
