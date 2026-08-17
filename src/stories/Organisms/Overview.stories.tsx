import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";

const meta = {
  title: "05. PATTERNS/Overview",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

export const Visão_Geral: StoryObj = {
  name: "Visão Geral",
  render: () => (
    <div className="max-w-3xl space-y-8 font-sans text-stone-900">
      {/* Header */}
      <div className="shadow-brutal border-4 border-black bg-white p-8">
        <span className="mb-4 inline-block bg-black px-3 py-1 font-mono text-xs font-bold tracking-widest text-white uppercase">
          Nível 3 — Organismos
        </span>
        <h1 className="mb-3 font-mono text-4xl font-black tracking-tight uppercase">
          Organisms
        </h1>
        <p className="text-base leading-relaxed text-stone-600">
          Os <strong>organismos</strong> são seções complexas e distintas da
          interface — combinações de moléculas e/ou átomos formando partes
          auto-suficientes de uma página. Um cabeçalho com navegação, logo e
          ações do usuário é um organismo. Eles têm consciência de negócio, mas
          não de layout de página.
        </p>
      </div>

      {/* Rules */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Seção completa",
            desc: "Representa uma área visualmente e semanticamente distinta — pode ser extraída e reconhecida isoladamente.",
          },
          {
            title: "Lógica de negócio",
            desc: "Pode conter estado local e lógica de interação própria (ex: formulário com validação, lista com filtros).",
          },
          {
            title: "Composição de moléculas",
            desc: "Monta múltiplas moléculas (e átomos) em um todo coeso com disposição e hierarquia definidas.",
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

      {/* Examples hint */}
      <div className="shadow-brutal border-2 border-black bg-[#F2B705] p-5">
        <h2 className="mb-2 font-mono text-sm font-black uppercase">
          Exemplos nesta categoria
        </h2>
        <ul className="space-y-1 font-mono text-xs text-stone-900">
          {[
            "Navbar / TopBar",
            "Sidebar",
            "PatientCard (card completo de paciente)",
            "SessionForm (formulário de sessão)",
            "AppointmentList (lista de agendamentos)",
            "NotificationCenter",
            "DataTable (tabela com filtros e paginação)",
            "LoginForm",
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
