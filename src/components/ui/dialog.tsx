"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

/**
 * Dialog sobre Radix (focus-trap, scroll-lock, Esc, restauração de foco de
 * graça), vestido com Espectro Brutal. Uso deliberado: só confirmação de alto
 * atrito (revisão unitária de baixa confiança). Register de produto evita modal
 * como primeiro pensamento — esgotar alternativas inline antes.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function IconeX() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Rótulo do botão fechar (default: "Fechar"). */
    rotuloFechar?: string;
  }
>(function DialogContent(
  { className, children, rotuloFechar = "Fechar", ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[color:var(--color-ink-anchor)]/70" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "border-ink-anchor bg-surface fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border-2 p-6 shadow-[var(--ds-shadow)]",
          "focus-visible:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={rotuloFechar}
          className={cn(
            "text-ink-anchor absolute top-3 right-3 grid size-9 place-items-center",
            "hover:bg-ink-anchor/10",
            "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
          )}
        >
          <IconeX />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-display text-ink-anchor pr-8 text-lg font-semibold",
        className,
      )}
      {...props}
    />
  );
});

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-ink mt-2 text-base", className)}
      {...props}
    />
  );
});
