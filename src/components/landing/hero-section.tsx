"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingHeroSection() {
  const [activeTarget, setActiveTarget] = useState<number>(0);

  const sentences = [
    {
      id: 0,
      text: `"Hoje o Pedro manteve contato visual espontâneo por 4s no início da brincadeira com blocos de montar,"`,
      targetMeta: "META: Contato Visual Espontâneo",
      val: "Duração: 4s",
      desc: "Comportamento-alvo identificado no início da sessão.",
      badge: "[Candidata · aguardando aprovação · Parágrafo 1]",
      epistemicState: "suggestion",
    },
    {
      id: 1,
      text: `"realizou transição de atividade sem emitir comportamentos de esquiva (choro ou agressão),"`,
      targetMeta: "META: Transição de Atividade",
      val: "Esquiva: 0%",
      desc: "Ausência de comportamentos disruptivos durante troca de foco.",
      badge: "[Candidata · aguardando aprovação · Parágrafo 2]",
      epistemicState: "suggestion",
    },
    {
      id: 2,
      text: `"e respondeu com sucesso a 8 de 10 tentativas de pareamento de figuras funcionais."`,
      targetMeta: "META: Pareamento de Figuras",
      val: "Precisão: 80% (8/10)",
      desc: "Contagem mencionada espontaneamente pela terapeuta no relato.",
      badge: "[Candidata · aguardando aprovação · Parágrafo 3]",
      epistemicState: "suggestion",
    },
  ];

  return (
    <section
      aria-labelledby="hero-title"
      className="w-full py-12 sm:py-16 md:py-20 px-4 sm:px-8 lg:px-12 2xl:px-20 max-w-[1800px] mx-auto space-y-12 md:space-y-16"
    >
      {/* Hero Header & Modelo de Negócio: Conta Gratuita + Pago por Paciente */}
      <div className="w-full max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto text-center space-y-6">
        <div className="inline-flex flex-wrap items-center justify-center gap-2 font-mono text-xs font-bold uppercase">
          <span className="bg-white border-2 border-black px-3 py-1 rounded-[var(--radius-control,5px)] shadow-[2px_2px_0px_#000] text-black">
            ✓ Conta Grátis
          </span>
          <span className="bg-white border-2 border-black px-3 py-1 rounded-[var(--radius-control,5px)] shadow-[2px_2px_0px_#000] text-black">
            ✓ Equipe Ilimitada
          </span>
          <span className="bg-[#F2B705] border-2 border-black px-3 py-1 rounded-[var(--radius-control,5px)] shadow-[2px_2px_0px_#000] text-black">
            ★ Pague por Paciente Ativo
          </span>
        </div>

        <h1
          id="hero-title"
          className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl lg:text-6xl 2xl:text-7xl text-[var(--text-primary,#1A1A1A)] leading-[1.15] sm:leading-[1.1] tracking-tight text-balance"
        >
          O relatório que libera a próxima autorização leva dias para ficar pronto.{" "}
          <span className="bg-[var(--action-primary,#F2B705)] px-2.5 py-0.5 border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)] inline-block mt-1 sm:mt-0">
            Aqui ele é montado sessão a sessão.
          </span>
        </h1>

        <p className="font-body text-base sm:text-lg md:text-xl text-[var(--text-primary,#1A1A1A)] font-medium max-w-3xl lg:max-w-4xl 2xl:max-w-5xl mx-auto leading-relaxed text-balance">
          Sua equipe escreve o diário da sessão em texto livre, como já escreve hoje. O Iris organiza aquilo em evidência ligada às metas do PEI — e cada dado do relatório continua apontando para a frase que o sustenta.
        </p>

        {/* CTA Direto de Criar Conta Gratuita */}
        <div id="trial" className="pt-4 max-w-lg mx-auto space-y-3">
          <Button
            variante="primaria"
            tamanho="lg"
            asChild
            className="w-full text-lg sm:text-xl py-4 sm:py-5 min-h-[56px] shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] hover:shadow-[8px_8px_0px_#1A1A1A] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all justify-center"
          >
            <Link href="/cadastro" aria-label="Criar conta gratuita no Iris sem cartão de crédito">
              Criar conta grátis
            </Link>
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold text-[var(--text-secondary,#71717A)] font-mono">
            <span>✓ Conta e equipe sem custo</span>
            <span>·</span>
            <span>✓ 7 dias sem cobrança por paciente</span>
            <span>·</span>
            <span>✓ Sem cartão de crédito no cadastro</span>
          </div>
        </div>
      </div>

      {/* Widget Interativo: Raio-X de Proveniência (Demonstração Prática) */}
      <div id="como-funciona" className="w-full max-w-[1600px] 2xl:max-w-[1720px] mx-auto border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-white p-5 sm:p-8 lg:p-10 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 mb-6 border-b-2 border-[#1A1A1A] gap-3">
          <div className="flex items-center gap-3">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse border border-[var(--border-brutal,#1A1A1A)] shrink-0"></span>
            <h2 className="font-display font-black text-lg sm:text-xl text-[var(--text-primary,#1A1A1A)]">
              DE ONDE SAI CADA DADO DO RELATÓRIO
            </h2>
          </div>
          <span className="font-mono text-xs font-bold bg-[var(--status-info-bg,#B2DFDB)] px-3 py-1 rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] shadow-[1px_1px_0px_#1A1A1A] self-start sm:self-auto">
            Clique ou passe o mouse nas frases do diário à esquerda
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 2xl:gap-14 items-start">
          {/* Lado Esquerdo: Diário Narrativo */}
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-100 px-3.5 py-2 rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)]">
              <span className="font-mono text-xs font-bold text-gray-800">
                DIÁRIO DA SESSÃO · TEXTO LIVRE
              </span>
              <span className="font-mono text-xs text-gray-600">Sessão #14 · Hoje, 14:30</span>
            </div>

            <div className="p-5 sm:p-6 bg-[var(--bg-app,#FBF9F5)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] text-sm sm:text-base lg:text-lg leading-loose font-body text-[var(--text-primary,#1A1A1A)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]">
              <p>
                {sentences.map((s) => {
                  const isActive = activeTarget === s.id;
                  return (
                    <span
                      key={s.id}
                      onMouseEnter={() => setActiveTarget(s.id)}
                      onClick={() => setActiveTarget(s.id)}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isActive}
                      aria-label={`Selecionar parágrafo da evidência: ${s.targetMeta}`}
                      className={`transition-all duration-150 cursor-pointer px-1.5 py-0.5 rounded focus-visible:outline-focus inline ${
                        isActive
                          ? "bg-[var(--action-primary,#F2B705)] font-bold border-b-2 border-[var(--border-brutal,#1A1A1A)] shadow-[1px_1px_0px_#1A1A1A]"
                          : "border-b-2 border-dashed border-gray-400 hover:bg-[var(--color-gold-tint,#FFF6DB)]"
                      }`}
                    >
                      {s.text}{" "}
                    </span>
                  );
                })}
              </p>
            </div>
            <p className="text-xs font-mono text-gray-600 italic">
              * A terapeuta escreve no celular logo depois do atendimento. O texto original nunca é reescrito: fica no prontuário como foi digitado, com autor e horário.
            </p>
          </div>

          {/* Lado Direito: Extração Auditada */}
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-center justify-between bg-[var(--status-info-bg,#B2DFDB)] px-3.5 py-2 rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)]">
              <span className="font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)]">
                O QUE O IRIS EXTRAIU DESSE TEXTO
              </span>
              <span className="font-mono text-xs font-bold bg-white px-2 py-0.5 rounded border border-[var(--border-brutal,#1A1A1A)]">
                3 metas do PEI
              </span>
            </div>

            {sentences.map((s) => {
              const isActive = activeTarget === s.id;
              return (
                <div
                  key={s.id}
                  onMouseEnter={() => setActiveTarget(s.id)}
                  className={`transition-all duration-200 border-2 rounded-[var(--radius-control,5px)] p-4 sm:p-5 ${
                    isActive
                      ? "bg-[var(--action-primary,#F2B705)] border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,4px_4px_0px_#1A1A1A)] sm:scale-[1.01]"
                      : "bg-[var(--status-ia-bg,#F1E9F6)] border-dashed border-[var(--status-ia-border,#6A4C93)] opacity-90 shadow-[inset_0_1px_3px_rgba(106,76,147,0.1)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="font-display font-bold text-sm sm:text-base text-[var(--text-primary,#1A1A1A)]">
                      {s.targetMeta}
                    </span>
                    <span className="font-mono text-xs sm:text-sm font-extrabold bg-white px-2.5 py-0.5 border border-[var(--border-brutal,#1A1A1A)] rounded shrink-0">
                      {s.val}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-800 font-medium mb-2">{s.desc}</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded border ${
                        isActive
                          ? "bg-[var(--border-brutal,#1A1A1A)] text-white border-[var(--border-brutal,#1A1A1A)]"
                          : "bg-[var(--status-ia-bg,#F1E9F6)] text-[var(--status-ia-fg,#6A4C93)] border-[var(--status-ia-border,#6A4C93)]"
                      }`}
                    >
                      {s.badge}
                    </span>
                  </div>
                </div>
              );
            })}

            <p className="text-xs font-mono text-gray-600 italic">
              * Enquanto um profissional não aprovar, isto é candidato: não entra em gráfico, em pontuação de protocolo nem em relatório.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
