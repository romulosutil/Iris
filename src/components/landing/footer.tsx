"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export function LandingFooter() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    setTimeout(() => {
      alert(`Obrigado pelo contato! Retornaremos no e-mail: ${email}`);
      setEmail("");
      setIsSubmitting(false);
    }, 400);
  };

  return (
    <footer className="w-full border-t-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--border-brutal,#1A1A1A)] pt-12 pb-10 text-white sm:pt-16 sm:pb-12">
      <div className="mx-auto max-w-[1800px] space-y-10 px-4 sm:space-y-12 sm:px-8 lg:px-12 2xl:px-20">
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
          {/* Coluna 1: Logo & Proposta de Valor Humanizada */}
          <div className="space-y-4 md:col-span-5">
            <Link
              href="/institucional"
              className="focus-visible:outline-focus inline-flex min-h-11 items-center outline-none"
              aria-label="Ir para a página inicial do IRIS"
            >
              <Logo
                altura={40}
                tom="mono"
                className="text-white"
                aria-label="Iris Logo Footer"
              />
            </Link>

            <p className="font-body max-w-sm text-sm leading-relaxed text-gray-300">
              Prontuário para clínicas de terapia infantil que transforma o
              diário da sessão em evidência rastreável até a frase que a
              originou. ABA, Terapia Ocupacional e Fonoaudiologia no mesmo
              prontuário.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button variante="primaria" tamanho="sm" asChild>
                <Link
                  href="/cadastro"
                  aria-label="Criar conta gratuita no Iris"
                >
                  Criar conta grátis
                </Link>
              </Button>
              <Button variante="secundaria" tamanho="sm" asChild>
                <Link href="/login" aria-label="Acessar Área do Cliente">
                  Entrar
                </Link>
              </Button>
            </div>
          </div>

          {/* Coluna 2: Navegação Rápida */}
          <div className="font-body space-y-3 text-sm md:col-span-3">
            <h3 className="font-display font-mono text-base font-bold tracking-wider text-[var(--action-primary,#F2B705)] uppercase">
              Navegação
            </h3>
            <ul className="space-y-2 text-gray-300">
              <li>
                <a
                  href="#protocolos"
                  className="focus-visible:outline-focus transition-colors outline-none hover:text-white"
                >
                  Protocolos (VB-MAPP, Denver, PEI)
                </a>
              </li>
              <li>
                <a
                  href="#relatorios-convenio"
                  className="focus-visible:outline-focus transition-colors outline-none hover:text-white"
                >
                  Relatórios de evolução
                </a>
              </li>
              <li>
                <a
                  href="#recursos"
                  className="focus-visible:outline-focus transition-colors outline-none hover:text-white"
                >
                  O que muda para cada papel
                </a>
              </li>
              <li>
                <a
                  href="#diferenciais"
                  className="focus-visible:outline-focus transition-colors outline-none hover:text-white"
                >
                  Perguntas para fazer a qualquer fornecedor
                </a>
              </li>
              <li>
                <a
                  href="#calculadora"
                  className="focus-visible:outline-focus transition-colors outline-none hover:text-white"
                >
                  Simule o custo da sua clínica
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Fale Conosco */}
          <div className="space-y-3 md:col-span-4">
            <h3 className="font-display font-mono text-base font-bold tracking-wider text-[var(--action-primary,#F2B705)] uppercase">
              Fale com quem constrói o produto
            </h3>
            <p className="text-xs text-gray-300">
              Dúvida sobre relatório de convênio, carga inicial do histórico ou
              preço de fundador? Deixe seu e-mail que retornamos.
            </p>

            <form onSubmit={handleContactSubmit} className="space-y-2">
              <label htmlFor="footer-contact-email" className="sr-only">
                Seu e-mail profissional
              </label>
              <input
                id="footer-contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Seu e-mail de trabalho..."
                className="min-h-[44px] w-full rounded-[var(--radius-control,5px)] border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-xs text-white focus:border-[var(--action-primary,#F2B705)] focus:outline-none"
              />
              <Button
                type="submit"
                variante="primaria"
                tamanho="sm"
                isLoading={isSubmitting}
                className="min-h-[44px] w-full justify-center py-2 text-xs"
              >
                Quero falar com alguém
              </Button>
            </form>
          </div>
        </div>

        {/* Divisor e Copyright */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 text-center font-mono text-xs text-gray-400 sm:flex-row sm:text-left">
          <span>
            © 2026 Iris · R Sutil Correa Ltda · CNPJ 29.811.201/0001-50
          </span>
          {/* data-toque-inline: barra legal do rodapé é lista curta de links em
              texto corrido, exceção prevista pelo WCAG 2.2 SC 2.5.8. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/termos" className="hover:underline" data-toque-inline>
              Termos de Uso
            </Link>
            <span>·</span>
            <Link
              href="/privacidade"
              className="hover:underline"
              data-toque-inline
            >
              Política de Privacidade (LGPD)
            </Link>
            <span>·</span>
            <a href="#seguranca" className="hover:underline" data-toque-inline>
              Segurança e LGPD
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
