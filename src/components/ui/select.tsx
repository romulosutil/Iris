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
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

function ChevronBaixo() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}
function Check() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
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
        "border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] text-[var(--text-primary)] rounded-[var(--radius-control)] font-body flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-base",
        "data-[placeholder]:text-[var(--text-secondary)]",
        "focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-[var(--text-primary)] shrink-0">
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
          "bg-[var(--surface-elevated)] border-2 border-[var(--border-brutal)] text-[var(--text-primary)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden",
          position === "popper" && "mt-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
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
        "text-[var(--text-primary)] relative flex min-h-11 cursor-pointer items-center py-2 pr-9 pl-3 text-base outline-none select-none rounded-[var(--radius-xs)]",
        "data-[highlighted]:bg-[var(--action-primary)] data-[highlighted]:text-[var(--action-primary-fg)] font-bold",
        "data-[state=checked]:font-semibold",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="text-current absolute right-2">
        <Check />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});
