import React from "react";

export function LandingProtocolShowcase() {
  const protocols = [
    {
      title: "Análise do Comportamento",
      category: "3 PROTOCOLOS",
      bgColor: "bg-[var(--action-primary,#F2B705)]",
      icon: "📊",
      description:
        "Marcos verbais, habilidades básicas de aprendizagem e habilidades funcionais de vida diária como metas do plano — com a evidência da sessão acumulando embaixo de cada uma.",
      highlights: ["VB-MAPP (níveis 1, 2 e 3)", "ABLLS-R", "AFLS"],
    },
    {
      title: "Fonoaudiologia",
      category: "3 PROTOCOLOS",
      bgColor: "bg-[var(--status-success-bg,#C8E6C9)]",
      icon: "🗣️",
      description:
        "Observação comportamental da comunicação, linguagem infantil e avaliação miofuncional orofacial registradas no mesmo prontuário do resto da equipe.",
      highlights: ["PROC (Zorzi & Hage)", "ABFW", "MBGR"],
    },
    {
      title: "T.O. e Desenvolvimento",
      category: "4 PROTOCOLOS",
      bgColor: "bg-[var(--color-gold-tint,#FFE082)]",
      icon: "🧩",
      description:
        "Intervenção precoce, independência funcional, coordenação motora e perfil sensorial acompanhados sem exportar nada para planilha externa.",
      highlights: ["Denver / ESDM", "PEDI", "DCDQ", "Perfil Sensorial 2"],
    },
    {
      title: "PEI — o que amarra tudo",
      category: "PLANO INDIVIDUALIZADO",
      bgColor: "bg-[var(--status-info-bg,#B2DFDB)]",
      icon: "🎯",
      description:
        "Independente do protocolo, a unidade de trabalho é a meta: curto, médio e longo prazo, com critério objetivo de aquisição, manutenção e generalização.",
      highlights: [
        "Critério de aquisição (ex: 80% em 3 sessões)",
        "Evidência ligada à meta, não solta",
        "Status visível a qualquer momento",
      ],
    },
  ];

  return (
    <section
      id="protocolos"
      aria-labelledby="protocolos-title"
      className="mx-auto w-full max-w-[1800px] space-y-12 px-4 py-16 sm:px-8 sm:py-24 md:space-y-16 lg:px-12 2xl:px-20"
    >
      <div className="mx-auto max-w-3xl space-y-4 text-center lg:max-w-4xl">
        <div className="inline-block rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--action-primary,#F2B705)] px-3.5 py-1 font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)] uppercase shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
          Sua metodologia continua sendo a sua
        </div>
        <h2
          id="protocolos-title"
          className="font-display text-3xl font-extrabold text-[var(--text-primary,#1A1A1A)] sm:text-4xl md:text-5xl"
        >
          10 protocolos mapeados com especialista
        </h2>
        <p className="text-base font-medium text-[var(--text-secondary,#71717A)] sm:text-lg">
          O Iris não obriga a clínica a trocar de protocolo nem a mudar como
          registra. Ele reconhece o que sua equipe já usa e organiza a evidência
          por meta — a pontuação continua sendo ato do profissional.
        </p>
      </div>

      {/* Grid Neobrutalista de Protocolos */}
      <div className="mx-auto grid w-full max-w-[1700px] grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 2xl:gap-10">
        {protocols.map((p, index) => (
          <div
            key={index}
            className="flex flex-col justify-between rounded-[var(--radius-md,6px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-white p-6 shadow-[var(--ds-shadow,4px_4px_0px_#1A1A1A)] transition-all hover:-translate-y-1 hover:shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] sm:p-7"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-[10px] font-black uppercase ${p.bgColor} rounded border border-[var(--border-brutal,#1A1A1A)] px-2.5 py-1 text-[var(--text-primary,#1A1A1A)] shadow-[1px_1px_0px_#1A1A1A]`}
                >
                  {p.category}
                </span>
                <span className="text-2xl" aria-hidden="true">
                  {p.icon}
                </span>
              </div>

              <h3 className="font-display text-xl font-black text-[var(--text-primary,#1A1A1A)] sm:text-2xl">
                {p.title}
              </h3>

              <p className="text-sm leading-relaxed font-medium text-gray-700">
                {p.description}
              </p>
            </div>

            <div className="mt-6 space-y-2 border-t-2 border-dashed border-[var(--border-brutal,#1A1A1A)] pt-6 font-mono text-xs font-bold text-gray-800">
              {p.highlights.map((h, hIdx) => (
                <div key={hIdx} className="flex items-center gap-2">
                  <span className="shrink-0 text-emerald-600">✓</span>
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
