"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

/**
 * Tabs sobre Radix, vestido com Espectro Brutal (§203). Densidade do coordenador no
 * desktop (fila / perfil / histórico). Aba ativa recebe a borda sólida e fundo
 * neutro de superfície — sinal estrutural além da cor, sem confundir com avisos.
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
        "font-display -mb-0.5 inline-flex min-h-11 items-center border-2 border-transparent px-4 py-2 text-base font-semibold text-[var(--text-secondary)] transition-colors duration-100 ease-out",
        "hover:border-[var(--border-brutal)]/40 hover:bg-[var(--gray-light-hover)]/40 hover:text-[var(--text-primary)]",
        "data-[state=active]:rounded-t-[var(--radius-control)] data-[state=active]:border-b-[3px] data-[state=active]:border-[var(--border-brutal)] data-[state=active]:border-b-[var(--action-primary,#F2B705)] data-[state=active]:bg-[var(--surface-elevated)] data-[state=active]:font-bold data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none",
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
