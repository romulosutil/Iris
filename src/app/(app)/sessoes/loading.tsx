import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Estado "carregando" de `/sessoes` (#512 · T04 · R-31): skeleton em forma de
 * linha (o mesmo formato do item real), NUNCA um spinner solto no meio do
 * conteúdo — é o convention do Next para o segmento (`loading.tsx` some
 * assim que `page.tsx` resolve).
 */
export default function CarregandoSessoes() {
  return (
    <Stack gap="lg">
      <PageHeader title="Sessões" description="Carregando a fila…" />
      <div
        aria-hidden="true"
        className="flex flex-col gap-3"
        data-testid="skeleton-fila-sessoes"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4"
          >
            <div className="h-4 w-1/3 rounded bg-[var(--surface-elevated)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--surface-elevated)]" />
            <div className="mt-2 h-3 w-2/5 rounded bg-[var(--surface-elevated)]" />
          </div>
        ))}
      </div>
      <p role="status" className="sr-only">
        Carregando sessões travadas.
      </p>
    </Stack>
  );
}
