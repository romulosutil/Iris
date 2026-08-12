import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";
import { Pill } from "@/components/ui/pill";
import { avaliarFriccao } from "@/lib/extraction/review-policy";

export interface ConfidenceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  confianca: "alta" | "media" | "baixa";
  inconsistenteComHistorico: boolean;
  como?: "div" | "li" | "article" | "section";
}

export const ConfidenceCard = React.forwardRef<HTMLDivElement, ConfidenceCardProps>(
  function ConfidenceCard(
    { className, confianca, inconsistenteComHistorico, como = "div", children, ...props },
    ref
  ) {
    const { podeLote, exigeFriccao, nivel } = avaliarFriccao({
      confianca,
      inconsistenteComHistorico,
    });

    const Component = como as any;

    // Define colors and styles based on friction level
    const levelConfig = {
      baixo: {
        pillColor: "success" as const,
        pillText: "Confiança Alta",
        borderClass: "border-l-4 border-l-[var(--status-success-border)]",
        icon: (
          <span className="inline-block size-2 rounded-full bg-[var(--status-success-border)] shrink-0" />
        ),
      },
      medio: {
        pillColor: "warning" as const,
        pillText: "Confiança Baixa",
        borderClass: "border-l-4 border-l-[var(--status-warning-border)]",
        icon: (
          <span className="inline-block size-2 rounded-full bg-[var(--status-warning-border)] shrink-0" />
        ),
      },
      alto: {
        pillColor: "error" as const,
        pillText: "Inconsistente",
        borderClass: "border-l-4 border-l-[var(--status-error-border)]",
        icon: (
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            className="text-[var(--status-error-border)] shrink-0"
            aria-hidden="true"
          >
            <path
              d="M8 2l6 11H2L8 2z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M8 6.5v3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            <path d="M8 11.2v.8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
          </svg>
        ),
      },
    };

    const config = levelConfig[nivel];

    return (
      <Component
        ref={ref}
        data-nivel-friccao={nivel}
        className={cn(
          surface("solida", {
            radius: "control",
            className: cn(
              "flex flex-col gap-4 p-5 bg-[var(--surface-card)] text-[var(--text-primary)] transition-all",
              config.borderClass
            ),
          }),
          className
        )}
        {...props}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-brutal)] pb-3">
          <div className="flex items-center gap-2">
            {config.icon}
            <span className="text-xs font-mono font-bold uppercase tracking-wide">
              Fricção {nivel}
            </span>
          </div>
          <Pill variante={config.pillColor}>{config.pillText}</Pill>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </Component>
    );
  }
);
