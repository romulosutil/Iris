"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface GovernancaContadores {
  validacao?: number;
  excecoes?: number;
  supervisao?: number;
  pendencias?: number;
  alertasRisco?: number;
}

export interface GovernancaNavProps {
  contadores?: GovernancaContadores;
  activeHref?: string;
  className?: string;
  ocultarZerados?: boolean;
}

/**
 * Semiótica de cor das pílulas de contagem.
 *
 * O vermelho/terracota é o único tom que o operador lê como "algo deu errado".
 * Se toda aba o usa, a central vira painel de punição e o tom perde significado
 * justamente na aba onde ele importa. Por isso:
 *
 * - `risco`  → terracota. EXCLUSIVO de Alertas de Risco. No modelo de dados o
 *              alerta de risco não tem escala de gravidade: todo alerta é grave
 *              por construção, e `status = "aberto"` significa "ainda não
 *              reconhecido". Logo `alertasRisco > 0` já É "item não reconhecido
 *              de alta gravidade" — nenhum contador extra é necessário.
 * - `ia`     → violeta (--ai-*). Filas cujo conteúdo foi processado/sugerido
 *              pela IA e aguarda olhar clínico (Validação, Exceções). Sinaliza
 *              procedência, não culpa.
 * - `neutro` → cinza silencioso (--surface-muted) com texto grafite. Fila
 *              operacional: "há itens aqui", sem juízo de valor.
 */
type TomBadge = "risco" | "ia" | "neutro";

interface GovernancaItem {
  href: string;
  label: string;
  badge?: number;
  tom: TomBadge;
}

export function GovernancaNav({
  contadores,
  activeHref,
  className,
  ocultarZerados = false,
}: GovernancaNavProps = {}) {
  const pathname = usePathname();
  const currentPath = activeHref ?? pathname ?? "/validacao";

  const items: GovernancaItem[] = [
    {
      href: "/validacao",
      label: "Fila de Validação",
      badge: contadores?.validacao,
      tom: "ia",
    },
    {
      href: "/excecoes",
      label: "Exceções Clínicas",
      badge: contadores?.excecoes,
      tom: "ia",
    },
    {
      href: "/supervisao",
      label: "Supervisão & Estagnação",
      badge: contadores?.supervisao,
      tom: "neutro",
    },
    {
      href: "/pendencias",
      label: "Pendências Gerais",
      badge: contadores?.pendencias,
      tom: "neutro",
    },
    {
      href: "/alertas-risco",
      label: "Alertas de Risco",
      badge: contadores?.alertasRisco,
      tom: "risco",
    },
  ];

  return (
    <nav
      aria-label="Navegação da Central de Governança"
      className={cn(
        "mb-4 flex scrollbar-none items-stretch overflow-x-auto border-b-2 border-[var(--border-brutal)]",
        className,
      )}
    >
      {items.map((item) => {
        const isActive =
          currentPath === item.href ||
          (item.href !== "/validacao" && currentPath.startsWith(item.href));

        const temBadge = item.badge !== undefined;
        const badgeEhZero = item.badge === 0;
        const deveMostrarBadge = temBadge && (!ocultarZerados || !badgeEhZero);

        // Fila vazia nunca compete por atenção: perde a cor do tom e recua em
        // opacidade. Zero não é estado a ser resolvido.
        const tomEfetivo: TomBadge | "zerado" = badgeEhZero
          ? "zerado"
          : item.tom;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "font-display -mb-0.5 inline-flex min-h-11 shrink-0 items-center gap-2 border-2 border-transparent px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors duration-100 ease-out",
              "hover:border-[var(--border-brutal)]/40 hover:bg-[var(--gray-light-hover)]/40 hover:text-[var(--text-primary)]",
              "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:-outline-offset-[var(--ring-offset)]",
              isActive &&
                "rounded-t-[var(--radius-control)] border-b-[3px] border-[var(--border-brutal)] border-b-[var(--action-primary,#F2B705)] bg-[var(--surface-elevated)] font-bold text-[var(--text-primary)] shadow-none",
            )}
          >
            <span>{item.label}</span>
            {deveMostrarBadge ? (
              <span
                data-tom={tomEfetivo}
                className={cn(
                  "inline-flex items-center justify-center rounded-[var(--radius-pill)] border px-1.5 py-0.5 font-mono text-xs leading-none",
                  tomEfetivo === "zerado" &&
                    "border-transparent bg-[var(--surface-muted)] font-normal text-[var(--text-secondary)] opacity-60",
                  tomEfetivo === "risco" &&
                    "border-[var(--status-error-border)] bg-[var(--status-error-bg)] font-bold text-[var(--status-error-fg)]",
                  tomEfetivo === "ia" &&
                    "border-[var(--ai-accent)] bg-[var(--ai-tint)] font-semibold text-[var(--ai-deep)]",
                  tomEfetivo === "neutro" &&
                    "border-[var(--surface-muted-border)] bg-[var(--surface-muted)] font-semibold text-[var(--text-secondary)]",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
