"use client";

import React, { useState } from "react";

export function LandingSecurityPanel() {
  const [activeTab, setActiveTab] = useState<"rls" | "ai" | "roadmap">("rls");

  return (
    <section
      id="seguranca"
      aria-labelledby="seguranca-title"
      className="w-full bg-white border-t-2 border-[var(--border-brutal,#1A1A1A)] py-16 sm:py-24"
    >
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-20 space-y-12">
        <div className="w-full max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto space-y-10 sm:space-y-12">
          {/* Header da Seção de Segurança */}
          <div className="text-center space-y-4">
            <h2
              id="seguranca-title"
              className="font-display font-black text-2xl sm:text-4xl md:text-5xl text-[var(--text-primary,#1A1A1A)]"
            >
              Quem responde pelo dado é a clínica
            </h2>

            <p className="text-[var(--text-secondary,#71717A)] font-medium text-sm sm:text-base lg:text-lg max-w-3xl mx-auto">
              Perante a LGPD, a controladora dos prontuários é você — nós somos operador. Por isso três respostas em linguagem direta: onde ficam os dados, o que a IA faz com eles e o que ainda não está pronto.
            </p>
          </div>

          {/* Tabs de Navegação */}
          <div
            role="tablist"
            aria-label="Tópicos de Segurança e Compliance"
            className="flex flex-wrap items-center justify-center gap-3 border-b-2 border-[var(--border-brutal,#1A1A1A)] pb-4"
          >
            <button
              role="tab"
              aria-selected={activeTab === "rls"}
              aria-controls="tabpanel-rls"
              id="tab-rls"
              onClick={() => setActiveTab("rls")}
              className={`font-mono text-xs sm:text-sm font-extrabold px-4 sm:px-5 py-3 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] transition-all cursor-pointer min-h-[44px] focus-visible:outline-focus outline-none ${
                activeTab === "rls"
                  ? "bg-[var(--action-primary,#F2B705)] shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)]"
                  : "bg-white shadow-[2px_2px_0px_#1A1A1A] hover:bg-gray-100"
              }`}
            >
              🔑 Onde ficam os dados
            </button>

            <button
              role="tab"
              aria-selected={activeTab === "ai"}
              aria-controls="tabpanel-ai"
              id="tab-ai"
              onClick={() => setActiveTab("ai")}
              className={`font-mono text-xs sm:text-sm font-extrabold px-4 sm:px-5 py-3 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] transition-all cursor-pointer min-h-[44px] focus-visible:outline-focus outline-none ${
                activeTab === "ai"
                  ? "bg-[var(--action-primary,#F2B705)] shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)]"
                  : "bg-white shadow-[2px_2px_0px_#1A1A1A] hover:bg-gray-100"
              }`}
            >
              🤖 O que a IA faz com o prontuário
            </button>

            <button
              role="tab"
              aria-selected={activeTab === "roadmap"}
              aria-controls="tabpanel-roadmap"
              id="tab-roadmap"
              onClick={() => setActiveTab("roadmap")}
              className={`font-mono text-xs sm:text-sm font-extrabold px-4 sm:px-5 py-3 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] transition-all cursor-pointer min-h-[44px] focus-visible:outline-focus outline-none ${
                activeTab === "roadmap"
                  ? "bg-[var(--action-primary,#F2B705)] shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)]"
                  : "bg-white shadow-[2px_2px_0px_#1A1A1A] hover:bg-gray-100"
              }`}
            >
              🗺️ O que ainda não está pronto
            </button>
          </div>

          {/* Conteúdo das Tabs */}
          <div className="w-full max-w-[1600px] mx-auto border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-[var(--bg-app,#FBF9F5)] p-6 sm:p-10 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)]">
            {/* Tab 1: RLS Multi-tenant */}
            {activeTab === "rls" && (
              <div
                id="tabpanel-rls"
                role="tabpanel"
                aria-labelledby="tab-rls"
                className="space-y-6 animate-fadeIn"
              >
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-[var(--color-gold-tint,#FFE082)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] text-2xl shrink-0" aria-hidden="true">
                    🔒
                  </span>
                  <div>
                    <h3 className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-[var(--text-primary,#1A1A1A)]">
                      Os dados de uma clínica não alcançam a outra
                    </h3>
                    <p className="font-mono text-xs sm:text-sm text-gray-600">A separação é imposta pelo banco, não pela aplicação</p>
                  </div>
                </div>

                <p className="text-gray-800 text-sm sm:text-base leading-relaxed font-medium">
                  A regra que separa as clínicas vive dentro do próprio banco de dados. Na prática: mesmo que alguém escreva uma consulta errada no sistema, o banco recusa devolver prontuário de outra clínica. Não depende de ninguém lembrar de aplicar um filtro — que é como vazamento entre clientes costuma acontecer. Uma bateria de testes roda a cada mudança justamente para provar isso.
                </p>

                <div className="bg-[var(--border-brutal,#1A1A1A)] text-emerald-400 p-4 sm:p-5 rounded-[var(--radius-control,5px)] font-mono text-xs sm:text-sm space-y-1 border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[2px_2px_0px_#000] overflow-x-auto">
                  <p className="text-gray-400">-- Para quem quiser mostrar ao seu time de TI: é a política aplicada no banco.</p>
                  <p>
                    <span className="text-purple-400">CREATE POLICY</span> clinic_isolation_policy{" "}
                    <span className="text-purple-400">ON</span> prontuarios
                  </p>
                  <p>
                    <span className="text-purple-400">FOR ALL USING</span> (clinica_id = current_setting(
                    <span className="text-yellow-300">&apos;app.current_tenant&apos;</span>));
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: IA Ética */}
            {activeTab === "ai" && (
              <div
                id="tabpanel-ai"
                role="tabpanel"
                aria-labelledby="tab-ai"
                className="space-y-6 animate-fadeIn"
              >
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-[var(--status-info-bg,#B2DFDB)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] text-2xl shrink-0" aria-hidden="true">
                    🛡️
                  </span>
                  <div>
                    <h3 className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-[var(--text-primary,#1A1A1A)]">
                      A IA sugere. Quem decide é o profissional.
                    </h3>
                    <p className="font-mono text-xs sm:text-sm text-gray-600">Seus diários não treinam modelo nenhum</p>
                  </div>
                </div>

                <p className="text-gray-800 text-sm sm:text-base leading-relaxed font-medium">
                  O diário é enviado para extrair evidência candidata e volta ligado ao trecho de origem. Enquanto um profissional não aprovar, aquilo não entra em gráfico, em pontuação de protocolo nem em relatório — é uma regra de arquitetura do produto, não uma configuração que alguém pode desligar.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-5 bg-white border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] shadow-[3px_3px_0px_#1A1A1A]">
                    <strong className="font-display font-bold text-base block mb-1">🚫 Nada vira dado sozinho</strong>
                    <span className="text-xs sm:text-sm text-gray-600">Evidência sem aprovação humana fica marcada como candidata e não conta para nada.</span>
                  </div>
                  <div className="p-5 bg-white border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] shadow-[3px_3px_0px_#1A1A1A]">
                    <strong className="font-display font-bold text-base block mb-1">📄 Trilha de quem aprovou</strong>
                    <span className="text-xs sm:text-sm text-gray-600">Autor, horário e o que foi editado ficam registrados na trilha de auditoria.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Roadmap */}
            {activeTab === "roadmap" && (
              <div
                id="tabpanel-roadmap"
                role="tabpanel"
                aria-labelledby="tab-roadmap"
                className="space-y-6 animate-fadeIn"
              >
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-[var(--status-success-bg,#C8E6C9)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] text-2xl shrink-0" aria-hidden="true">
                    🗺️
                  </span>
                  <div>
                    <h3 className="font-display font-black text-xl sm:text-2xl lg:text-3xl text-[var(--text-primary,#1A1A1A)]">
                      O que ainda está em construção
                    </h3>
                    <p className="font-mono text-xs sm:text-sm text-gray-600">Dito antes de você assinar, não depois</p>
                  </div>
                </div>

                <div className="space-y-4 font-body text-xs sm:text-sm">
                  <div className="flex flex-col sm:flex-row items-start gap-3 p-4 bg-white border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)]">
                    <span className="font-mono font-bold bg-[var(--action-primary,#F2B705)] text-[var(--text-primary,#1A1A1A)] px-2.5 py-0.5 rounded shrink-0">EM FECHAMENTO</span>
                    <div>
                      <strong className="font-bold text-sm sm:text-base text-[var(--text-primary,#1A1A1A)] block">
                        Contrato com o provedor de IA e lista pública de subprocessadores
                      </strong>
                      <span className="text-gray-600">Seus diários não são usados para treinar modelo nenhum. O documento formal que amarra isso ao fornecedor, e a página pública de subprocessadores, ainda estão sendo fechados — até lá, isto é compromisso declarado, não contrato que você pode ler.</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start gap-3 p-4 bg-white border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)]">
                    <span className="font-mono font-bold bg-blue-500 text-white px-2.5 py-0.5 rounded shrink-0">
                      EM ANDAMENTO
                    </span>
                    <div>
                      <strong className="font-bold text-sm sm:text-base text-[var(--text-primary,#1A1A1A)] block">
                        Réplica externa com restauração comprovada
                      </strong>
                      <span className="text-gray-600">
                        O backup local já é restaurado e verificado automaticamente. A cópia guardada fora do provedor ainda não teve a restauração validada ponta a ponta.
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start gap-3 p-4 bg-white border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)]">
                    <span className="font-mono font-bold bg-gray-600 text-white px-2.5 py-0.5 rounded shrink-0">NÃO DISPONÍVEL</span>
                    <div>
                      <strong className="font-bold text-sm sm:text-base text-[var(--text-primary,#1A1A1A)] block">
                        Ditado por voz
                      </strong>
                      <span className="text-gray-600">Depende de um adendo específico para tratamento de áudio. Fica fora do ar enquanto esse adendo não estiver assinado — hoje o registro é por texto.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
