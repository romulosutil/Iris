"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { Stack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

/**
 * Estado "erro" de `/sessoes` (#512 · T04 · R-31, R-32). Boundary de rota
 * (Next `error.tsx`) para o segmento `/sessoes` — não é o `error.tsx` global
 * (`src/app/error.tsx`), que derrubaria também o `AppLayout`.
 *
 * `role="status"`, não `role="alert"`: mesma decisão de
 * `pacientes/[id]/timeline/estado-de-erro.tsx` — interromper a leitura de
 * tela é reservado a risco clínico neste produto; falha de carregamento
 * precisa ser anunciada, não precisa interromper.
 *
 * Regra que este componente carrega (R-32, memória
 * `erro-renderizado-como-empty-state`): "a fila não carregou" NUNCA pode
 * virar "Nada travado" — são afirmações opostas. Este boundary garante que
 * uma falha de leitura (RLS, timeout, conexão) nunca chega a `page.tsx` para
 * ser silenciosamente engolida num `catch` que renderizaria o empty-state.
 */
export default function ErroSessoes({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Stack gap="lg">
      <PageHeader title="Sessões" description="A fila não carregou." />
      <div
        role="status"
        className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-[var(--status-error-fg)]"
      >
        <div className="flex flex-col gap-1">
          <p className="font-display text-sm font-bold">
            Não foi possível carregar a fila
          </p>
          <p className="text-xs font-medium">
            Isto não significa que não haja sessões travadas — significa que não
            conseguimos ler a fila agora. Tente de novo; se persistir, avise o
            suporte.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs">ID: {error.digest}</p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button variante="secundaria" tamanho="sm" onClick={reset}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </Stack>
  );
}
