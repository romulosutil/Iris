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
      className={cn("border-ink-anchor flex items-stretch border-b-2", className)}
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
        "text-ink font-display -mb-0.5 inline-flex min-h-11 items-center border-b-2 border-transparent px-4 py-2 text-base font-semibold",
        "hover:text-ink-anchor",
        "data-[state=active]:border-ink-anchor data-[state=active]:bg-gold data-[state=active]:text-ink-anchor",
        "focus-visible:outline-focus outline-none focus-visible:-outline-offset-[var(--ring-offset)] focus-visible:outline-[length:var(--ring-width)]",
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
        "text-ink pt-4 text-base",
        "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)]",
        className,
      )}
      {...props}
    />
  );
});
