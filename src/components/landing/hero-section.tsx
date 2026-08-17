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
      className="mx-auto w-full max-w-[1800px] space-y-12 px-4 py-12 sm:px-8 sm:py-16 md:space-y-16 md:py-20 lg:px-12 2xl:px-20"
    >
      {/* Hero Header & Modelo de Negócio: Conta Gratuita + Pago por Paciente */}
      <div className="mx-auto w-full max-w-5xl space-y-6 text-center lg:max-w-6xl 2xl:max-w-7xl">
        <div className="inline-flex flex-wrap items-center justify-center gap-2 font-mono text-xs font-bold uppercase">
          <span className="rounded-[var(--radius-control,5px)] border-2 border-black bg-white px-3 py-1 text-black shadow-[2px_2px_0px_#000]">
            ✓ Conta Grátis
          </span>
          <span className="rounded-[var(--radius-control,5px)] border-2 border-black bg-white px-3 py-1 text-black shadow-[2px_2px_0px_#000]">
            ✓ Equipe Ilimitada
          </span>
          <span className="rounded-[var(--radius-control,5px)] border-2 border-black bg-[#F2B705] px-3 py-1 text-black shadow-[2px_2px_0px_#000]">
            ★ Pague por Ficha Ativa
          </span>
        </div>

        <h1
          id="hero-title"
          className="font-display text-3xl leading-[1.15] font-extrabold tracking-tight text-balance text-[var(--text-primary,#1A1A1A)] sm:text-4xl sm:leading-[1.1] md:text-5xl lg:text-6xl 2xl:text-7xl"
        >
          O relatório que libera a próxima autorização leva dias para ficar
          pronto.{" "}
          <span className="mt-1 inline-block rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--action-primary,#F2B705)] px-2.5 py-0.5 shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)] sm:mt-0">
            Aqui ele é montado sessão a sessão.
          </span>
        </h1>

        <p className="font-body mx-auto max-w-3xl text-base leading-relaxed font-medium text-balance text-[var(--text-primary,#1A1A1A)] sm:text-lg md:text-xl lg:max-w-4xl 2xl:max-w-5xl">
          Sua equipe escreve o diário da sessão em texto livre, como já escreve
          hoje. O Iris organiza aquilo em evidência ligada às metas do PEI — e
          cada dado do relatório continua apontando para a frase que o sustenta.
        </p>

        {/* CTA Direto de Criar Conta Gratuita */}
        <div id="trial" className="mx-auto max-w-lg space-y-3 pt-4">
          <Button
            variante="primaria"
            tamanho="lg"
            asChild
            className="min-h-[56px] w-full justify-center py-4 text-lg shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[8px_8px_0px_#1A1A1A] sm:py-5 sm:text-xl"
          >
            <Link
              href="/cadastro"
              aria-label="Criar conta gratuita no Iris sem cartão de crédito"
            >
              Criar conta grátis
            </Link>
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-xs font-semibold text-[var(--text-secondary,#71717A)]">
            <span>✓ Conta e equipe sem custo</span>
            <span>·</span>
            <span>✓ 7 dias de teste a partir do 1º paciente</span>
            <span>·</span>
            <span>✓ Sem cartão de crédito no cadastro</span>
          </div>
          {/*
            O relógio do teste começa no cadastro do primeiro paciente, não no
            cadastro da conta — dizer "a partir do cadastro" seria falso. E o fim
            do teste não bloqueia a conta nem dispara cobrança automática: a conta
            passa a somente-leitura com exportação livre. Prometer aqui o que a
            entrega faz é o que evita a conversa cara depois.
          */}
          <p className="font-mono text-[11px] leading-relaxed text-[var(--text-secondary,#71717A)]">
            Os 7 dias começam a correr quando você cadastra o primeiro paciente.
            No fim do teste nada é cobrado sem você contratar: a conta passa a{" "}
            <strong className="font-bold">somente-leitura</strong>, com o
            histórico inteiro visível e exportável em PDF e JSON.
          </p>
        </div>
      </div>

      {/* Widget Interativo: Raio-X de Proveniência (Demonstração Prática) */}
      <div
        id="como-funciona"
        className="mx-auto w-full max-w-[1600px] rounded-[var(--radius-md,6px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-white p-5 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] sm:p-8 lg:p-10 2xl:max-w-[1720px]"
      >
        <div className="mb-6 flex flex-col justify-between gap-3 border-b-2 border-[#1A1A1A] pb-4 sm:flex-row sm:items-center sm:pb-6">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full border border-[var(--border-brutal,#1A1A1A)] bg-emerald-500"></span>
            <h2 className="font-display text-lg font-black text-[var(--text-primary,#1A1A1A)] sm:text-xl">
              DE ONDE SAI CADA DADO DO RELATÓRIO
            </h2>
          </div>
          <span className="self-start rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-info-bg,#B2DFDB)] px-3 py-1 font-mono text-xs font-bold shadow-[1px_1px_0px_#1A1A1A] sm:self-auto">
            Clique ou passe o mouse nas frases do diário à esquerda
          </span>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-10 2xl:gap-14">
          {/* Lado Esquerdo: Diário Narrativo */}
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-gray-100 px-3.5 py-2">
              <span className="font-mono text-xs font-bold text-gray-800">
                DIÁRIO DA SESSÃO · TEXTO LIVRE
              </span>
              <span className="font-mono text-xs text-gray-600">
                Sessão #14 · Hoje, 14:30
              </span>
            </div>

            <div className="font-body rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-5 text-sm leading-loose text-[var(--text-primary,#1A1A1A)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)] sm:p-6 sm:text-base lg:text-lg">
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
                      className={`focus-visible:outline-focus inline cursor-pointer rounded px-1.5 py-0.5 transition-all duration-150 ${
                        isActive
                          ? "border-b-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--action-primary,#F2B705)] font-bold shadow-[1px_1px_0px_#1A1A1A]"
                          : "border-b-2 border-dashed border-gray-400 hover:bg-[var(--color-gold-tint,#FFF6DB)]"
                      }`}
                    >
                      {s.text}{" "}
                    </span>
                  );
                })}
              </p>
            </div>
            <p className="font-mono text-xs text-gray-600 italic">
              * A terapeuta escreve no celular logo depois do atendimento. O
              texto original nunca é reescrito: fica no prontuário como foi
              digitado, com autor e horário.
            </p>
          </div>

          {/* Lado Direito: Extração Auditada */}
          <div className="space-y-4" aria-live="polite">
            <div className="flex items-center justify-between rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-info-bg,#B2DFDB)] px-3.5 py-2">
              <span className="font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)]">
                O QUE O IRIS EXTRAIU DESSE TEXTO
              </span>
              <span className="rounded border border-[var(--border-brutal,#1A1A1A)] bg-white px-2 py-0.5 font-mono text-xs font-bold">
                3 metas do PEI
              </span>
            </div>

            {sentences.map((s) => {
              const isActive = activeTarget === s.id;
              return (
                <div
                  key={s.id}
                  onMouseEnter={() => setActiveTarget(s.id)}
                  className={`rounded-[var(--radius-control,5px)] border-2 p-4 transition-all duration-200 sm:p-5 ${
                    isActive
                      ? "border-[var(--border-brutal,#1A1A1A)] bg-[var(--action-primary,#F2B705)] shadow-[var(--ds-shadow,4px_4px_0px_#1A1A1A)] sm:scale-[1.01]"
                      : "border-dashed border-[var(--status-ia-border,#6A4C93)] bg-[var(--status-ia-bg,#F1E9F6)] opacity-90 shadow-[inset_0_1px_3px_rgba(106,76,147,0.1)]"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-[var(--text-primary,#1A1A1A)] sm:text-base">
                      {s.targetMeta}
                    </span>
                    <span className="shrink-0 rounded border border-[var(--border-brutal,#1A1A1A)] bg-white px-2.5 py-0.5 font-mono text-xs font-extrabold sm:text-sm">
                      {s.val}
                    </span>
                  </div>
                  <p className="mb-2 text-xs font-medium text-gray-800 sm:text-sm">
                    {s.desc}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold sm:text-xs ${
                        isActive
                          ? "border-[var(--border-brutal,#1A1A1A)] bg-[var(--border-brutal,#1A1A1A)] text-white"
                          : "border-[var(--status-ia-border,#6A4C93)] bg-[var(--status-ia-bg,#F1E9F6)] text-[var(--status-ia-fg,#6A4C93)]"
                      }`}
                    >
                      {s.badge}
                    </span>
                  </div>
                </div>
              );
            })}

            <p className="font-mono text-xs text-gray-600 italic">
              * Enquanto um profissional não aprovar, isto é candidato: não
              entra em gráfico, em pontuação de protocolo nem em relatório.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
