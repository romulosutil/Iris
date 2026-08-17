import React from "react";

export function LandingInsuranceReports() {
  const reportFeatures = [
    {
      title: "Dossiê bruto, com a trilha inteira",
      badge: "RESPONDE AUDITORIA",
      bgColor: "bg-[var(--action-primary,#F2B705)]",
      icon: "🔎",
      description:
        "Todas as evidências aprovadas no período, cada uma com data, autor e o trecho literal do diário que a originou. Derruba sozinha a alegação mais barata que uma operadora faz: “evolução relatada sem comprovação”.",
    },
    {
      title: "Relatório de evolução redigido",
      badge: "PARA REVISAR E ASSINAR",
      bgColor: "bg-[var(--status-info-bg,#B2DFDB)]",
      icon: "📄",
      description:
        "Rascunho narrativo montado a partir do que já foi aprovado, com ABA, T.O. e Fono reunidos — ninguém precisa perseguir três profissionais na véspera. A coordenação edita e assina com o registro dela.",
    },
    {
      title: "Uma versão para a família",
      badge: "MESMO PERÍODO, OUTRA LINGUAGEM",
      bgColor: "bg-[var(--status-success-bg,#C8E6C9)]",
      icon: "👪",
      description:
        "O mesmo material sem jargão de protocolo, para o responsável entender. A reunião de devolutiva deixa de exigir uma preparação separada.",
    },
    {
      title: "O que não prometemos",
      badge: "ACEITAÇÃO QUEM DECIDE É A OPERADORA",
      bgColor: "bg-[var(--color-gold-tint,#FFE082)]",
      icon: "⚖️",
      description:
        "Nenhum software garante que um convênio vai aprovar — desconfie de quem garante. O que dá para eliminar é a rejeição por falta de registro; o mérito clínico segue sendo discussão entre profissionais.",
    },
  ];

  return (
    <section
      id="relatorios-convenio"
      aria-labelledby="relatorios-title"
      className="w-full border-y-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--border-brutal,#1A1A1A)] py-16 text-white shadow-[0px_6px_0px_#F2B705] sm:py-24"
    >
      <div className="mx-auto w-full max-w-[1800px] space-y-12 px-4 sm:px-8 md:space-y-16 lg:px-12 2xl:px-20">
        {/* Header de Relatórios Anti-Glosa */}
        <div className="mx-auto max-w-3xl space-y-4 text-center lg:max-w-4xl">
          <div className="inline-block rounded-[var(--radius-control,5px)] border-2 border-white bg-[var(--action-primary,#F2B705)] px-3.5 py-1 font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)] uppercase shadow-[var(--ds-shadow,2px_2px_0px_#FFF)]">
            Autorização de continuidade e prestação de contas
          </div>
          <h2
            id="relatorios-title"
            className="font-display text-3xl font-extrabold text-white sm:text-4xl md:text-5xl"
          >
            O relatório não é escrito no fim do ciclo. Ele é montado o ciclo
            inteiro.
          </h2>
          <p className="mx-auto max-w-2xl text-base font-medium text-gray-300 sm:text-lg">
            Cada sessão aprovada já é uma linha do documento. Quando a operadora
            pede a evolução, o que sobra é revisar e assinar — não reler meses
            de prontuário atrás do que sustenta cada avanço.
          </p>
        </div>

        {/* Grid de Funcionalidades do Relatório */}
        <div className="mx-auto grid w-full max-w-[1700px] grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 2xl:gap-10">
          {reportFeatures.map((f, index) => (
            <div
              key={index}
              className="flex flex-col justify-between rounded-[var(--radius-md,6px)] border-2 border-white bg-white p-6 text-[var(--text-primary,#1A1A1A)] shadow-[var(--ds-shadow,4px_4px_0px_#F2B705)] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0px_#F2B705] sm:p-7"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono text-[10px] font-black uppercase ${f.bgColor} rounded border border-[var(--border-brutal,#1A1A1A)] px-2.5 py-1 text-[var(--text-primary,#1A1A1A)] shadow-[1px_1px_0px_#1A1A1A]`}
                  >
                    {f.badge}
                  </span>
                  <span className="text-2xl" aria-hidden="true">
                    {f.icon}
                  </span>
                </div>

                <h3 className="font-display text-xl leading-tight font-black text-[var(--text-primary,#1A1A1A)]">
                  {f.title}
                </h3>

                <p className="text-sm leading-relaxed font-medium text-gray-700">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Mockup de Relatório de Evolução com Nota de Proveniência */}
        <div className="mx-auto w-full max-w-[1500px] space-y-6 rounded-[var(--radius-md,6px)] border-2 border-white bg-[#242424] p-6 shadow-[8px_8px_0px_#F2B705] sm:p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-3 border-b border-gray-700 pb-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="rounded bg-[var(--action-primary,#F2B705)] px-3 py-1 font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)]">
                EXEMPLO DE RELATÓRIO EMITIDO PELO IRIS
              </span>
              <span className="font-mono text-xs text-gray-400">
                Trecho ilustrativo · evolução trimestral
              </span>
            </div>
            <span className="rounded border border-emerald-700 bg-emerald-950/80 px-3 py-1 font-mono text-xs font-bold text-emerald-400">
              ✓ Com anexo de origem
            </span>
          </div>

          <div className="font-body space-y-4 rounded-[var(--radius-control,5px)] border border-gray-300 bg-white p-6 text-xs leading-relaxed text-[var(--text-primary,#1A1A1A)] shadow-inner sm:p-8 sm:text-sm">
            <div className="flex justify-between border-b pb-3 font-mono text-xs font-bold text-gray-600">
              <span>PACIENTE: Gabriel M. (4 anos)</span>
              <span>PERÍODO: mar–mai / 2026</span>
              <span>RESPONSÁVEL TÉCNICA: Fernanda Ramos (CRP 06/123456)</span>
            </div>

            <p>
              <strong>Evolução do domínio de comunicação e linguagem:</strong>
              <br />
              Progresso consistente na emissão de pedidos espontâneos com frases
              de 2 a 3 palavras, mantido em contextos e interlocutores
              diferentes ao longo do trimestre.
            </p>

            <div className="space-y-1 rounded border-l-4 border-[var(--action-primary,#F2B705)] bg-[var(--bg-app,#FBF9F5)] p-3.5 font-mono text-xs">
              <span className="block font-bold text-[var(--text-primary,#1A1A1A)]">
                ANEXO · DE ONDE SAIU CADA AFIRMAÇÃO ACIMA:
              </span>
              <p className="text-gray-700">
                • <strong>Sessão #12 (14/05/2026 14:30 · A. Souza)</strong>:{" "}
                <em>
                  &quot;Gabriel pediu suco sozinho, falou &apos;quero suco&apos;
                  sem eu dar o modelo...&quot;
                </em>
              </p>
              <p className="text-gray-700">
                • <strong>Sessão #18 (28/05/2026 15:10 · A. Souza)</strong>:{" "}
                <em>
                  &quot;Manteve o pedido com três palavras em cinco
                  oportunidades seguidas...&quot;
                </em>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
