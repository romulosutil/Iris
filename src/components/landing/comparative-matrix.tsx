import React from "react";

export function LandingComparativeMatrix() {
  const criteria = [
    {
      title: "“De onde saiu esse número do relatório?”",
      planilha: "De uma pontuação preenchida em campo. Não há como voltar à sessão que a gerou.",
      iris: "Da frase que a terapeuta escreveu. Cada dado guarda o trecho de origem, com data e autor.",
    },
    {
      title: "“A IA está pontuando meu protocolo?”",
      planilha: "Ela redige o relatório no fim, a partir de números que ninguém consegue rastrear depois.",
      iris: "Não. Ela sugere; nada entra em gráfico ou relatório sem um profissional aprovar.",
    },
    {
      title: "“Minha equipe vai preencher planilha na sessão?”",
      planilha: "Sim: formulário por tentativa, preenchido às pressas ou de memória no fim do dia.",
      iris: "Não. Texto livre no celular, logo depois do atendimento — do jeito que ela já descreve hoje.",
    },
    {
      title: "“E quando a coordenação não dá conta de revisar tudo?”",
      planilha: "Ou vira gargalo revisando tudo, ou assina relatório que não conseguiu ler.",
      iris: "Só o que destoa sobe: meta parada, evidência frágil, divergência entre registrado e aprovado.",
    },
    {
      title: "“Contratar mais um terapeuta aumenta minha fatura?”",
      planilha: "Aumenta: o preço cresce com o organograma — mais uma licença, mais um assento.",
      iris: "Não. A conta é por paciente ativo; a equipe inteira entra sem custo por assento.",
    },
    {
      title: "“Quanto tempo até minha equipe estar usando de verdade?”",
      planilha: "Depende de todo mundo aprender uma taxonomia nova e mudar como registra.",
      iris: "A equipe escreve como já escreve. Na carga inicial do histórico nós entramos junto — é manual e assumido como tal.",
    },
    {
      title: "“Se eu quiser sair, levo meus dados?”",
      planilha: "Histórico preso no formato do fornecedor; exportar vira negociação.",
      iris: "Exportação integral em PDF e JSON pela interface, a qualquer momento, sem chamado.",
    },
  ];

  return (
    <section
      id="diferenciais"
      aria-labelledby="diferenciais-title"
      className="w-full bg-[var(--color-gold-tint,#FFE082)]/30 border-y-2 border-[var(--border-brutal,#1A1A1A)] py-16 sm:py-24"
    >
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-20 space-y-12">
        <div className="text-center max-w-3xl lg:max-w-4xl mx-auto space-y-4">
          <div className="inline-block font-mono text-xs font-bold uppercase bg-[var(--action-primary,#F2B705)] px-3.5 py-1 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
            Antes de assinar com qualquer fornecedor
          </div>
          <h2
            id="diferenciais-title"
            className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-[var(--text-primary,#1A1A1A)]"
          >
            Faça estas sete perguntas. Inclusive para nós.
          </h2>
          <p className="text-[var(--text-primary,#1A1A1A)] font-medium text-base sm:text-lg">
            Não somos o único software de terapia infantil do Brasil, e os outros também já têm IA e relatório. É nestas sete respostas que a escolha se decide.
          </p>
        </div>

        {/* Tabela em Widescreen Full-Width (Desktop & Ultrawide) */}
        <div className="w-full max-w-[1700px] mx-auto border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-white shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-[var(--border-brutal,#1A1A1A)] text-white font-display text-base lg:text-lg">
                  <th className="p-5 border-r border-gray-700 w-1/3">O que perguntar</th>
                  <th className="p-5 border-r border-gray-700 w-1/3 text-gray-300">A resposta mais comum no mercado</th>
                  <th className="p-5 bg-[var(--action-primary,#F2B705)] text-[var(--text-primary,#1A1A1A)] font-black w-1/3 text-lg lg:text-xl">
                    Como o Iris responde
                  </th>
                </tr>
              </thead>
              <tbody className="font-body text-sm lg:text-base divide-y-2 divide-[var(--border-brutal,#1A1A1A)]">
                {criteria.map((c, index) => (
                  <tr key={index} className="hover:bg-amber-50/60 transition-colors">
                    <td className="p-5 font-bold text-[var(--text-primary,#1A1A1A)]">{c.title}</td>
                    <td className="p-5 text-gray-600">{c.planilha}</td>
                    <td className="p-5 font-bold text-[var(--text-primary,#1A1A1A)] bg-[var(--action-primary,#F2B705)]/10">
                      {c.iris}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cards de Apoio para Mobile (<768px) */}
        <div className="md:hidden space-y-4">
          {criteria.map((c, index) => (
            <div
              key={index}
              className="border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-white p-5 shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)] space-y-3"
            >
              <h3 className="font-display font-black text-lg text-[var(--text-primary,#1A1A1A)] border-b-2 border-dashed border-[var(--border-brutal,#1A1A1A)] pb-2">
                {c.title}
              </h3>

              <div className="space-y-2 text-xs">
                <div className="p-3 bg-gray-100 rounded border border-gray-300">
                  <span className="font-mono font-bold text-gray-500 block mb-1">❌ Resposta mais comum no mercado:</span>
                  <span className="text-gray-700">{c.planilha}</span>
                </div>

                <div className="p-3 bg-[var(--action-primary,#F2B705)]/15 rounded border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[1px_1px_0px_#1A1A1A]">
                  <span className="font-mono font-bold text-[var(--text-primary,#1A1A1A)] block mb-1">✨ Como o Iris responde:</span>
                  <span className="font-bold text-[var(--text-primary,#1A1A1A)]">{c.iris}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
