import { cn } from "@/lib/cn";

/**
 * "Salvo localmente" — componente FIXO, nunca toast (R-37, jornada-sessao-
 * unificada.md §3.4). Princípio "a informação nunca se perde implicitamente":
 * um toast desaparece sozinho; este componente fica montado o tempo todo, com
 * `aria-live="polite"` para leitor de tela anunciar a transição sem roubar o
 * foco. O chamador decide o estado — este componente só renderiza.
 */
export type EstadoSalvoLocalmente = "vazio" | "salvando" | "salvo" | "erro";

const TEXTO: Record<EstadoSalvoLocalmente, string> = {
  vazio: "Nada capturado ainda nesta sessão.",
  salvando: "Salvando…",
  salvo: "Salvo localmente.",
  erro: "Não foi possível salvar.",
};

const ICONE: Record<EstadoSalvoLocalmente, string> = {
  vazio: "•",
  salvando: "…",
  salvo: "✓",
  erro: "⚠",
};

export function SalvoLocalmente({
  estado,
  detalhe,
}: {
  estado: EstadoSalvoLocalmente;
  /** Texto extra (ex.: horário do último salvamento, ou a razão do erro). */
  detalhe?: string;
}) {
  const erro = estado === "erro";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "font-body flex items-center gap-2 rounded-[var(--radius-xs)] border-2 px-3 py-2 text-sm",
        erro
          ? "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
          : "border-[var(--border-brutal)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]",
      )}
    >
      <span aria-hidden="true">{ICONE[estado]}</span>
      <span>{detalhe ?? TEXTO[estado]}</span>
    </div>
  );
}
