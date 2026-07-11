import { cn } from "@/lib/cn";
import type { SessionEstado } from "./actions";

/**
 * Selo do estado de check-in da sessão. Mesmo vocabulário visual do design
 * system (contorno âncora + fill pastel + texto), mas semântica da AGENDA — não
 * reusa o StatusBadge, que é travado nos estados de evidência da IA. Cor nunca
 * carrega sozinha o significado: o rótulo textual sempre acompanha (§4C a11y).
 */
const config: Record<SessionEstado, { rotulo: string; classe: string }> = {
  agendada: { rotulo: "Agendada", classe: "bg-surface text-ink" },
  presente: { rotulo: "Presente", classe: "bg-mint text-ink-anchor" },
  realizada: { rotulo: "Realizada", classe: "bg-blue text-ink-anchor" },
  falta: { rotulo: "Falta", classe: "bg-terracotta text-ink-anchor" },
  cancelada: {
    rotulo: "Cancelada",
    classe: "bg-surface text-graphite line-through",
  },
};

export function EstadoBadge({ estado }: { estado: SessionEstado }) {
  const { rotulo, classe } = config[estado];
  return (
    <span
      data-estado={estado}
      className={cn(
        "border-ink-anchor inline-flex items-center border-2 px-2 py-0.5",
        "font-display text-xs font-semibold tracking-wide uppercase",
        classe,
      )}
    >
      {rotulo}
    </span>
  );
}
