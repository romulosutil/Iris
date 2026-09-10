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
        className="animate-pulse rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)]"
        data-testid="skeleton-fila-sessoes"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex min-h-14 items-center gap-4 border-t border-[var(--border-brutal)]/20 px-4 py-2 first:border-t-0"
          >
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-1/3 rounded bg-[var(--surface-muted)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--surface-muted)]" />
            </div>
            <div className="h-5 w-28 rounded bg-[var(--surface-muted)]" />
            <div className="h-4 w-32 rounded bg-[var(--surface-muted)]" />
          </div>
        ))}
      </div>
      <p role="status" className="sr-only">
        Carregando sessões travadas.
      </p>
    </Stack>
  );
}
