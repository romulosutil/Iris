"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;

function IconeX() {
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
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

export const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Lado de surgimento do painel (default: "right"). */
    posicao?: "right" | "left";
    rotuloFechar?: string;
  }
>(function DrawerContent(
  {
    className,
    children,
    posicao = "right",
    rotuloFechar = "Fechar painel",
    ...props
  },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs transition-opacity duration-200" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed top-0 bottom-0 z-50 flex h-full w-full max-w-md flex-col border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)] transition-transform duration-300 ease-in-out",
          posicao === "right" ? "right-0 border-r-0" : "left-0 border-l-0",
          "focus-visible:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={rotuloFechar}
          className="focus-visible:outline-focus absolute top-4 right-4 grid size-11 place-items-center rounded-[var(--radius-pill)] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-elevated)]"
        >
          <IconeX />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export const DrawerHeader = function DrawerHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 border-b-2 border-dashed border-[var(--border-brutal)] pr-8 pb-4",
        className,
      )}
      {...props}
    />
  );
};

export const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-display text-xl font-bold text-[var(--text-primary)]",
        className,
      )}
      {...props}
    />
  );
});

export const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DrawerDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-[var(--text-secondary)]", className)}
      {...props}
    />
  );
});

export const DrawerFooter = function DrawerFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-wrap items-center justify-end gap-3 border-t-2 border-dashed border-[var(--border-brutal)] pt-4",
        className,
      )}
      {...props}
    />
  );
};
