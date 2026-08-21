"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/cn";
import { control, type ControlTam } from "@/components/ui/primitives/surface";

/**
 * Select sobre Radix (typeahead, teclado e portal de graça), vestido com
 * Espectro Brutal. Usado no cadastro clínico: família do protocolo, papel na
 * equipe. Ligar um <Field> por cima para rótulo + erro acessíveis.
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

function ChevronBaixo() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M5 7.5l5 5 5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  );
}
function Check() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M3 8.5l3.2 3.2L13 4.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

export interface SelectTriggerProps extends React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Trigger
> {
  /**
   * Variações de tamanho do controle.
   * sm (44px), md (48px - padrão), lg (56px)
   */
  size?: ControlTam;
}

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(function SelectTrigger({ className, size = "md", children, ...props }, ref) {
  // Erro tem precedência sobre foco/aberto na cor da borda; resolver isso aqui
  // evita empate de especificidade entre variantes de mesma altura no CSS.
  const invalido =
    props["aria-invalid"] === true || props["aria-invalid"] === "true";

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "font-body flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-card)] text-base text-[var(--text-primary)]",
        "text-left [&>span]:truncate",
        control(size),
        size === "sm" && "px-2.5 py-1 text-base sm:text-sm",
        size === "md" && "px-3.5 py-2 text-base",
        size === "lg" && "px-4 py-3 text-base",
        "data-[placeholder]:text-[var(--text-secondary)]",
        // Densidade desktop (>= md) — mesmo contrato do Input. Mobile intocado:
        // borda cheia de 2px e piso tátil de `control(size)`. A partir de `md`,
        // o repouso VAZIO (Radix marca `data-placeholder` enquanto nada foi
        // escolhido) recua para o grafite suave; escolha feita, foco ou lista
        // aberta devolvem o peso brutalista. Largura fixa em 2px nos dois
        // estados para não reflowar a linha a cada foco.
        // O `:not(:focus-visible):not([data-state=open])` não é enfeite: sem ele
        // a regra de repouso e a de foco teriam a MESMA especificidade e quem
        // venceria dependeria da ordem que o Tailwind emitir — o campo focado
        // podia ficar cinza. Assim as duas regras são mutuamente exclusivas.
        !invalido &&
          "md:[&[data-placeholder]:not(:focus-visible):not([data-state=open])]:border-[var(--border-muted)] md:[&[data-placeholder]:not(:focus-visible):not([data-state=open])]:shadow-none",
        "md:shadow-[var(--shadow-brutal)]",
        "md:focus-visible:shadow-[var(--shadow-brutal)] md:data-[state=open]:shadow-[var(--shadow-brutal)]",
        !invalido &&
          "md:focus-visible:border-[var(--border-brutal)] md:data-[state=open]:border-[var(--border-brutal)]",
        invalido &&
          "border-[var(--status-error-border)] md:border-[var(--status-error-border)] md:shadow-[var(--shadow-brutal)]",
        "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
        "disabled:cursor-not-allowed disabled:opacity-50 md:disabled:border-[var(--border-muted)] md:disabled:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="shrink-0 text-[var(--text-primary)]">
        <ChevronBaixo />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, children, position = "popper", ...props },
  ref,
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          "z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-control)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--ds-shadow)]",
          position === "popper" && "mt-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-64 overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-pointer items-center rounded-[var(--radius-xs)] py-2 pr-9 pl-3 text-base text-[var(--text-primary)] outline-none select-none",
        control("sm"),
        "font-bold data-[highlighted]:bg-[var(--action-primary)] data-[highlighted]:text-[var(--action-primary-fg)]",
        "data-[state=checked]:font-semibold",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 text-current">
        <Check />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});
