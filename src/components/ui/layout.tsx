import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Gramática de layout dirigida por token (estilo "Every Layout"): espaçamento
 * consistente sem margens avulsas. Impõe ritmo no cadastro clínico denso —
 * "hierarquia acima de uniformidade" nasce de uma escala, não de one-offs.
 */
type Gap = "xs" | "sm" | "md" | "lg";

const gapClasse: Record<Gap, string> = {
  xs: "gap-1.5", // 6px
  sm: "gap-2", // 8px
  md: "gap-4", // 16px
  lg: "gap-6", // 24px
};

type ComoProp = { como?: React.ElementType };

export interface StackProps
  extends React.HTMLAttributes<HTMLElement>, ComoProp {
  gap?: Gap;
}

/** Empilha filhos na vertical com um gap da escala. */
export const Stack = React.forwardRef<HTMLElement, StackProps>(function Stack(
  { className, gap = "md", como: Como = "div", ...props },
  ref,
) {
  return (
    <Como
      ref={ref}
      className={cn("flex flex-col", gapClasse[gap], className)}
      {...props}
    />
  );
});

export interface ClusterProps
  extends React.HTMLAttributes<HTMLElement>, ComoProp {
  gap?: Gap;
}

/** Agrupa filhos na horizontal com wrap — chips, ações, metadados. */
export const Cluster = React.forwardRef<HTMLElement, ClusterProps>(
  function Cluster(
    { className, gap = "md", como: Como = "div", ...props },
    ref,
  ) {
    return (
      <Como
        ref={ref}
        className={cn("flex flex-wrap items-center", gapClasse[gap], className)}
        {...props}
      />
    );
  },
);

export interface SplitProps
  extends React.HTMLAttributes<HTMLElement>, ComoProp {
  gap?: Gap;
  /** Alinhamento vertical dos dois lados. */
  alinha?: "start" | "center";
}

/**
 * Empurra dois blocos para as extremidades (título ↔ selo de estado, rótulo ↔
 * ação). Empilha na vertical abaixo de 40rem para não espremer no mobile.
 */
export const Split = React.forwardRef<HTMLElement, SplitProps>(function Split(
  { className, gap = "md", alinha = "center", como: Como = "div", ...props },
  ref,
) {
  return (
    <Como
      ref={ref}
      className={cn(
        "flex flex-col items-start justify-between min-[40rem]:flex-row",
        alinha === "center" && "min-[40rem]:items-center",
        gapClasse[gap],
        className,
      )}
      {...props}
    />
  );
});

export interface GridProps extends React.HTMLAttributes<HTMLElement>, ComoProp {
  gap?: Gap;
  colunas?: 1 | 2 | 3 | 4;
}

const colunasClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
};

/** Grid de colunas responsivas (1 col no mobile, N colunas no desktop). */
export const Grid = React.forwardRef<HTMLElement, GridProps>(function Grid(
  { className, gap = "md", colunas = 2, como: Como = "div", ...props },
  ref,
) {
  return (
    <Como
      ref={ref}
      className={cn("grid", colunasClasses[colunas], gapClasse[gap], className)}
      {...props}
    />
  );
});

export interface ContainerProps
  extends React.HTMLAttributes<HTMLElement>, ComoProp {
  largura?: "sm" | "md" | "lg" | "full";
}

const larguraClasses = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  full: "max-w-full",
};

/** Container de página com padding responsivo e largura máxima controlada. */
export const Container = React.forwardRef<HTMLElement, ContainerProps>(
  function Container(
    { className, largura = "md", como: Como = "div", ...props },
    ref,
  ) {
    return (
      <Como
        ref={ref}
        className={cn(
          "mx-auto w-full px-4 sm:px-6 md:px-8",
          larguraClasses[largura],
          className,
        )}
        {...props}
      />
    );
  },
);
