"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { QrCode } from "@/components/ui/qr-code";
import { CopyButton } from "@/components/ui/patterns/copy-button";
import { formatarBRL } from "@/lib/billing/calculator";
import { ativarAssinatura } from "./actions";
import type { AtivacaoState } from "./logic";

type AcaoAtivacao = (
  prev: AtivacaoState,
  formData: FormData,
) => Promise<AtivacaoState> | AtivacaoState;

import type { SituacaoConta } from "@/lib/billing/estado-conta";

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
  /**
   * Documento já gravado na clínica, para pré-preencher o campo. Continua
   * editável de propósito: um CPF/CNPJ errado gravado numa tentativa anterior
   * é justamente o caso em que a pessoa volta a esta tela — travar o campo
   * transformaria o erro num beco.
   */
  documentoAtual?: string | null;
  /**
   * Situação atual da conta vinda do Server Component (leitura viva do banco).
   */
  situacaoConta?: SituacaoConta;
  /**
   * Só existe como costura de teste para injetar o estado inicial do useActionState.
   */
  estadoInicial?: AtivacaoState;
}

function navegarPadrao(url: string) {
  window.location.assign(url);
}

export function FormularioAtivacao({
  acao = ativarAssinatura,
  navegar = navegarPadrao,
  documentoAtual,
  situacaoConta,
  estadoInicial,
}: FormularioAtivacaoProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    AtivacaoState,
    FormData
  >(
    acao as (prev: AtivacaoState, formData: FormData) => Promise<AtivacaoState>,
    estadoInicial ?? {},
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

  // Polling e VisibilityChange para Pix pendente
  const estaAtiva = situacaoConta?.estado === "ativa";
  const temAutorizacaoPixPendente = autorizacao?.forma === "pix_copia_e_cola";

  useEffect(() => {
    if (!temAutorizacaoPixPendente || estaAtiva) return;

    // Polling a cada 5 segundos
    const intervalo = setInterval(() => {
      router.refresh();
    }, 5000);

    // Visibility change
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [temAutorizacaoPixPendente, estaAtiva, router]);

  // O que a pessoa deve ver no campo: o texto que ela acabou de digitar (quando
  // a action recusou) ou o documento já gravado. `defaultValue` basta: o React
  // 19 reseta o formulário não-controlado depois da action, o que também limpa
  // a marca de "campo editado pelo usuário" — o valor volta a seguir o
  // `defaultValue` novo. Um `key` para forçar remontagem foi tentado e MEDIDO
  // como inerte (removê-lo não derruba teste nenhum, inclusive o que digita
  // antes de submeter), então não ficou.
  const documentoNoCampo = state.documento ?? documentoAtual ?? "";

  if (estaAtiva) {
    return (
      <div className="flex flex-col gap-4">
        <Alert severidade="sucesso" titulo="Assinatura ativa">
          <p>
            Sua assinatura foi ativada com sucesso! O pagamento foi confirmado
            pelo seu banco e o cadastro de pacientes está totalmente liberado.
          </p>
        </Alert>
        <div>
          <Button variante="primaria" asChild>
            <Link href="/pacientes/novo">Cadastrar paciente</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form
      action={formAction}
      // Erro de documento não repete no topo: ele já é anunciado no campo, e a
      // mesma frase em dois lugares faz o leitor de tela lê-la duas vezes.
      error={state.erroDocumento ? undefined : state.error}
    >
      <Field
        label="CPF ou CNPJ do titular da conta"
        htmlFor="cpfCnpj"
        error={state.erroDocumento}
        hint="O banco exige o documento de quem autoriza para registrar o Pix Automático. Use o CPF ou o CNPJ da própria clínica."
      >
        <Input
          id="cpfCnpj"
          name="cpfCnpj"
          defaultValue={documentoNoCampo}
          // `numeric` e não `required`: o campo aceita máscara (ponto, barra,
          // traço) e a validação de verdade é a do servidor — `required` no
          // HTML só duplicaria a regra num lugar que o teclado do celular já
          // contorna.
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          aria-invalid={state.erroDocumento ? true : undefined}
        />
      </Field>

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
              {/* #286 — o teto de valor é diretriz do BACEN: TODO app de banco
                  pergunta, em TODA ativação, e sugere o valor em tela (o da
                  ativação). Aceitar a sugestão faz toda mensalidade futura ser
                  recusada meses depois, em silêncio. Medido em 13/08/2026, no
                  sandbox: o teto não apareceu em nenhum campo do objeto
                  `authorization` — se a API de produção expõe o valor segue em
                  aberto — `infra/README.md` manda medir na 1ª ativação real.
                  Até lá não há detecção possível e esta copy é a única
                  barreira preventiva. Fica antes do QR de propósito: depois de ler o
                  código a pessoa já está no app do banco. `R$ 40` é conta de folga sobre a faixa marginal real
                  (R$ 25 a R$ 39 por paciente ativo), não promessa de preço. */}
              <p className="mt-2">
                <strong>O banco vai pedir um valor máximo de cobrança.</strong>{" "}
                Se ele sugerir os{" "}
                {formatarBRL(autorizacao.valorAtivacaoCentavos)} desta cobrança,
                não aceite — isso é só a ativação.{" "}
                <strong>
                  Se o teto ficar abaixo da mensalidade, toda cobrança futura é
                  recusada, sem aviso.
                </strong>{" "}
                Defina o maior valor que o banco permitir: o Iris só cobra o que
                for apurado no ciclo. Se preferir um número, use pacientes
                esperados no mês multiplicado por <strong>R$ 40</strong>.
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
                <CopyButton
                  valor={autorizacao.brCode}
                  rotulo="Copiar código Pix"
                />
              </div>
              <p className="mt-3">
                A assinatura só é ativada depois que o banco confirmar o
                pagamento. A confirmação chega sozinha — você não precisa mandar
                comprovante nem ficar nesta tela.
              </p>
              {/* Saída da tela, só neste ramo: depois do QR não há mais nada a
                  fazer aqui, e sem este link a pessoa fica esperando uma
                  confirmação que chega por webhook.

                  Utiliza polling com router.refresh() e visibilitychange no cliente
                  para que a tela e o layout inteiro revalidem o estado e façam a
                  tarja sumir automaticamente assim que o Pix for confirmado. */}
              <div className="mt-3">
                <Button variante="primaria" asChild>
                  <Link href="/pacientes/novo">Cadastrar paciente</Link>
                </Button>
              </div>
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
