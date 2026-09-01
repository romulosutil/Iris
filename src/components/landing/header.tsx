"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)]/95 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-20 w-full max-w-[1800px] items-center justify-between px-4 sm:px-8 lg:px-12 2xl:px-20">
        {/* Logo Iris Neobrutalista */}
        <Link
          href="/institucional"
          className="group focus-visible:outline-focus flex min-h-11 shrink-0 items-center gap-3 rounded-[var(--radius-control,5px)] outline-none focus-visible:outline-offset-2"
          aria-label="Ir para a página inicial do IRIS Governança Clínica"
        >
          <Logo altura={42} animado aria-label="Iris Governança Clínica Logo" />
          <div className="hidden flex-col sm:flex">
            <span className="rounded-[var(--radius-xs,3px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-info-bg,#B2DFDB)] px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[var(--text-primary,#1A1A1A)] uppercase shadow-[1px_1px_0px_#1A1A1A]">
              Governança Clínica Multidisciplinar
            </span>
          </div>
        </Link>

        {/* Navegação Desktop */}
        <nav
          aria-label="Navegação Principal Desktop"
          className="font-display hidden items-center gap-6 text-sm font-bold lg:flex xl:gap-8"
        >
          <a
            href="#protocolos"
            className="focus-visible:outline-focus text-[var(--text-primary,#1A1A1A)] decoration-[var(--action-primary,#F2B705)] decoration-2 underline-offset-4 transition-all outline-none hover:text-black hover:underline"
          >
            Protocolos
          </a>
          <a
            href="#relatorios-convenio"
            className="focus-visible:outline-focus text-[var(--text-primary,#1A1A1A)] decoration-[var(--action-primary,#F2B705)] decoration-2 underline-offset-4 transition-all outline-none hover:text-black hover:underline"
          >
            Relatórios Anti-Glosa
          </a>
          <a
            href="#recursos"
            className="focus-visible:outline-focus text-[var(--text-primary,#1A1A1A)] decoration-[var(--action-primary,#F2B705)] decoration-2 underline-offset-4 transition-all outline-none hover:text-black hover:underline"
          >
            Benefícios
          </a>
          <a
            href="#diferenciais"
            className="focus-visible:outline-focus text-[var(--text-primary,#1A1A1A)] decoration-[var(--action-primary,#F2B705)] decoration-2 underline-offset-4 transition-all outline-none hover:text-black hover:underline"
          >
            Iris vs. Planilhas
          </a>
          <a
            href="#calculadora"
            className="focus-visible:outline-focus text-[var(--text-primary,#1A1A1A)] decoration-[var(--action-primary,#F2B705)] decoration-2 underline-offset-4 transition-all outline-none hover:text-black hover:underline"
          >
            Simulador de Custo
          </a>
          <a
            href="#seguranca"
            className="focus-visible:outline-focus flex items-center gap-1.5 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-info-bg,#B2DFDB)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--text-primary,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)] transition-all outline-none hover:-translate-x-[1px] hover:-translate-y-[1px] hover:bg-[#80CBC4] hover:shadow-[var(--ds-shadow-hover,4px_4px_0px_#1A1A1A)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <span>🛡️ Segurança & LGPD</span>
          </a>
        </nav>

        {/* Botões de Ação */}
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
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
          <Button
            variante="primaria"
            tamanho="sm"
            asChild
            className="min-h-11 px-3 text-xs"
          >
            <Link href="/cadastro">Conta Grátis</Link>
          </Button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Abrir menu de navegação mobile"
            className="focus-visible:outline-focus rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-white p-2.5 shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)] transition-all outline-none active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <svg
              className="h-6 w-6 text-[var(--text-primary,#1A1A1A)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menu Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="space-y-4 border-b-2 border-[var(--border-brutal,#1A1A1A)] bg-white px-4 py-6 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] lg:hidden">
          <nav
            aria-label="Navegação Mobile"
            className="font-display flex flex-col gap-2.5 text-base font-bold"
          >
            <a
              href="#protocolos"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-3 transition-colors hover:bg-[var(--action-primary,#F2B705)]"
            >
              Protocolos Nativos (VB-MAPP, Denver, PEI)
            </a>
            <a
              href="#relatorios-convenio"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-3 transition-colors hover:bg-[var(--action-primary,#F2B705)]"
            >
              Relatórios Anti-Glosa
            </a>
            <a
              href="#recursos"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-3 transition-colors hover:bg-[var(--action-primary,#F2B705)]"
            >
              Benefícios para sua Clínica
            </a>
            <a
              href="#diferenciais"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-3 transition-colors hover:bg-[var(--action-primary,#F2B705)]"
            >
              Iris vs. Planilhas
            </a>
            <a
              href="#calculadora"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-[var(--radius-control,5px)] border border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-3 transition-colors hover:bg-[var(--action-primary,#F2B705)]"
            >
              Simulador de Custo
            </a>
            <a
              href="#seguranca"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-info-bg,#B2DFDB)] p-3 font-mono text-xs font-bold"
            >
              <span>🛡️ Segurança & LGPD</span>
              <span>➔</span>
            </a>
          </nav>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variante="secundaria"
              tamanho="lg"
              asChild
              className="w-full justify-center"
            >
              <Link href="/login">Entrar no Sistema</Link>
            </Button>
            <Button
              variante="primaria"
              tamanho="lg"
              asChild
              className="w-full justify-center"
            >
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
