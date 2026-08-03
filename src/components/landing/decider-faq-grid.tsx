import React from "react";

export function LandingDeciderFaqGrid() {
  const faqGrid = [
    {
      question: "De onde saiu esse número no relatório? Consigo chegar na sessão que o originou?",
      answer: "Toda evidência guarda o trecho literal do diário, com autor e horário. É o que o dossiê exporta.",
    },
    {
      question: "A IA está pontuando meu protocolo ou sugerindo algo para um humano decidir?",
      answer: "Sugerindo. Nada entra em gráfico ou relatório sem aprovação de um profissional, e a tela mostra qual é qual.",
    },
    {
      question: "Minha equipe vai precisar preencher planilha de tentativa durante o atendimento?",
      answer: "Não. O registro é texto livre. Quando a terapeuta menciona a contagem no relato, o número é capturado; ele nunca é exigido para salvar.",
    },
    {
      question: "Cadastrar mais um terapeuta aumenta minha fatura?",
      answer: "Não. A cobrança é por paciente ativo; usuários são ilimitados — inclusive fono, TO e coordenação no mesmo prontuário.",
    },
    {
      question: "Se eu cancelar, o que acontece com o histórico dos pacientes?",
      answer: "Exportação integral em PDF e JSON, a qualquer momento, sem pedir para o suporte. Paciente arquivado sai da fatura e continua legível.",
    },
    {
      question: "Quem responde pela LGPD se vazar?",
      answer: "A clínica é a controladora e nós somos operador — está nos Termos de Uso e na Política de Privacidade, públicos, antes de você criar a conta.",
    },
  ];

  return (
    <section
      aria-label="Perguntas Decisoras da Direção Clínica"
      className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 2xl:px-20 max-w-[1800px] mx-auto space-y-12"
    >
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-block font-mono text-xs font-bold uppercase bg-[var(--action-primary,#F2B705)] text-[var(--text-primary,#1A1A1A)] px-3.5 py-1 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
          Respostas Diretas para o Decisor de Compra
        </div>
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-[var(--text-primary,#1A1A1A)]">
          Dúvidas Frequentes da Direção da Clínica
        </h2>
      </div>

      {/* Grid Neobrutalista 2 Colunas com Moldura Limpa de Alta Visibilidade */}
      <div className="w-full max-w-[1700px] mx-auto border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-white shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y-2 md:divide-y-0 md:divide-x-2 divide-[var(--border-brutal,#1A1A1A)]">
          {/* Coluna Esquerda: Itens 0, 2, 4 */}
          <div className="divide-y-2 divide-[var(--border-brutal,#1A1A1A)]">
            {[faqGrid[0], faqGrid[2], faqGrid[4]].map((item, idx) => (
              <div key={idx} className="p-6 sm:p-8 space-y-3 hover:bg-amber-50/50 transition-colors">
                <h3 className="font-display font-bold text-base sm:text-lg text-[var(--text-primary,#1A1A1A)] leading-snug">
                  {item?.question}
                </h3>
                <p className="font-body text-sm text-gray-700 font-medium leading-relaxed">
                  {item?.answer}
                </p>
              </div>
            ))}
          </div>

          {/* Coluna Direita: Itens 1, 3, 5 */}
          <div className="divide-y-2 divide-[var(--border-brutal,#1A1A1A)]">
            {[faqGrid[1], faqGrid[3], faqGrid[5]].map((item, idx) => (
              <div key={idx} className="p-6 sm:p-8 space-y-3 hover:bg-amber-50/50 transition-colors">
                <h3 className="font-display font-bold text-base sm:text-lg text-[var(--text-primary,#1A1A1A)] leading-snug">
                  {item?.question}
                </h3>
                <p className="font-body text-sm text-gray-700 font-medium leading-relaxed">
                  {item?.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
