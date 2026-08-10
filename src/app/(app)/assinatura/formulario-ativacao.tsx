"use client";

import { useActionState, useEffect } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { QrCode } from "@/components/ui/qr-code";
import { BotaoCopiar } from "@/components/ui/botao-copiar";
import { formatarBRL } from "@/lib/billing/calculator";
import { ativarAssinatura } from "./actions";
import type { AtivacaoState } from "./logic";

type AcaoAtivacao = (
  prev: AtivacaoState,
  formData: FormData,
) => Promise<AtivacaoState> | AtivacaoState;

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
      {/* A escolha "cartão ou Pix" saiu daqui em 10/08/2026, e não por
          simplificação de layout: ela era FICÇÃO. `NovoVinculo.metodo` nunca foi
          lido por adapter nenhum — nem pelo Mercado Pago (sempre `preapproval`,
          sempre cartão) nem pelo Asaas (sempre Pix Automático). Com "Cartão de
          crédito" pré-selecionado, a clínica escolhia cartão e recebia um QR
          Code de Pix. Uma tela que promete o que o sistema não entrega é pior
          que uma tela com uma opção só. Volta quando algum adapter honrar o
          campo. */}
      <div className="font-body flex flex-col gap-1.5 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-3 text-[var(--text-primary)]">
        <p className="font-display text-sm font-semibold">
          Pagamento por Pix Automático
        </p>
        {/* Sem número aqui de propósito: quem sabe quanto a ativação cobra é a
            autorização devolvida pelo provedor, e repetir a constante nesta tela
            criaria uma segunda fonte da verdade que envelhece sozinha (D22). */}
        <p className="text-xs text-[var(--text-secondary)]">
          Você autoriza uma vez no app do seu banco e as cobranças seguintes são
          debitadas sozinhas, sempre pelo valor apurado no ciclo. A ativação
          cobra um valor mínimo, informado nesta tela antes do QR Code.
        </p>
      </div>

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
