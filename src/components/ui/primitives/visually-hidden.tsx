import * as React from "react";
import { cn } from "@/lib/cn";

export interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {}

export const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  function VisuallyHidden({ className, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0",
          "clip-[rect(0,0,0,0)]", // standard modern Tailwind utility for visually hidden
          className
        )}
        {...props}
      />
    );
  }
);
