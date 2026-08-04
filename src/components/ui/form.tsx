"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";

export interface FormProps extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "action"
> {
  action?: React.FormHTMLAttributes<HTMLFormElement>["action"];
  /** Mensagem de erro exibida via <Alert severidade="erro"> acima do formulário. */
  error?: string;
}

/**
 * `smooth` só quando a pessoa não pediu menos movimento.
 *
 * Rolagem animada é gatilho vestibular (WCAG 2.3.3, Animation from
 * Interactions). Quem marcou "reduzir movimento" no sistema recebe o salto
 * instantâneo — que continua resolvendo o problema real aqui, que é *ver* o
 * erro, não a animação.
 *
 * O guard de `matchMedia` não é defensivo à toa: jsdom não implementa a API, e
 * sem ele todo teste de componente que renderiza um <Form error> quebraria por
 * um detalhe de ambiente que nada tem a ver com o comportamento testado.
 */
function comportamentoDeRolagem(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "auto";
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/**
 * Wrapper client de <form>: expõe `submitting` (via useFormStatus-friendly
 * onSubmit) e centraliza a exibição de erro no <Alert> existente — nenhuma
 * tela deve renderizar seu próprio bloco de erro ad hoc (princípio: todo
 * elemento visível consome um componente do DS).
 *
 * ## Por que o erro rouba o foco e rola a tela
 *
 * O `<Alert>` é renderizado no TOPO do formulário. Em formulários longos — o de
 * cadastro de paciente tem 263 linhas e 3 seções — quem já rolou até o fim
 * submete, o servidor recusa, e a tela **não muda nada no campo de visão**: a
 * mensagem nasce centenas de pixels acima. O sintoma relatado é sempre o mesmo,
 * "cliquei em salvar e não aconteceu nada".
 *
 * O conserto mora AQUI, e não nas telas, porque ~30 delas usam o par
 * `useActionState` + `<Form error>`. Corrigir no wrapper conserta todas de uma
 * vez e impede que a próxima tela nasça com o mesmo bug.
 *
 * Três peças, cada uma cobrindo um público diferente:
 *
 * 1. **`scrollIntoView({ block: "center" })`** — para quem enxerga a tela.
 *    `center` e não `start`: alinhar no topo do viewport costuma esconder a
 *    mensagem atrás de header fixo.
 * 2. **`focus()` no container** (daí o `tabIndex={-1}`) — para quem navega por
 *    teclado. Sem isso o foco continua no botão de envio, lá embaixo, e o
 *    próximo Tab caminha para o rodapé, longe do erro. `-1` deixa o elemento
 *    focável por código sem inseri-lo na ordem de Tab.
 * 3. **`aria-live="assertive"` na região** — para leitor de tela. A região é
 *    renderizada SEMPRE (só fica visualmente oculta quando não há erro), porque
 *    live region que nasce junto com o conteúdo não é anunciada: o leitor
 *    precisa já estar observando o nó quando o texto entra.
 *
 * Limite conhecido: se a MESMA mensagem de erro voltar num segundo envio, a
 * `string` não muda, o efeito não reexecuta e não há novo salto. Como o foco já
 * está no erro desde a primeira vez, o caso degrada para "nada se move" — o que
 * é aceitável. Forçar reexecução exigiria uma chave de tentativa vinda de cada
 * action, e isso é mudança de contrato em ~30 telas.
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(function Form(
  { className, action, onSubmit, error, children, ...props },
  ref,
) {
  const [submitting, setSubmitting] = React.useState(false);
  const regiaoErroRef = React.useRef<HTMLDivElement>(null);
  // Guarda o valor do render anterior para distinguir "erro novo" de "erro que
  // já estava na tela". Sem isso, qualquer re-render por outro motivo (digitar
  // num campo controlado, por exemplo) roubaria o foco de volta para o topo —
  // tornando o formulário impossível de preencher.
  const erroAnterior = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const anterior = erroAnterior.current;
    erroAnterior.current = error;

    // Só a transição vazio → preenchido interessa.
    if (!error || anterior) return;

    const regiao = regiaoErroRef.current;
    if (!regiao) return;

    // jsdom não implementa `scrollIntoView`; o `focus()` abaixo é o que os
    // testes verificam, e ele não pode ser bloqueado por essa ausência.
    if (typeof regiao.scrollIntoView === "function") {
      regiao.scrollIntoView({
        block: "center",
        behavior: comportamentoDeRolagem(),
      });
    }
    // `preventScroll`: o posicionamento já foi decidido acima; deixar o browser
    // rolar de novo por causa do foco desfaria o `block: "center"`.
    regiao.focus({ preventScroll: true });
  }, [error]);

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (event) => {
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      onSubmit(event);
    } finally {
      // onSubmit síncrono do React não expõe promise — para fluxos
      // assíncronos (ex.: chamada de API), o consumidor controla o fim do
      // envio via `action` (server action) em vez de `onSubmit`.
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={ref}
      action={action}
      onSubmit={onSubmit ? handleSubmit : undefined}
      data-submitting={submitting || undefined}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      <div
        ref={regiaoErroRef}
        tabIndex={-1}
        aria-live="assertive"
        // `sr-only` (e não `hidden`) enquanto não há erro: `hidden` removeria o
        // nó da árvore de acessibilidade e a live region deixaria de existir
        // justamente antes do momento em que ela precisa estar sendo observada.
        // Como `sr-only` é `position:absolute`, a região vazia também não ocupa
        // slot no `flex flex-col gap-4` — nenhum espaçamento fantasma no topo.
        className={cn(
          "focus-visible:outline-focus outline-none",
          !error && "sr-only",
        )}
      >
        {error ? (
          <Alert severidade="erro" titulo="Não foi possível continuar">
            {error}
          </Alert>
        ) : null}
      </div>
      {children}
    </form>
  );
});
