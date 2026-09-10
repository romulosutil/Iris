import * as React from "react";
import { cn } from "@/lib/cn";
import {
  surface,
  type SurfaceVariante,
} from "@/components/ui/primitives/surface";

/**
 * DataList — lista densa de registros operacionais (fila, pendências, agenda,
 * equipe). Substitui o padrão "um card por item" nas listas que crescem.
 *
 * Por que não card por item: no Espectro Brutal a superfície elevada (borda
 * 2px + sombra dura) significa "fato consolidado". Repetida em cada linha de
 * uma fila ela deixa de significar — dez caixas idênticas viram ruído — e
 * custa ~90px por item: 50 pendências = 4.500px de rolagem para ler 50 nomes.
 * O container é UMA superfície; dentro dele as linhas se separam por fio,
 * alinham os dados em colunas fixas (hora | nome | estado | ação) e cabem em
 * 56px cada. A hierarquia vem da coluna, não da moldura.
 *
 * Referências: padrão de "list view" (NN/g) — usuário lê um fluxo, poucos
 * atributos por item, precisa varrer e comparar — e as filas de Linear/Stripe:
 * linha de altura fixa, divisor hairline, hover suave, cabeçalho de grupo
 * pegajoso. Card fica reservado para o que se NAVEGA (conteúdo rico), não para
 * o que se VARRE.
 */

export interface DataListProps extends React.HTMLAttributes<HTMLElement> {
  /** Barra fixa no topo da superfície: título, contagem, filtro, ação global. */
  cabecalho?: React.ReactNode;
  /** Filhos são `DataListGroup` (com `como="div"`) ou `DataListRow` (com `como="ul"`). */
  como?: "div" | "ul";
  /**
   * Honestidade epistêmica no CONTAINER: uma lista só de candidatos da IA
   * usa `sugerida` (tracejado violeta + afunda) — a linha não repete a
   * moldura, então é a superfície inteira que declara "isto ainda não é fato".
   */
  variante?: SurfaceVariante;
  children?: React.ReactNode;
}

export const DataList = React.forwardRef<HTMLElement, DataListProps>(
  function DataList(
    {
      className,
      cabecalho,
      como = "div",
      variante = "solida",
      children,
      ...props
    },
    ref,
  ) {
    const Corpo = como as React.ElementType;
    return (
      <section
        ref={ref as React.Ref<HTMLElement>}
        className={cn(
          surface(variante, { radius: "control" }),
          // `overflow-clip`, não `hidden`: hidden cria contexto de rolagem e
          // mata o `sticky` do cabeçalho de grupo; clip só recorta o canto.
          "overflow-clip bg-[var(--surface-card)]",
          className,
        )}
        {...props}
      >
        {cabecalho ? (
          <div className="flex min-h-14 items-center justify-between gap-3 border-b-2 border-[var(--border-brutal)] px-3 py-2 sm:px-4">
            {cabecalho}
          </div>
        ) : null}
        <Corpo className={cn(como === "ul" && "m-0 list-none p-0")}>
          {children}
        </Corpo>
      </section>
    );
  },
);

