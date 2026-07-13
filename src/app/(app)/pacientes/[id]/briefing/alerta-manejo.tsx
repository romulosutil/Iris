import { Banner } from "@/components/ui/banner";
import type { AlertaManejo } from "./queries";

/**
 * ⚠ ALERTA DE MANEJO — isolado visualmente do resto do briefing (Banner, não
 * Card): é a info que evita o pior desfecho da sessão, não contexto histórico
 * comum (justificativa do wireframe §1.1). `Banner` já carrega
 * `role="status"` implícito via estrutura; aqui a severidade é sempre visual
 * E textual (ícone+cor não bastam sozinhos — §4C do design system).
 */
export function AlertaManejoBanner({ alertas }: { alertas: AlertaManejo[] }) {
  if (alertas.length === 0) return null;
  return (
    <Banner
      variant="alerta"
      titulo="Alerta de manejo"
      role="alert"
      aria-live="polite"
    >
      <ul className="flex flex-col gap-1">
        {alertas.map((a) => (
          <li key={a.extractionId}>
            {a.comportamento ?? "Comportamento não descrito"}
            {a.antecedente ? ` — antecedente: ${a.antecedente}` : ""}
            {a.consequenciaRegulacao ? ` · regulação: ${a.consequenciaRegulacao}` : ""}
          </li>
        ))}
      </ul>
    </Banner>
  );
}
