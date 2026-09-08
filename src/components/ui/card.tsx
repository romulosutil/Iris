import * as React from "react";
import { cn } from "@/lib/cn";
import {
  surface,
  type SurfaceVariante,
} from "@/components/ui/primitives/surface";
import { Pill } from "@/components/ui/primitives/pill";
import { CheckIcon, SparkleIcon, LayersIcon } from "@/components/ui/icon";

export type EpistemicState =
  | "fact"
  | "suggestion"
  | "conquistado"
  | "candidato"
  | "sugerida"
  | "candidata";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @deprecated usar `epistemicState` */
  estado?: EpistemicState;
  epistemicState?: EpistemicState;
  /** Título do cartão; recebe tratamento display. */
  titulo?: React.ReactNode;
  /** Se true, adiciona barra de sotaque no topo */
  destacado?: boolean;
  /** Se true, força a borda esquerda espessa independente do estado */
  bordaEsquerda?: boolean;
  /** Se true, adiciona hover e feedback de foco tátil */
  interativo?: boolean;
  interactive?: boolean;
  como?: "div" | "li" | "article" | "section" | "button" | "a";
  href?: string;
  disabled?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    className,
    estado,
    epistemicState,
    titulo,
    destacado = false,
    bordaEsquerda = false,
    interativo = false,
    interactive = false,
    como = "div",
    children,
    disabled = false,
    ...props
  },
  ref,
) {
  const Component = como as any;
  const isInteractive =
    interativo ||
    interactive ||
    como === "button" ||
    como === "a" ||
    Boolean(props.onClick);
  const resolvedState = epistemicState ?? estado ?? "fact";

  // Semântica de botão para elementos não-nativos com onClick: sem isto o card
  // fica clicável só para mouse (invisível a Tab e leitores de tela).
  const precisaSemanticaBotao =
    como !== "button" && como !== "a" && Boolean(props.onClick);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    props.onKeyDown?.(e);
    if (disabled || e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.currentTarget.click();
    }
  };

  // Eixo Estrutural de Profundidade:
  // - fato/conquistado: solida (LEVANTA com --ds-shadow)
  // - sugerida/suggestion: sugerida (AFUNDA com --elevation-inset + tracejado violeta)
  // - candidata/candidato: candidata (AFUNDA com --elevation-inset + pontilhado azul)
  let variante: SurfaceVariante = "solida";
  let badgeNode: React.ReactNode = null;

  if (resolvedState === "suggestion" || resolvedState === "sugerida") {
    variante = "sugerida";
    badgeNode = (
      <Pill
        variant="inset"
        colorScheme="violeta"
        size="sm"
        icon={<SparkleIcon size={12} />}
      >
        Sugerido
      </Pill>
    );
  } else if (resolvedState === "candidato" || resolvedState === "candidata") {
    variante = "candidata";
    badgeNode = (
      <Pill
        variant="inset"
        colorScheme="azul"
        size="sm"
        icon={<LayersIcon size={12} />}
      >
        Candidato
      </Pill>
    );
  } else if (resolvedState === "conquistado") {
    variante = "solida";
    badgeNode = (
      <Pill
        variant="solid"
        colorScheme="menta"
        size="sm"
        icon={<CheckIcon size={12} />}
      >
        Conquistado
      </Pill>
    );
  } else {
    // `fact` — o DEFAULT de todo `<Card>` que não declara estado. Sem selo.
    //
    // Este ramo era o `else` que estampava "Conquistado ✓" incondicionalmente,
    // e o default caía nele: cartão que não dizia nada sobre si ganhava um selo
    // menta afirmando conquista. Na navegação isso aparecia como o briefing
    // dizendo "Última sessão · Conquistado — Nenhuma sessão anterior registrada
    // ainda", "Metas de hoje · Conquistado — Nenhuma meta ativa registrada" e o
    // checklist de onboarding com "Conquistado" ao lado de "0 de 5 concluídos".
    // Selo é afirmação: cartão sem estado declarado não tem o que afirmar.
    //
    // `cartao-prontidao.tsx` documenta este mesmo defeito e por isso monta o
    // próprio contêiner com `surface()` em vez de usar `Card`. Aquela decisão
    // segue de pé (o cartão da escada não quer selo NENHUM em estado algum);
    // o que muda aqui é que ela deixa de ser a única defesa.
    variante = "solida";
  }

  const isFact = variante === "solida";
  const surfaceStyle = surface(variante, {
    radius: "control",
    className: cn(
      isFact ? "bg-[var(--surface-card)]" : "bg-[var(--surface-card)]/80",
      (bordaEsquerda || resolvedState === "conquistado") &&
        "border-l-[4px] border-l-[var(--status-success-border)]",
      isInteractive &&
        !disabled &&
        "cursor-pointer text-left select-none transition-[transform,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-hover)] focus-visible:outline-focus outline-none focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]",
      disabled && "opacity-60 cursor-not-allowed pointer-events-none",
    ),
  });

  return (
    <Component
      ref={ref as any}
      data-estado={resolvedState}
      data-destacado={destacado}
      data-interativo={isInteractive}
      className={cn(
        "flex flex-col gap-2 p-5 text-[var(--text-primary)]",
        destacado && "relative pt-8",
        surfaceStyle,
        className,
      )}
      {...props}
      {...(como === "button" ? { disabled } : {})}
      {...(disabled && como !== "button" ? { "aria-disabled": true } : {})}
      {...(precisaSemanticaBotao
        ? {
            role: "button",
            tabIndex: disabled ? -1 : 0,
            onKeyDown: handleKeyDown,
          }
        : {})}
      onClick={disabled ? undefined : props.onClick}
    >
      {destacado ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-2 rounded-t-[var(--radius-control)] bg-[var(--action-primary)]"
        />
      ) : null}
      {/* Cabeçalho só existe quando há o que colocar nele. Com o selo agora
          opt-in, um `<Card>` sem título e sem estado renderizava esta linha
          vazia — e ela cobra o `gap-2` do contêiner como se houvesse conteúdo,
          empurrando o corpo do cartão para baixo sem motivo visível. */}
      {titulo || badgeNode ? (
        <div className="flex items-center justify-between gap-3">
          {titulo ? (
            <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              {titulo}
            </h3>
          ) : null}
          {badgeNode ? <div className="shrink-0">{badgeNode}</div> : null}
        </div>
      ) : null}
      {children ? (
        <div className="text-sm text-[var(--text-primary)]">{children}</div>
      ) : null}
    </Component>
  );
});