export interface DataListGroupProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "title"
> {
  titulo: React.ReactNode;
  /** Quantos itens o grupo carrega — visível mesmo antes de rolar. */
  contagem?: number;
  /** Ação ou filtro à direita do cabeçalho do grupo. */
  acoes?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Grupo com cabeçalho pegajoso (`sticky`): ao rolar uma fila longa o nome do
 * terapeuta/dia continua visível — quem está lendo nunca perde o contexto da
 * linha. Semântica: `section` rotulada pelo próprio cabeçalho + `ul` de linhas.
 */
export const DataListGroup = React.forwardRef<HTMLElement, DataListGroupProps>(
  function DataListGroup(
    { className, titulo, contagem, acoes, children, ...props },
    ref,
  ) {
    const tituloId = React.useId();
    return (
      <section
        ref={ref}
        aria-labelledby={tituloId}
        className={cn(
          "border-t border-[var(--border-brutal)]/20 first:border-t-0",
          className,
        )}
        {...props}
      >
        <div className="sticky top-0 z-10 flex min-h-9 items-center justify-between gap-3 border-b border-[var(--border-brutal)]/20 bg-[var(--surface-muted)] px-3 py-1.5 sm:px-4">
          <h3
            id={tituloId}
            className="flex min-w-0 items-baseline gap-2 font-mono text-xs font-bold tracking-wide text-[var(--text-primary)] uppercase"
          >
            <span className="truncate">{titulo}</span>
            {typeof contagem === "number" ? (
              <span className="shrink-0 font-medium text-[var(--text-secondary)] normal-case tabular-nums">
                {contagem}
              </span>
            ) : null}
          </h3>
          {acoes ? <div className="shrink-0">{acoes}</div> : null}
        </div>
        <ul className="m-0 list-none p-0">{children}</ul>
      </section>
    );
  },
);

export interface DataListRowProps extends Omit<
  React.LiHTMLAttributes<HTMLLIElement>,
  "title"
> {
  /** Dado âncora da linha (hora, código, data). Coluna fixa, monoespaçada. */
  inicio?: React.ReactNode;
  /** Identidade do registro (nome). Coluna elástica, trunca em uma linha. */
  titulo: React.ReactNode;
  /** Complemento abaixo do título (terapeuta, disciplina, subtítulo). */
  detalhe?: React.ReactNode;
  /** Selo de estado. Vira coluna própria no desktop; desce sob o título no mobile. */
  estado?: React.ReactNode;
  /** Ações da linha (botão, link, menu). Coluna final, sempre alinhada. */
  acoes?: React.ReactNode;
  /**
   * Linha inteira clicável (hover mais forte, cursor, `relative`). O alvo real
   * é um `<a>` dentro de `titulo` com `after:absolute after:inset-0` (link
   * esticado): o nome continua sendo o link nomeado na árvore de
   * acessibilidade e o clique em qualquer ponto da linha cai nele.
   */
  interativa?: boolean;
}

/**
 * Linha de 56px (piso de 44px + respiro), grid de 4 colunas no desktop:
 *   hora | nome/detalhe | estado | ações
 * No mobile o estado desce para baixo do nome e a linha ganha duas faixas —
 * hora e ações continuam nas pontas para a leitura ser a mesma nos dois.
 */
export const DataListRow = React.forwardRef<HTMLLIElement, DataListRowProps>(
  function DataListRow(
    {
      className,
      inicio,
      titulo,
      detalhe,
      estado,
      acoes,
      interativa = false,
      ...props
    },
    ref,
  ) {
    return (
      <li
        ref={ref}
        className={cn(
          "grid min-h-14 items-center gap-x-3 px-3 py-2 sm:gap-x-4 sm:px-4",
          "grid-cols-[auto_minmax(0,1fr)_auto] [grid-template-areas:'inicio_titulo_acoes'_'inicio_estado_acoes']",
          "sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:[grid-template-areas:'inicio_titulo_estado_acoes']",
          "border-t border-[var(--border-brutal)]/20 first:border-t-0",
          "transition-colors duration-150 hover:bg-[var(--surface-muted)]/60",
          interativa &&
            "relative cursor-pointer hover:bg-[var(--surface-muted)]",
          className,
        )}
        {...props}
      >
        {inicio ? (
          <span className="min-w-[3.25rem] font-mono text-base font-bold text-[var(--text-primary)] tabular-nums [grid-area:inicio]">
            {inicio}
          </span>
        ) : (
          <span className="[grid-area:inicio]" aria-hidden="true" />
        )}

        <div className="flex min-w-0 flex-col [grid-area:titulo]">
          <span className="truncate text-base font-medium text-[var(--text-primary)]">
            {titulo}
          </span>
          {detalhe ? (
            <span className="truncate text-sm text-[var(--text-secondary)]">
              {detalhe}
            </span>
          ) : null}
        </div>

        {estado ? (
          <div className="flex items-center pt-1 [grid-area:estado] sm:pt-0">
            {estado}
          </div>
        ) : (
          <span className="[grid-area:estado]" aria-hidden="true" />
        )}

        {acoes ? (
          <div className="flex shrink-0 items-center justify-end gap-2 [grid-area:acoes]">
            {acoes}
          </div>
        ) : (
          <span className="[grid-area:acoes]" aria-hidden="true" />
        )}
      </li>
    );
  },
);
