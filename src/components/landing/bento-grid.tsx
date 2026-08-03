import React from "react";
import { Card } from "@/components/ui/card";

export function LandingBentoGrid() {
  const personas = [
    {
      role: "🏥 QUEM DECIDE A COMPRA",
      emoji: "💼",
      roleBg: "bg-[var(--color-gold-tint,#FFE082)]",
      title: "O relatório fica pronto quando a operadora pedir — não depois de dias de garimpo.",
      description:
        "A evolução do período já está montada a partir do que a equipe registrou e a coordenação aprovou. Cada afirmação leva anexa a frase do diário que a sustenta, com data e autor.",
      bullets: [
        "🔎 Origem de cada dado, sem abrir prontuário antigo",
        "👥 Nenhuma cobrança por terapeuta ou assento",
        "📦 Exportação integral em PDF e JSON quando quiser",
      ],
    },
    {
      role: "🎯 QUEM SUPERVISIONA",
      emoji: "📋",
      roleBg: "bg-[var(--status-info-bg,#B2DFDB)]",
      title: "Supervisão por exceção. Só o que destoa chega até você.",
      description:
        "Ninguém consegue reler 80 prontuários por mês — e assinar sem ler é o risco que a coordenação carrega sozinha hoje. O Iris destaca meta estagnada, evidência frágil e divergência entre o registrado e o aprovado.",
      bullets: [
        "⚠️ Meta parada aparece antes da reunião de ciclo",
        "🔍 Reclassificação versionada, com justificativa",
        "📊 Mesmas telas para quem supervisiona e quem é supervisionado",
      ],
    },
    {
      role: "📱 QUEM PRECISA ADOTAR",
      emoji: "👩‍⚕️",
      roleBg: "bg-[var(--action-primary,#F2B705)]",
      title: "A terapeuta não precisa aprender um jeito novo de registrar.",
      description:
        "Escrever em texto livre é o que a equipe já faz hoje no papel ou no bloco de notas. O registro acontece no celular logo depois do atendimento, sem formulário por tentativa e sem taxonomia para decorar.",
      bullets: [
        "⏱️ Registro em poucos minutos, ainda na clínica",
        "🚫 Sem planilha de tentativa durante a sessão",
        "🤝 Fono, TO e psicologia no mesmo prontuário",
      ],
    },
  ];

  return (
    <section
      id="recursos"
      aria-labelledby="recursos-title"
      className="w-full py-16 sm:py-20 px-4 sm:px-8 lg:px-12 2xl:px-20 max-w-[1800px] mx-auto space-y-12 md:space-y-16"
    >
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-block font-mono text-xs font-bold uppercase bg-[var(--status-info-bg,#B2DFDB)] px-3.5 py-1 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
          Comprar é fácil. Fazer a clínica usar é o problema real.
        </div>
        <h2
          id="recursos-title"
          className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-[var(--text-primary,#1A1A1A)]"
        >
          Três pessoas precisam ganhar alguma coisa no primeiro mês
        </h2>
        <p className="text-[var(--text-secondary,#71717A)] font-medium text-sm sm:text-base">
          Se o terapeuta não adota, o coordenador não confia e o dono não vê o relatório sair, o sistema vira licença parada. O Iris foi desenhado a partir dessas três contas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 2xl:gap-10 items-stretch">
        {personas.map((p, index) => (
          <Card
            key={index}
            epistemicState="fact"
            className={`p-6 sm:p-7 flex flex-col justify-between hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] transition-all duration-150 border-2 border-[var(--border-brutal,#1A1A1A)] bg-white rounded-[var(--radius-md,6px)] ${
              index === 2 ? "md:col-span-2 lg:col-span-1" : ""
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-xs font-black ${p.roleBg} text-[var(--text-primary,#1A1A1A)] px-3 py-1 rounded border border-[var(--border-brutal,#1A1A1A)] shadow-[1px_1px_0px_#1A1A1A]`}
                >
                  {p.role}
                </span>
                <span className="text-2xl" aria-hidden="true">
                  {p.emoji}
                </span>
              </div>

              <h3 className="font-display font-black text-xl sm:text-2xl text-[var(--text-primary,#1A1A1A)] leading-tight">
                {p.title}
              </h3>

              <p className="text-sm text-gray-700 leading-relaxed font-medium">
                {p.description}
              </p>
            </div>

            <div className="pt-6 mt-6 border-t-2 border-dashed border-[var(--border-brutal,#1A1A1A)] space-y-2.5 font-mono text-xs font-bold text-gray-800">
              {p.bullets.map((b, bIdx) => (
                <div key={bIdx} className="flex items-center gap-2">
                  <span className="text-emerald-600 shrink-0" aria-hidden="true">
                    ✓
                  </span>{" "}
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
