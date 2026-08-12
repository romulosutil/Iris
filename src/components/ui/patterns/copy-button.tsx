"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface CopyButtonProps {
  /** Texto que vai para a área de transferência. */
  valor: string;
  /** Rótulo do botão em repouso. */
  rotulo?: string;
  className?: string;
}


type Estado = "repouso" | "copiado" | "falha";

const MS_CONFIRMACAO = 2500;
const MS_FALHA = 4000;

/**
 * CopyButton (antigo BotaoCopiar) — Botão de copiar para a área de transferência com feedback auditivo e visual.
 */
export function CopyButton({
  valor,
  rotulo = "Copiar código",
  className,
}: CopyButtonProps) {
  const [estado, setEstado] = React.useState<Estado>("repouso");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function agendarVoltaAoRepouso(ms: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setEstado("repouso"), ms);
  }

  async function copiar() {
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setEstado("falha");
        agendarVoltaAoRepouso(MS_FALHA);
        return;
      }
      await navigator.clipboard.writeText(valor);
      setEstado("copiado");
      agendarVoltaAoRepouso(MS_CONFIRMACAO);
    } catch {
      setEstado("falha");
      agendarVoltaAoRepouso(MS_FALHA);
    }
  }

  const textoBotao =
    estado === "copiado"
      ? "Copiado!"
      : estado === "falha"
        ? "Não foi possível copiar"
        : rotulo;

  const variante =
    estado === "copiado"
      ? ("secundaria" as const)
      : estado === "falha"
        ? ("terciaria" as const)
        : ("secundaria" as const);

  const mensagemAria =
    estado === "copiado"
      ? "Texto copiado para a área de transferência."
      : estado === "falha"
        ? "Não foi possível copiar automaticamente. Selecione o texto manualmente."
        : "";

  return (
    <div className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variante={variante}
        onClick={copiar}
        aria-label={estado === "copiado" ? "Código copiado" : rotulo}
        aria-live="polite"
      >
        {textoBotao}
      </Button>

      {/* Região viva anunciada por leitores de tela */}
      <span role="status" className="sr-only" aria-live="polite">
        {mensagemAria}
      </span>
    </div>
  );
}

