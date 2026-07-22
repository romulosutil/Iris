import { cn } from "@/lib/cn";
import type { SessionEstado } from "./actions";

/**
 * Selo do estado de check-in da sessão. Mesmo vocabulário visual do design
 * system (contorno âncora + fill pastel + texto), mas semântica da AGENDA — não
 * reusa o StatusBadge, que é travado nos estados de evidência da IA. Cor nunca
 * carrega sozinha o significado: o rótulo textual sempre acompanha (§4C a11y).
 */
const config: Record<SessionEstado, { rotulo: string; classe: string }> = {
  agendada: { rotulo: "Agendada", classe: "bg-[var(--surface-card)] text-[var(--text-primary)]" },
  realizada: { rotulo: "Realizada", classe: "bg-[var(--color-blue)] text-[var(--text-primary)]" },
  falta_paciente: { rotulo: "Falta (paciente)", classe: "bg-[var(--color-terracotta)] text-[var(--text-primary)]" },
  falta_terapeuta: { rotulo: "Falta (terapeuta)", classe: "bg-[var(--color-terracotta)] text-[var(--text-primary)]" },
  cancelada: {
    rotulo: "Cancelada",
    classe: "bg-[var(--surface-card)] text-[var(--text-secondary)] line-through",
  },
};

export function EstadoBadge({ estado }: { estado: SessionEstado }) {
  const { rotulo, classe } = config[estado];
  return (
    <span
      data-estado={estado}
      className={cn(
        "border-[var(--border-brutal)] inline-flex items-center border-2 px-2 py-0.5 rounded-[var(--radius-xs)]",
        "font-display text-xs font-semibold tracking-wide uppercase",
        classe,
      )}
    >
      {rotulo}
    </span>
  );
}
