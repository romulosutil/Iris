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
    <div className="max-w-3xl font-sans text-stone-900 space-y-8">
      {/* Header */}
      <div className="border-4 border-black p-8 bg-white shadow-brutal">
        <span className="bg-black text-white font-mono font-bold text-xs uppercase px-3 py-1 inline-block tracking-widest mb-4">
          Nível 3 — Organismos
        </span>
        <h1 className="text-4xl font-black uppercase tracking-tight font-mono mb-3">
          Organisms
        </h1>
        <p className="text-stone-600 text-base leading-relaxed">
          Os <strong>organismos</strong> são seções complexas e distintas da interface — combinações de
          moléculas e/ou átomos formando partes auto-suficientes de uma página. Um cabeçalho com
          navegação, logo e ações do usuário é um organismo. Eles têm consciência de negócio, mas
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
          <div key={title} className="border-2 border-black p-5 bg-stone-50 shadow-brutal-sm">
            <h2 className="font-black font-mono uppercase text-sm border-b border-black pb-1 mb-2">
              {title}
            </h2>
            <p className="text-stone-600 text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Examples hint */}
      <div className="border-2 border-black p-5 bg-[#F2B705] shadow-brutal">
        <h2 className="font-black font-mono uppercase text-sm mb-2">
          Exemplos nesta categoria
        </h2>
        <ul className="text-xs font-mono space-y-1 text-stone-900">
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
              <span className="w-1.5 h-1.5 bg-black inline-block shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ),
};
