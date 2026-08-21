import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Distribuição adaptativa de cards em múltiplas colunas.
 *
 * Existe porque `Grid` (layout.tsx) é uma gramática genérica de layout: sobe
 * para N colunas já em `sm` e não trata a altura das células. Fila de cards
 * clínicos densos (alerta de risco, supervisão, agendamento) tem duas
 * exigências que o `Grid` não cobre:
 *
 * 1. **Zona ótima de leitura.** Card único em monitor 1920px vira uma linha de
 *    texto de 1200px. Duas colunas a partir de `md` mantêm cada card entre
 *    ~380px e ~700px — largura em que título, citação clínica e CTA continuam
 *    legíveis sem varredura horizontal.
 * 2. **Altura uniforme.** Cards lado a lado com alturas diferentes quebram a
 *    linha de base do Soft Neubrutalism (a sombra sólida deixa o degrau
 *    óbvio). `[&>*]:h-full` estica cada filho até o topo da célula; como os
 *    cards são `flex flex-col`, o rodapé de ação com `mt-auto` ancora embaixo.
 *
 * Em mobile é sempre 1 coluna: card clínico em 375px não comporta divisão.
 */
type Coluna = 1 | 2 | 3 | 4 | 5 | 6;

export interface CardGridCols {
  sm?: Coluna;
  md?: Coluna;
  lg?: Coluna;
  xl?: Coluna;
}

/**
 * Mapas estáticos, não interpolação. O Tailwind varre o código-fonte em busca
 * de literais: `md:grid-cols-${n}` nunca é gerado no CSS final.
 */
const colunasSm: Record<Coluna, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};

const colunasMd: Record<Coluna, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
};

const colunasLg: Record<Coluna, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

const colunasXl: Record<Coluna, string> = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
};

/**
 * Espaçamento constante entre células. O degrau `sm` existe porque 24px de
 * calha em 375px come 6% da largura útil do card; a partir de 640px o ar
 * separa as unidades sem custo.
 */
const gapClasse = {
  sm: "gap-3 sm:gap-4",
  md: "gap-4 sm:gap-6",
} as const;

export interface CardGridProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Colunas por breakpoint. Mobile é sempre 1 (não configurável). Omitido:
   * `{ md: 2 }` — o padrão `grid-cols-1 md:grid-cols-2`.
   */
  cols?: CardGridCols;
  /** Calha entre cards. `md` (padrão) = `gap-4 sm:gap-6`. */
  gap?: keyof typeof gapClasse;
  /**
   * Elemento raiz. Use `ul` quando a fila for uma lista semântica — os cards
   * já aceitam `como="li"`.
   */
  como?: React.ElementType;
}

const COLS_PADRAO: CardGridCols = { md: 2 };

export const CardGrid = React.forwardRef<HTMLElement, CardGridProps>(
  function CardGrid(
    { className, cols, gap = "md", como: Como = "div", ...props },
    ref,
  ) {
    const resolvido = cols ?? COLS_PADRAO;

    return (
      <Como
        ref={ref}
        className={cn(
          "grid grid-cols-1 items-stretch",
          resolvido.sm ? colunasSm[resolvido.sm] : undefined,
          resolvido.md ? colunasMd[resolvido.md] : undefined,
          resolvido.lg ? colunasLg[resolvido.lg] : undefined,
          resolvido.xl ? colunasXl[resolvido.xl] : undefined,
          gapClasse[gap],
          // Estica o card até o topo da célula. `min-w-0` impede que conteúdo
          // longo sem espaço (nome, e-mail, id) estoure a coluna do grid.
          "[&>*]:h-full [&>*]:min-w-0",
          className,
        )}
        {...props}
      />
    );
  },
);
