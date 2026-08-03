import React from "react";

export function LandingEvidenceDossierBlock() {
  const dossierItems = [
    {
      icon: "=>",
      title: "Dossiê bruto, com a trilha inteira",
      description:
        "Exportação das evidências aprovadas no período com data, autor e o trecho literal do diário que originou cada uma. É o documento que responde a um pedido de auditoria sem ninguém precisar reabrir meses de prontuário.",
    },
    {
      icon: "📄",
      title: "Relatório de evolução redigido",
      description:
        "Rascunho narrativo gerado a partir das evidências já aprovadas, para a coordenação editar e assinar. O texto sai do que foi registrado — não de uma síntese solta que ninguém consegue rastrear depois.",
    },
    {
      icon: "👤",
      title: "Uma versão para a família",
      description:
        "O mesmo período, em linguagem que o responsável entende, sem jargão de protocolo. A reunião de devolutiva deixa de exigir uma preparação separada.",
    },
  ];

  return (
    <section
      aria-label="Construção Contínua do Dossiê Clínico"
      className="w-full bg-[var(--border-brutal,#1A1A1A)] text-white py-16 sm:py-24 border-y-2 border-[var(--border-brutal,#1A1A1A)] shadow-[0px_6px_0px_#F2B705]"
    >
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
            <span className="inline-block px-3 py-1 rounded-[var(--radius-control,5px)] bg-[var(--action-primary,#F2B705)] text-black font-mono font-bold text-xs uppercase tracking-wider border-2 border-white shadow-[2px_2px_0px_#FFF]">
              Dossiê Clínico Automatizado
            </span>
            <h2 className="font-display font-black text-3xl sm:text-4xl md:text-5xl text-white leading-[1.1] tracking-tight">
              O documento sai pronto porque foi sendo construído o ano inteiro
            </h2>
            <p className="font-body text-base sm:text-lg text-gray-300 font-medium leading-relaxed">
              Nada é redigido do zero no fim do ciclo. Cada sessão aprovada já é uma linha do relatório — e cada linha continua ligada à frase que a originou.
            </p>
          </div>

          <div className="lg:col-span-7 space-y-4">
            {dossierItems.map((item, index) => (
              <div
                key={index}
                className="p-6 rounded-[var(--radius-md,6px)] bg-white text-black border-2 border-black shadow-[4px_4px_0px_#F2B705] space-y-3"
              >
                <div className="flex items-center justify-between border-b-2 border-black/10 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-[var(--radius-control,5px)] bg-[var(--action-primary,#F2B705)] border border-black flex items-center justify-center font-mono font-black text-sm">
                      {item.icon}
                    </span>
                    <h3 className="font-display font-black text-lg text-black">
                      {item.title}
                    </h3>
                  </div>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-black text-white rounded">
                    ENTREGÁVEL 0{index + 1}
                  </span>
                </div>
                <p className="font-body text-sm text-gray-700 font-medium leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
