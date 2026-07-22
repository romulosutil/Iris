"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { surface } from "./primitives/surface";

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
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 p-6",
          surface("solida", { elevation: "overlay", radius: "2xl", className: "bg-[var(--surface-card)]" }),
          "focus-visible:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={rotuloFechar}
          className={cn(
            "text-[var(--text-primary)] absolute top-3 right-3 grid size-11 place-items-center rounded-[var(--radius-pill)]",
            "hover:bg-[var(--surface-elevated)]",
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
        "font-display text-[var(--text-primary)] pr-8 text-lg font-semibold",
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
      className={cn("text-[var(--text-secondary)] mt-2 text-base", className)}
      {...props}
    />
  );
});
