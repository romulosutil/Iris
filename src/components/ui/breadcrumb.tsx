import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface BreadcrumbItem {
  rotulo: React.ReactNode;
  href?: string;
  onClick?: () => void;
  atual?: boolean;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  itens: BreadcrumbItem[];
}

function SeparatorIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 20 20" fill="none" aria-hidden focusable="false" className="text-[var(--text-secondary)] shrink-0">
      <path d="M7.5 4.5l5 5.5-5 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

export const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  function Breadcrumb({ className, itens, ...props }, ref) {
    return (
      <nav
        ref={ref}
        aria-label="Navegação estrutural"
        className={cn("flex items-center text-sm font-body", className)}
        {...props}
      >
        <ol className="flex flex-wrap items-center gap-2">
          {itens.map((item, index) => {
            const isLast = index === itens.length - 1;
            const isCurrent = item.atual || isLast;

            return (
              <li key={index} className="flex items-center gap-2">
                {item.href && !isCurrent ? (
                  <Link
                    href={item.href}
                    className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline focus-visible:outline-focus rounded-xs"
                  >
                    {item.rotulo}
                  </Link>
                ) : item.onClick && !isCurrent ? (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline focus-visible:outline-focus rounded-xs cursor-pointer bg-transparent border-0 p-0"
                  >
                    {item.rotulo}
                  </button>
                ) : (
                  <span
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "font-semibold",
                      isCurrent
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    {item.rotulo}
                  </span>
                )}
                {!isLast && <SeparatorIcon />}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  },
);
