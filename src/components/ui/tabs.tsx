"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

/**
 * Tabs sobre Radix, vestido com Espectro Brutal. Densidade do coordenador no
 * desktop (fila / perfil / histórico). Aba ativa recebe o acento ouro + borda
 * inferior sólida — sinal estrutural além da cor.
 */
export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "flex scrollbar-none items-stretch overflow-x-auto border-b-2 border-[var(--border-brutal)]",
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "font-display -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-transparent px-4 py-2 text-base font-semibold text-[var(--text-secondary)]",
        "hover:text-[var(--text-primary)]",
        "data-[state=active]:border-[var(--border-brutal)] data-[state=active]:bg-[var(--action-primary)] data-[state=active]:text-[var(--action-primary-fg)]",
        "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:-outline-offset-[var(--ring-offset)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "pt-4 text-base text-[var(--text-primary)]",
        "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)]",
        className,
      )}
      {...props}
    />
  );
});
