import React from "react";

export function LandingTrustBar() {
  const trustCards = [
    {
      title: "Nenhuma outra clínica enxerga seu prontuário",
      icon: "🔑",
      tag: "ISOLAMENTO",
      bgColor: "bg-[var(--status-info-bg,#B2DFDB)]",
      description: "A separação é imposta pelo próprio banco de dados. Não depende de alguém lembrar de aplicar um filtro no sistema — que é como vazamento entre clientes costuma acontecer.",
    },
    {
      title: "Dá para provar quem viu e quem mudou o quê",
      icon: "📜",
      tag: "AUDITORIA",
      bgColor: "bg-[var(--action-primary,#F2B705)]",
      description: "Leitura, edição, aprovação e exportação ficam registradas com autor e horário. Nem o sistema tem permissão de apagar ou reescrever esse registro.",
    },
    {
      title: "Senha vazada não abre prontuário",
      icon: "🛡️",
      tag: "ACESSO",
      bgColor: "bg-[var(--color-gold-tint,#FFE082)]",
      description: "O segundo fator é obrigatório para todo mundo que acessa prontuário, sem exceção por cargo. Não há sessão aberta sem ele.",
    },
    {
      title: "O backup é restaurado toda vez, não só guardado",
      icon: "🔒",
      tag: "CONTINUIDADE",
      bgColor: "bg-[var(--status-success-bg,#C8E6C9)]",
      description: "A rotina restaura a cópia em um banco limpo e confere se tudo voltou íntegro. Backup que nunca foi restaurado não é backup — é esperança.",
    },
    {
      title: "Você leva seus dados embora quando quiser",
      icon: "📦",
      tag: "PORTABILIDADE",
      bgColor: "bg-[#E1BEE7]",
      description: "Exportação integral em PDF e JSON pela própria interface, a qualquer momento, sem abrir chamado e sem conversa de retenção.",
    },
  ];

  return (
    <section
      id="seguranca"
      aria-label="Garantias de Segurança, LGPD e Compliance"
      className="w-full bg-[var(--border-brutal,#1A1A1A)] text-white py-12 sm:py-16 border-y-2 border-[var(--border-brutal,#1A1A1A)] shadow-[0px_6px_0px_#F2B705]"
    >
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-20 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="font-mono text-xs font-bold text-[var(--action-primary,#F2B705)] uppercase tracking-wider">
            Segurança e LGPD
          </span>
          <h2 className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-white">
            Se vazar, quem responde é a sua clínica
          </h2>
        </div>

        {/* Grid de Cards de Confiança em Widescreen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
          {trustCards.map((card, index) => (
            <div
              key={index}
              className="bg-white text-[var(--text-primary,#1A1A1A)] border-2 border-white rounded-[var(--radius-md,6px)] p-5 shadow-[4px_4px_0px_#F2B705] hover:-translate-y-1 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" aria-hidden="true">
                    {card.icon}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-black uppercase ${card.bgColor} px-2 py-0.5 rounded border border-[var(--border-brutal,#1A1A1A)]`}
                  >
                    {card.tag}
                  </span>
                </div>
                <h3 className="font-display font-bold text-base text-[var(--text-primary,#1A1A1A)] leading-snug">
                  {card.title}
                </h3>
                <p className="text-xs text-gray-700 font-medium leading-relaxed">
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
