"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Botão de "copiar para a área de transferência" do design system.
 *
 * Antes disto só existia uma implementação local, não exportada, no formulário
 * de MFA (`src/app/(auth)/mfa/setup/mfa-setup-form.tsx`). O padrão de feedback
 * daqui é o mesmo dali — confirmação temporária, falha explícita, texto
 * original continuando visível na tela para cópia manual.
 *
 * Duas decisões de acessibilidade que não são detalhe:
 *
 * 1. **A confirmação é anunciada por uma região `aria-live="polite"`**, não só
 *    pela troca do rótulo visível. Trocar o texto de um botão que já está com o
 *    foco não é um evento que todo leitor de tela anuncie de forma confiável —
 *    sem a região viva, quem não enxerga não descobre se copiou.
 * 2. **Falhar não pode ser silencioso.** Navegador sem `navigator.clipboard`
 *    (contexto não-seguro, permissão negada, WebView restrita) não deve estourar
 *    nem fingir sucesso: mostra "não foi possível copiar" e o valor segue
 *    visível na tela para seleção manual.
 */

export interface BotaoCopiarProps {
  /** Texto que vai para a área de transferência. */
  valor: string;
  /** Rótulo do botão em repouso. */
  rotulo?: string;
  className?: string;
}

type Estado = "repouso" | "copiado" | "falha";

const MS_CONFIRMACAO = 2500;
const MS_FALHA = 4000;

export function BotaoCopiar({
  valor,
  rotulo = "Copiar código",
  className,
}: BotaoCopiarProps) {
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
      // Checagem explícita: em contexto não-seguro `navigator.clipboard` é
      // `undefined`, e chamar `.writeText` nele seria TypeError, não rejeição.
      const area = globalThis.navigator?.clipboard;
      if (!area?.writeText) throw new Error("clipboard indisponível");
      await area.writeText(valor);
      setEstado("copiado");
      agendarVoltaAoRepouso(MS_CONFIRMACAO);
    } catch {
      setEstado("falha");
      agendarVoltaAoRepouso(MS_FALHA);
    }
  }

  const mensagem =
    estado === "copiado"
      ? "Copiado!"
      : estado === "falha"
        ? "Não foi possível copiar. Selecione o código e copie manualmente."
        : "";

  return (
    <>
      <Button
        type="button"
        variante="neutra"
        tamanho="sm"
        onClick={() => void copiar()}
        className={cn(
          "w-full sm:w-auto",
          estado === "falha" &&
            "border-[var(--status-error-fg)] text-[var(--status-error-fg)]",
          className,
        )}
      >
        {estado === "copiado" ? "Copiado!" : rotulo}
      </Button>
      {/* Sempre montada (mesmo vazia): região viva inserida no DOM junto com o
          texto costuma não ser anunciada — o leitor de tela precisa já estar
          observando o nó quando o conteúdo muda. */}
      <span role="status" aria-live="polite" className="sr-only">
        {mensagem}
      </span>
    </>
  );
}
