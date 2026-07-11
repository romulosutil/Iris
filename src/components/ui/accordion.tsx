"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@/lib/cn";

/**
 * Accordion sobre Radix (WAI-ARIA, teclado e roving tabindex de graça), vestido
 * com Espectro Brutal: borda âncora, canto vivo, sombra dura, foco ortogonal.
 * Agrupa seções do cadastro clínico denso e a fila de revisão do coordenador.
 */
export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn(
        "border-ink-anchor bg-surface border-2 shadow-[var(--ds-shadow)]",
        className,
      )}
      {...props}
    />
  );
});

function Chevron() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable="false"
      className="shrink-0 transition-transform duration-200"
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

export const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex min-h-11 flex-1 items-center justify-between gap-3 px-4 py-3 text-left",
          "text-ink font-display text-base font-semibold",
          // linha separadora só quando aberto — evita borda dupla fechado
          "data-[state=open]:border-ink-anchor data-[state=open]:border-b-2",
          "[&[data-state=open]>svg]:rotate-180",
          "focus-visible:outline-focus outline-none focus-visible:-outline-offset-[var(--ring-offset)] focus-visible:outline-[length:var(--ring-width)]",
          className,
        )}
        {...props}
      >
        {children}
        <Chevron />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        "text-ink overflow-hidden text-sm",
        "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      )}
      {...props}
    >
      <div className={cn("px-4 py-3", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
});
