import * as React from "react";
import { cn } from "@/lib/cn";
import { Input, type InputProps } from "@/components/ui/input";

export interface SearchInputProps extends Omit<
  InputProps,
  "prefixIcon" | "suffixIcon"
> {
  onClear?: () => void;
  shortcutHint?: string;
}

function SearchIcon() {
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
        d="M14.5 14.5L18 18M16.5 9.5C16.5 13.366 13.366 16.5 9.5 16.5C5.63401 16.5 2.5 13.366 2.5 9.5C2.5 5.63401 5.63401 2.5 9.5 2.5C13.366 2.5 16.5 5.63401 16.5 9.5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      className,
      value,
      onChange,
      onClear,
      shortcutHint,
      placeholder = "Buscar...",
      ...props
    },
    ref,
  ) {
    const hasValue = Boolean(value && String(value).length > 0);

    return (
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        prefixIcon={<SearchIcon />}
        suffixIcon={
          <div className="flex items-center gap-1.5">
            {hasValue && onClear ? (
              <button
                type="button"
                onClick={onClear}
                aria-label="Limpar busca"
                className="focus-visible:outline-focus grid size-6 place-items-center rounded-[var(--radius-pill)] hover:bg-[var(--surface-elevated)]"
              >
                <ClearIcon />
              </button>
            ) : null}
            {shortcutHint && !hasValue ? (
              <kbd className="rounded border border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                {shortcutHint}
              </kbd>
            ) : null}
          </div>
        }
        className={className}
        {...props}
      />
    );
  },
);
