"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full sticky top-0 z-50 bg-[var(--bg-app,#FBF9F5)]/95 backdrop-blur-md border-b-2 border-[var(--border-brutal,#1A1A1A)] transition-colors">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 2xl:px-20 h-20 flex items-center justify-between">
        {/* Logo Iris Neobrutalista */}
        <Link
          href="/institucional"
          className="flex items-center gap-3 group focus-visible:outline-focus outline-none focus-visible:outline-offset-2 rounded-[var(--radius-control,5px)] shrink-0"
          aria-label="Ir para a página inicial do IRIS Governança Clínica"
        >
          <Logo altura={42} animado aria-label="Iris Governança Clínica Logo" />
          <div className="hidden sm:flex flex-col">
            <span className="font-mono text-[10px] font-bold text-[var(--text-primary,#1A1A1A)] tracking-wider uppercase bg-[var(--status-info-bg,#B2DFDB)] px-2 py-0.5 border border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-xs,3px)] shadow-[1px_1px_0px_#1A1A1A]">
              Governança Clínica & Prontuário ABA
            </span>
          </div>
        </Link>

        {/* Navegação Desktop */}
        <nav
          aria-label="Navegação Principal Desktop"
          className="hidden lg:flex items-center gap-6 xl:gap-8 font-display font-bold text-sm"
        >
          <a
            href="#protocolos"
            className="text-[var(--text-primary,#1A1A1A)] hover:text-black hover:underline decoration-2 underline-offset-4 decoration-[var(--action-primary,#F2B705)] transition-all focus-visible:outline-focus outline-none"
          >
            Protocolos
          </a>
          <a
            href="#relatorios-convenio"
            className="text-[var(--text-primary,#1A1A1A)] hover:text-black hover:underline decoration-2 underline-offset-4 decoration-[var(--action-primary,#F2B705)] transition-all focus-visible:outline-focus outline-none"
          >
            Relatórios Anti-Glosa
          </a>
          <a
            href="#recursos"
            className="text-[var(--text-primary,#1A1A1A)] hover:text-black hover:underline decoration-2 underline-offset-4 decoration-[var(--action-primary,#F2B705)] transition-all focus-visible:outline-focus outline-none"
          >
            Benefícios
          </a>
          <a
            href="#diferenciais"
            className="text-[var(--text-primary,#1A1A1A)] hover:text-black hover:underline decoration-2 underline-offset-4 decoration-[var(--action-primary,#F2B705)] transition-all focus-visible:outline-focus outline-none"
          >
            Iris vs. Planilhas
          </a>
          <a
            href="#calculadora"
            className="text-[var(--text-primary,#1A1A1A)] hover:text-black hover:underline decoration-2 underline-offset-4 decoration-[var(--action-primary,#F2B705)] transition-all focus-visible:outline-focus outline-none"
          >
            Simulador de Custo
          </a>
          <a
            href="#seguranca"
            className="flex items-center gap-1.5 bg-[var(--status-info-bg,#B2DFDB)] border-2 border-[var(--border-brutal,#1A1A1A)] px-3 py-1.5 rounded-[var(--radius-control,5px)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)] hover:bg-[#80CBC4] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[var(--ds-shadow-hover,4px_4px_0px_#1A1A1A)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)] focus-visible:outline-focus outline-none"
          >
            <span>🛡️ Segurança & LGPD</span>
          </a>
        </nav>

        {/* Botões de Ação */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <Button variante="secundaria" tamanho="sm" asChild>
            <Link href="/login" aria-label="Acessar o sistema IRIS">
              Entrar
            </Link>
          </Button>

          <Button variante="primaria" tamanho="sm" asChild>
            <Link href="/cadastro" aria-label="Criar conta gratuita no IRIS">
              Criar Conta Gratuita
            </Link>
          </Button>
        </div>

        {/* Botão de Menu Hambúrguer Mobile */}
        <div className="flex items-center gap-2 lg:hidden">
          <Button variante="primaria" tamanho="sm" asChild className="text-xs px-3 min-h-[40px]">
            <Link href="/cadastro">Conta Grátis</Link>
          </Button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Abrir menu de navegação mobile"
            className="p-2.5 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-white shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all focus-visible:outline-focus outline-none"
          >
            <svg
              className="w-6 h-6 text-[var(--text-primary,#1A1A1A)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menu Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b-2 border-[var(--border-brutal,#1A1A1A)] px-4 py-6 space-y-4 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)]">
          <nav aria-label="Navegação Mobile" className="flex flex-col gap-2.5 font-display font-bold text-base">
            <a
              href="#protocolos"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 bg-[var(--bg-app,#FBF9F5)] border border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] hover:bg-[var(--action-primary,#F2B705)] transition-colors"
            >
              Protocolos Nativos (VB-MAPP, Denver, PEI)
            </a>
            <a
              href="#relatorios-convenio"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 bg-[var(--bg-app,#FBF9F5)] border border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] hover:bg-[var(--action-primary,#F2B705)] transition-colors"
            >
              Relatórios Anti-Glosa
            </a>
            <a
              href="#recursos"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 bg-[var(--bg-app,#FBF9F5)] border border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] hover:bg-[var(--action-primary,#F2B705)] transition-colors"
            >
              Benefícios para sua Clínica
            </a>
            <a
              href="#diferenciais"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 bg-[var(--bg-app,#FBF9F5)] border border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] hover:bg-[var(--action-primary,#F2B705)] transition-colors"
            >
              Iris vs. Planilhas
            </a>
            <a
              href="#calculadora"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 bg-[var(--bg-app,#FBF9F5)] border border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] hover:bg-[var(--action-primary,#F2B705)] transition-colors"
            >
              Simulador de Custo
            </a>
            <a
              href="#seguranca"
              onClick={() => setMobileMenuOpen(false)}
              className="p-3 bg-[var(--status-info-bg,#B2DFDB)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] font-mono text-xs font-bold flex items-center justify-between"
            >
              <span>🛡️ Segurança & LGPD</span>
              <span>➔</span>
            </a>
          </nav>

          <div className="pt-2 flex flex-col gap-2">
            <Button variante="secundaria" tamanho="lg" asChild className="w-full justify-center">
              <Link href="/login">Entrar no Sistema</Link>
            </Button>
            <Button variante="primaria" tamanho="lg" asChild className="w-full justify-center">
              <Link href="/cadastro" onClick={() => setMobileMenuOpen(false)}>
                Criar Conta Gratuita
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
