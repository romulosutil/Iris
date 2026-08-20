"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  conteudo: React.ReactNode;
  posicao?: "top" | "bottom" | "left" | "right";
  multiline?: boolean;
  children: React.ReactElement;
}

export const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip(
    {
      className,
      conteudo,
      posicao = "top",
      multiline = false,
      children,
      ...props
    },
    ref,
  ) {
    const [visivel, setVisivel] = React.useState(false);
    const tooltipId = React.useId();

    const posClasses = {
      top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
      bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
      left: "right-full mr-2 top-1/2 -translate-y-1/2",
      right: "left-full ml-2 top-1/2 -translate-y-1/2",
    };

    return (
      <div
        ref={ref}
        className="relative inline-flex"
        onMouseEnter={() => setVisivel(true)}
        onMouseLeave={() => setVisivel(false)}
        onFocus={() => setVisivel(true)}
        onBlur={() => setVisivel(false)}
        // WCAG 2.1 1.4.13 (Content on Hover or Focus) exige que o conteúdo
        // adicional seja *dispensável* sem tirar o ponteiro nem o foco. Sem
        // isto, quem navega por teclado fica com a bolha por cima do conteúdo
        // e sem saída até mudar o foco.
        onKeyDown={(evento) => {
          if (evento.key === "Escape" && visivel) {
            evento.stopPropagation();
            setVisivel(false);
          }
        }}
        {...props}
      >
        {React.cloneElement(children, {
          "aria-describedby": tooltipId,
        } as React.HTMLAttributes<HTMLElement>)}

        {/*
          O nó fica SEMPRE montado e só alterna `hidden`. Montá-lo apenas
          quando visível deixava o `aria-describedby` do gatilho apontando para
          um id inexistente no estado de repouso (axe: `aria-valid-attr-value`
          em `incomplete`) — e a descrição só passava a existir depois que o
          foco já tinha sido anunciado. O accname spec inclui nós ocultos
          referenciados diretamente por `aria-describedby`, então o leitor de
          tela lê a explicação no mesmo anúncio do foco.
        */}
        <div
          id={tooltipId}
          role="tooltip"
          hidden={!visivel}
          className={cn(
            "animate-in fade-in-0 absolute z-50 rounded-[var(--radius-xs)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-[var(--ds-shadow)] duration-150",
            multiline
              ? "w-max max-w-xs font-sans leading-relaxed font-normal whitespace-normal"
              : "font-mono font-semibold whitespace-nowrap",
            posClasses[posicao],
            className,
          )}
        >
          {conteudo}
        </div>
      </div>
    );
  },
);
