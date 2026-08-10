"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { QrCode } from "@/components/ui/qr-code";
import { BotaoCopiar } from "@/components/ui/botao-copiar";
import { cn } from "@/lib/cn";
import { formatarBRL } from "@/lib/billing/calculator";
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
    // Sem número aqui de propósito: quem sabe quanto a ativação cobrou é a
    // autorização devolvida pelo provedor, e repetir a constante nesta lista
    // criaria uma segunda fonte da verdade que envelhece sozinha (D22).
    ajuda:
      "Você recebe um QR Code / código para pagar a cada cobrança. A ativação cobra um valor mínimo, informado na tela antes do QR Code.",
  },
] as const;

export interface FormularioAtivacaoProps {
  /**
   * Só existe como costura de teste: em produção é sempre a server action
   * real. Injetar a ação evita que o teste de componente precise de servidor,
   * banco e sessão só para exercitar pendência, erro e autorização pendente.
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
  const [state, formAction, isPending] = useActionState<
    AtivacaoState,
    FormData
  >(
    acao as (prev: AtivacaoState, formData: FormData) => Promise<AtivacaoState>,
    {},
  );
  const [metodo, setMetodo] = useState<string>("cartao");
  const legendaId = useId();

  const autorizacao = state.autorizacao;
  // O efeito depende SÓ da URL do ramo redirect. Derivar aqui (em vez de olhar
  // `autorizacao` dentro do efeito) é o que garante que o ramo Pix nunca
  // dispare navegação: no Pix isto é `undefined`, o efeito não roda, e o BR
  // Code não tem como virar destino de navegação por descuido futuro.
  const urlRedirect =
    autorizacao?.forma === "redirect" ? autorizacao.url : undefined;

  useEffect(() => {
    if (!urlRedirect) return;
    // Redirect de conveniência. NUNCA é o único caminho: bloqueador de popup,
    // navegação bloqueada por política do dispositivo ou jsdom fazem isto
    // falhar em silêncio — por isso o link visível abaixo é renderizado
    // sempre que há URL de checkout, e não depende deste efeito.
    try {
      navegar(urlRedirect);
    } catch {
      /* o link visível continua sendo o caminho de saída */
    }
  }, [urlRedirect, navegar]);

  return (
    <Form action={formAction} error={state.error}>
      <fieldset
        className="m-0 flex flex-col gap-2 border-0 p-0"
        aria-describedby={legendaId}
      >
        <legend className="font-display mb-1.5 text-sm font-semibold text-[var(--text-primary)]">
          Como você quer pagar?
        </legend>
        <p id={legendaId} className="text-sm text-[var(--text-secondary)]">
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
                  "font-body bg-[var(--surface-card)] text-[var(--text-primary)]",
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
                  className="mt-1 size-5 shrink-0 accent-[var(--action-primary)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{opcao.label}</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {opcao.ajuda}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {autorizacao ? (
        <Alert severidade="info" titulo="Falta pagar para concluir">
          {autorizacao.forma === "redirect" ? (
            <>
              <p>
                Abrimos a página de pagamento em seguida. Se ela não abrir
                sozinha, use o link abaixo — sem concluir o pagamento, a
                assinatura não é ativada.
              </p>
              <p className="mt-2">
                <a
                  href={autorizacao.url}
                  className="font-semibold text-[var(--text-primary)] underline underline-offset-4"
                >
                  Ir para o pagamento
                </a>
              </p>
            </>
          ) : (
            <>
              {/* D22 — divulgação ANTES do QR, e dentro do mesmo <Alert>: o
                  leitor de tela recebe a cobrança junto com o resto da região,
                  não como um parágrafo solto ao lado. O valor vem da
                  autorização (o que foi cobrado neste QR), nunca da constante
                  do adapter: o preço está gravado no payload EMV do BR Code, e
                  um QR emitido ontem não muda porque a constante mudou hoje. */}
              <p>
                <strong>
                  Este QR Code cobra{" "}
                  {formatarBRL(autorizacao.valorAtivacaoCentavos)} agora.
                </strong>{" "}
                É esse pagamento que registra a autorização de Pix Automático no
                seu banco — o banco só passa a aceitar as cobranças seguintes
                depois que o primeiro Pix é confirmado, e não há como registrar
                sem ele. Não é a mensalidade: a primeira cobrança pelas fichas
                ativas só nasce quando o primeiro ciclo fecha.
              </p>
              <p className="mt-2">
                Abra o app do seu banco, escolha Pix e leia o QR Code abaixo —
                ou copie o código e cole na opção “Pix copia e cola”.
              </p>
              <div className="mt-3 flex justify-center">
                <QrCode
                  value={autorizacao.brCode}
                  alt="QR Code do Pix para autorizar a assinatura"
                />
              </div>
              {/* `break-all` de propósito: o BR Code é uma cadeia única sem
                  espaços — sem isso ele estoura a largura em tela estreita. */}
              <p className="mt-3 max-w-full overflow-x-auto rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/40 bg-[var(--surface-muted)] p-2 font-mono text-xs break-all">
                {autorizacao.brCode}
              </p>
              <div className="mt-2">
                <BotaoCopiar
                  valor={autorizacao.brCode}
                  rotulo="Copiar código Pix"
                />
              </div>
              <p className="mt-3">
                A assinatura só é ativada depois que o banco confirmar o
                pagamento. A confirmação chega sozinha — você não precisa mandar
                comprovante nem ficar nesta tela.
              </p>
            </>
          )}
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
