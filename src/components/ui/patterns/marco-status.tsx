import * as React from "react";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

/**
 * Estado epistêmico de um marco do protocolo numa sessão (princípio 4 do DS:
 * "candidato" ≠ "conquistado").
 *
 * - `conquistado`: a meta mapeada ao marco está `dominada` — status OFICIAL
 *   (`goal.estado`, critério de domínio cumprido). Preenchimento sólido menta
 *   + borda cheia. Nível de ajuda 0 numa sessão NÃO basta.
 * - `candidato`: candidatura OFICIAL registrada (`goal_candidacy` /
 *   `milestone_candidacy`), ainda não dominada. Fato derivado de decisão
 *   humana — por isso o par `--status-progresso-*` (âmbar-neutro, borda
 *   sólida fina, hachura suave) e NUNCA o violeta/tracejado de "sugerido pela
 *   IA" (DS-02). A heurística `is_candidata` do snapshot não entra.
 * - `nao_atingido`: nem dominada nem candidata — contorno tracejado neutro.
 */
export type MarcoStatusEstado = "conquistado" | "candidato" | "nao_atingido";

export const ROTULO_MARCO_STATUS: Record<MarcoStatusEstado, string> = {
  conquistado: "Conquistado",
  candidato: "Candidato a domínio",
  nao_atingido: "Não atingido",
};

/* Glifo por estado. Forma + preenchimento distintos entre si (círculo cheio,
   quadrado hachurado, círculo tracejado vazio): o significado sobrevive a
   daltonismo e a `forced-colors`, nunca depende da cor sozinha. */
const glifoClasses: Record<MarcoStatusEstado, string> = {
  conquistado:
    "rounded-[var(--radius-pill)] border-2 border-status-success-border bg-status-success-bg text-status-success-fg",
  candidato:
    "rounded-[var(--radius-sm)] border border-status-progresso-border bg-status-progresso-bg bg-[image:var(--pattern-progresso-hachura)] text-status-progresso-fg",
  nao_atingido:
    "rounded-[var(--radius-pill)] border-2 border-dashed border-[var(--text-secondary)] bg-[var(--surface-card)] text-[var(--text-secondary)]",
};

function Glifo({ estado }: { estado: MarcoStatusEstado }) {
  const comum = {
    width: 16,
    height: 16,
    viewBox: "0 0 20 20",
    fill: "none",
    "aria-hidden": true,
    focusable: false,
  } as const;
  if (estado === "conquistado") {
    return (
      <svg {...comum}>
        <path
          d="M4 10.5 8.5 15 16 6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    );
  }
  if (estado === "candidato") {
    return (
      <svg {...comum}>
        <path
          d="M3 15l5-5 3 3 6-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M12.5 6H17v4.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export interface MarcoStatusProps extends React.HTMLAttributes<HTMLDivElement> {
  estado: MarcoStatusEstado;
  /** Nome do marco (ex.: "Pede item preferido"). Sempre visível — nunca só em `title`. */
  nome: string;
  /** Nível do marco no protocolo, se houver. */
  nivel?: string | null;
  /**
   * Mostra o rótulo do estado como texto visível. Por padrão o rótulo vai
   * pelo glifo (`role="img"` + `aria-label`), que é o canal do leitor de tela
   * na grade densa; com `rotuloVisivel` o texto aparece e o glifo vira
   * decorativo, para não anunciar duas vezes.
   */
  rotuloVisivel?: boolean;
}

/**
 * MarcoStatus — tile de um marco com estado epistêmico anunciado por texto
 * (glifo nomeado ou rótulo visível), nunca por `title` nem por cor sozinha
 * (AC-01/U-03, #538).
 */
export const MarcoStatus = React.forwardRef<HTMLDivElement, MarcoStatusProps>(
  function MarcoStatus(
    { estado, nome, nivel, rotuloVisivel = false, className, ...props },
    ref,
  ) {
    const rotulo = ROTULO_MARCO_STATUS[estado];
    return (
      <div
        ref={ref}
        data-estado={estado}
        className={cn(
          surface("solida", {
            elevation: "flat",
            radius: "sm",
            className:
              "flex min-w-0 flex-col items-center justify-between gap-2 bg-[var(--surface-card)] p-2 text-center",
          }),
          className,
        )}
        {...props}
      >
        <span className="w-full truncate text-xs font-black text-[var(--text-primary)]">
          {nivel ? `Nível ${nivel}` : "Marco"}
        </span>

        <span
          role={rotuloVisivel ? undefined : "img"}
          aria-label={rotuloVisivel ? undefined : rotulo}
          aria-hidden={rotuloVisivel ? true : undefined}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center",
            glifoClasses[estado],
          )}
        >
          <Glifo estado={estado} />
        </span>

        {rotuloVisivel ? (
          <span className="text-xs font-bold text-[var(--text-primary)]">
            {rotulo}
          </span>
        ) : null}

        <span className="line-clamp-2 w-full text-xs leading-tight break-words text-[var(--text-secondary)]">
          {nome}
        </span>
      </div>
    );
  },
);
