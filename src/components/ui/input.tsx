import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type ?? "text"}
        className={cn(
          "min-h-11 w-full px-4 py-2.5",
          "bg-surface text-ink font-body text-base",
          "border-[length:1.5px] border-[#C9C6BC] rounded-[5px]",
          "placeholder:text-graphite/60",
          "transition-[border-color,box-shadow] duration-200 ease-out",
          // foco suave da v3
          "focus:border-[#2274A5] focus:shadow-[0_0_0_3px_rgba(34,116,165,0.2)] focus:outline-none",
          // erro
          "aria-invalid:border-[color:var(--color-spectrum-red)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

