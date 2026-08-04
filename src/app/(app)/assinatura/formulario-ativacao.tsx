"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { ativarAssinatura } from "./actions";
import type { AtivacaoState } from "./logic";

type AcaoAtivacao = (
  prev: AtivacaoState,
  formData: FormData,
) => Promise<AtivacaoState> | AtivacaoState;

const METODOS = [
  {
    value: "cartao",
    label: "Cartão de crédito",
    ajuda: "Cobrança automática a cada ciclo, sem precisar lembrar de pagar.",
  },
  {
    value: "pix",
    label: "Pix",
    ajuda: "Você recebe um QR Code / código para pagar a cada cobrança.",
  },
] as const;

export interface FormularioAtivacaoProps {
  /**
   * Só existe como costura de teste: em produção é sempre a server action
   * real. Injetar a ação evita que o teste de componente precise de servidor,
   * banco e sessão só para exercitar pendência, erro e `checkoutUrl`.
   */
  acao?: AcaoAtivacao;
  /**
   * Idem: `window.location` é não-configurável no jsdom, então o redirect só é
   * observável se entrar por aqui. Em produção é sempre a navegação real.
   */
  navegar?: (url: string) => void;
}

function navegarPadrao(url: string) {
  window.location.assign(url);
}

export function FormularioAtivacao({
  acao = ativarAssinatura,
  navegar = navegarPadrao,
}: FormularioAtivacaoProps) {
  const [state, formAction, isPending] = useActionState<AtivacaoState, FormData>(
    acao as (
      prev: AtivacaoState,
      formData: FormData,
    ) => Promise<AtivacaoState>,
    {},
  );
  const [metodo, setMetodo] = useState<string>("cartao");
  const legendaId = useId();

  const checkoutUrl = state.checkoutUrl;

  useEffect(() => {
    if (!checkoutUrl) return;
    // Redirect de conveniência. NUNCA é o único caminho: bloqueador de popup,
    // navegação bloqueada por política do dispositivo ou jsdom fazem isto
    // falhar em silêncio — por isso o link visível abaixo é renderizado
    // sempre que há `checkoutUrl`, e não depende deste efeito.
    try {
      navegar(checkoutUrl);
    } catch {
      /* o link visível continua sendo o caminho de saída */
    }
  }, [checkoutUrl, navegar]);

  return (
    <Form action={formAction} error={state.error}>
      <fieldset
        className="m-0 flex flex-col gap-2 border-0 p-0"
        aria-describedby={legendaId}
      >
        <legend className="text-[var(--text-primary)] font-display mb-1.5 text-sm font-semibold">
          Como você quer pagar?
        </legend>
        <p id={legendaId} className="text-[var(--text-secondary)] text-sm">
          Você pode trocar a forma de pagamento depois.
        </p>
        {/* Radios nativos de propósito: o `role="radiogroup"` vem do
            <fieldset>/<legend> e a navegação por setas, o vínculo do nome
            acessível e o envio do campo `metodo` saem de graça do browser.
            O SegmentedControl do DS é `aria-pressed` (toggle), não escolha
            exclusiva — usá-lo aqui anunciaria o grupo errado no leitor de
            tela. */}
        <div className="flex flex-col gap-2">
          {METODOS.map((opcao) => {
            const selecionado = metodo === opcao.value;
            return (
              <label
                key={opcao.value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border-2 p-3",
                  "bg-[var(--surface-card)] text-[var(--text-primary)] font-body",
                  "has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-[length:var(--ring-width)] has-[:focus-visible]:outline-offset-[var(--ring-offset)]",
                  selecionado
                    ? "border-[var(--border-brutal)] shadow-[var(--ds-shadow)]"
                    : "border-[var(--border-brutal)]/40",
                )}
              >
                <input
                  type="radio"
                  name="metodo"
                  value={opcao.value}
                  checked={selecionado}
                  onChange={() => setMetodo(opcao.value)}
                  disabled={isPending}
                  className="accent-[var(--action-primary)] mt-1 size-5 shrink-0"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{opcao.label}</span>
                  <span className="text-[var(--text-secondary)] text-xs">
                    {opcao.ajuda}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {checkoutUrl ? (
        <Alert severidade="info" titulo="Falta pagar para concluir">
          <p>
            Abrimos a página de pagamento em seguida. Se ela não abrir sozinha,
            use o link abaixo — sem concluir o pagamento, a assinatura não é
            ativada.
          </p>
          <p className="mt-2">
            <a
              href={checkoutUrl}
              className="text-[var(--text-primary)] font-semibold underline underline-offset-4"
            >
              Ir para o pagamento
            </a>
          </p>
        </Alert>
      ) : null}

      <Button
        type="submit"
        variante="primaria"
        disabled={isPending}
        isLoading={isPending}
      >
        {isPending ? "Abrindo pagamento…" : "Ativar assinatura"}
      </Button>
    </Form>
  );
}
