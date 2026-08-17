"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

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

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "font-body flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-4 py-2.5 text-base text-[var(--text-primary)]",
        "data-[placeholder]:text-[var(--text-secondary)]",
        "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
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
          "z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--ds-shadow)]",
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
        "relative flex min-h-11 cursor-pointer items-center rounded-[var(--radius-xs)] py-2 pr-9 pl-3 text-base text-[var(--text-primary)] outline-none select-none",
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
