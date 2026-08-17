"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/cn";

/**
 * Avatar sobre Radix, vestido com Espectro Brutal: quadrado de canto vivo, borda
 * âncora, fallback com iniciais. Representa membros da equipe de cuidado
 * (care_team_membership). O mesmo componente serve terapeuta e coordenador —
 * transparência sem vigilância (nunca uma variante "modo supervisor").
 */
export const Avatar = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(function Avatar({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] align-middle",
        className,
      )}
      {...props}
    />
  );
});

export const AvatarFallback = React.forwardRef<
  React.ComponentRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        "font-display grid size-full place-items-center text-sm font-semibold text-[var(--text-primary)]",
        className,
      )}
      {...props}
    />
  );
});

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rótulo do grupo para leitores de tela (ex.: "Equipe de cuidado"). */
  rotulo: string;
}

/** Empilha avatares com leve sobreposição; borda âncora separa cada um. */
export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  function AvatarGroup({ className, rotulo, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        role="group"
        aria-label={rotulo}
        className={cn(
          "flex items-center [&>*:not(:first-child)]:-ml-2",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
