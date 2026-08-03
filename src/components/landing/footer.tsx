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
    <footer className="w-full bg-[var(--border-brutal,#1A1A1A)] text-white border-t-2 border-[var(--border-brutal,#1A1A1A)] pt-12 sm:pt-16 pb-10 sm:pb-12">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-20 space-y-10 sm:space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Coluna 1: Logo & Proposta de Valor Humanizada */}
          <div className="md:col-span-5 space-y-4">
            <Link
              href="/institucional"
              className="inline-block focus-visible:outline-focus outline-none"
              aria-label="Ir para a página inicial do IRIS"
            >
              <Logo altura={40} tom="mono" className="text-white" aria-label="Iris Logo Footer" />
            </Link>

            <p className="text-sm text-gray-300 max-w-sm leading-relaxed font-body">
              Prontuário para clínicas de terapia infantil que transforma o diário da sessão em evidência rastreável até a frase que a originou. ABA, Terapia Ocupacional e Fonoaudiologia no mesmo prontuário.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button variante="primaria" tamanho="sm" asChild>
                <Link href="/cadastro" aria-label="Criar conta gratuita no Iris">
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
          <div className="md:col-span-3 space-y-3 font-body text-sm">
            <h3 className="font-display font-bold text-base text-[var(--action-primary,#F2B705)] uppercase tracking-wider font-mono">
              Navegação
            </h3>
            <ul className="space-y-2 text-gray-300">
              <li>
                <a href="#protocolos" className="hover:text-white transition-colors focus-visible:outline-focus outline-none">
                  Protocolos (VB-MAPP, Denver, PEI)
                </a>
              </li>
              <li>
                <a href="#relatorios-convenio" className="hover:text-white transition-colors focus-visible:outline-focus outline-none">
                  Relatórios de evolução
                </a>
              </li>
              <li>
                <a href="#recursos" className="hover:text-white transition-colors focus-visible:outline-focus outline-none">
                  O que muda para cada papel
                </a>
              </li>
              <li>
                <a href="#diferenciais" className="hover:text-white transition-colors focus-visible:outline-focus outline-none">
                  Perguntas para fazer a qualquer fornecedor
                </a>
              </li>
              <li>
                <a href="#calculadora" className="hover:text-white transition-colors focus-visible:outline-focus outline-none">
                  Simule o custo da sua clínica
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Fale Conosco */}
          <div className="md:col-span-4 space-y-3">
            <h3 className="font-display font-bold text-base text-[var(--action-primary,#F2B705)] uppercase tracking-wider font-mono">
              Fale com quem constrói o produto
            </h3>
            <p className="text-xs text-gray-300">
              Dúvida sobre relatório de convênio, carga inicial do histórico ou preço de fundador? Deixe seu e-mail que retornamos.
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
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-[var(--radius-control,5px)] px-3.5 py-2.5 text-xs focus:outline-none focus:border-[var(--action-primary,#F2B705)] min-h-[44px]"
              />
              <Button
                type="submit"
                variante="primaria"
                tamanho="sm"
                isLoading={isSubmitting}
                className="w-full text-xs py-2 min-h-[44px] justify-center"
              >
                Quero falar com alguém
              </Button>
            </form>
          </div>
        </div>

        {/* Divisor e Copyright */}
        <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-400 font-mono gap-4 text-center sm:text-left">
          <span>© 2026 Iris · R Sutil Correa Ltda · CNPJ 29.811.201/0001-50</span>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/termos" className="hover:underline">
              Termos de Uso
            </Link>
            <span>·</span>
            <Link href="/privacidade" className="hover:underline">
              Política de Privacidade (LGPD)
            </Link>
            <span>·</span>
            <a href="#seguranca" className="hover:underline">
              Segurança e LGPD
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
