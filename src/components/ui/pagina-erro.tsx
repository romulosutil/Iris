import * as React from "react";
import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { surface } from "@/components/ui/primitives/surface";

export interface PaginaErroProps {
  /** Eyebrow monoespaçada acima do título (ex.: "Erro 404", "Erro 500"). */
  codigo: string;
  titulo: string;
  descricao: React.ReactNode;
  /**
   * `error.digest` do Next quando existir. Só é exibido quando presente —
   * um fallback constante pareceria chave de correlação sem correlacionar
   * nada (todo erro client-side mostraria o mesmo "ID").
   */
  auditId?: string;
  /** Ações de saída (botões/links). */
  children?: React.ReactNode;
}

/**
 * Shell compartilhado das páginas de erro (not-found, error, global-error).
 * Um único lugar para copy estrutural, card e a11y: as três páginas ficam
 * idênticas por construção, em vez de três cópias que divergem em silêncio
 * (global-error é a que ninguém renderiza localmente).
 *
 * Borda e sombra vêm inteiras de `surface("solida")` — nenhum override de
 * cor/largura aqui (Regra 0: tokens, nunca hex ad hoc).
 */
export function PaginaErro({
  codigo,
  titulo,
  descricao,
  auditId,
  children,
}: PaginaErroProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-16">
      <Logo variante="completo" altura={36} className="mb-2" />

      <div
        className={surface("solida", {
          radius: "control",
          className:
            "flex w-full flex-col gap-4 bg-[var(--surface-card)] p-6 text-[var(--text-primary)]",
        })}
      >
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
            {codigo}
          </p>
          <h1 className="font-display text-2xl font-bold text-balance text-[var(--text-primary)] md:text-3xl">
            {titulo}
          </h1>
          <p className="max-w-[60ch] text-base leading-relaxed text-[var(--text-primary)]">
            {descricao}
          </p>

          {auditId ? (
            <Alert severidade="erro" titulo="ID do erro" className="mt-2">
              <span className="font-mono">{auditId}</span>
            </Alert>
          ) : null}
        </div>

        {children ? (
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">{children}</div>
        ) : null}
      </div>
    </main>
  );
}
