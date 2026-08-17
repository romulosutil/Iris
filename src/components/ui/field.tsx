import * as React from "react";
import { cn } from "@/lib/cn";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor: string;
  error?: string;
  /** Texto de apoio estático (ex.: "Mínimo 12 caracteres."). Gera
   * `${htmlFor}-hint` e o liga sozinho no input (ver nota do componente). */
  hint?: React.ReactNode;
}

/**
 * Junta os `aria-describedby` do próprio campo com o que o consumidor já
 * tenha posto no filho, sem duplicar id (consumidores antigos ligam
 * `aria-describedby={`${htmlFor}-hint`}` na mão — isso continua válido e
 * vira no-op aqui em vez de virar id repetido).
 */
function unirDescribedBy(
  ...valores: (string | undefined | false)[]
): string | undefined {
  const ids = valores
    .filter((v): v is string => typeof v === "string")
    .flatMap((v) => v.split(/\s+/))
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

/**
 * Label associado + slot (o input, ligado via `htmlFor`) + dica opcional +
 * mensagem de erro acessível. Texto de erro em `text-ink-anchor` (preto) para
 * contraste AAA garantido em qualquer fundo — a cor (borda
 * terracotta/vermelha do Input) é sinal redundante, nunca a única pista
 * (princípio 4C).
 *
 * O `aria-describedby` do input é ligado AQUI, não pelo consumidor. A versão
 * anterior só gerava os ids e deixava cada formulário lembrar de concatenar
 * `${htmlFor}-hint`/`${htmlFor}-error` na mão — e a maioria dos ~90 usos de
 * `<Field>` no app não lembrava, então a mensagem de erro existia no DOM mas
 * o leitor de tela nunca a anunciava ao focar o campo. Acessibilidade que
 * depende de disciplina em todo call-site é acessibilidade que já falhou;
 * o padrão certo tem que ser o automático.
 *
 * Só funciona quando `children` é UM elemento que repassa props (o caso de
 * todos os usos: `<Input>`, `<select>`, `<textarea>`, `<Select>`). Com
 * múltiplos filhos ou filho que engole props, o comportamento é o de antes —
 * o consumidor pode ligar `aria-describedby` na mão e não gera id duplicado.
 */
export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  function Field(
    { className, label, htmlFor, error, hint, children, ...props },
    ref,
  ) {
    const idsDoCampo = unirDescribedBy(
      hint ? `${htmlFor}-hint` : undefined,
      error ? `${htmlFor}-error` : undefined,
    );

    const slot =
      idsDoCampo && React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<{ "aria-describedby"?: string }>,
            {
              "aria-describedby": unirDescribedBy(
                (children.props as { "aria-describedby"?: string })[
                  "aria-describedby"
                ],
                idsDoCampo,
              ),
            },
          )
        : children;

    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-1.5", className)}
        {...props}
      >
        <label
          htmlFor={htmlFor}
          className="font-display text-sm font-semibold text-[var(--text-primary)]"
        >
          {label}
        </label>
        {slot}
        {hint ? (
          <p
            id={`${htmlFor}-hint`}
            className="text-sm text-[var(--text-secondary)]"
          >
            {hint}
          </p>
        ) : null}
        {error ? (
          <p
            id={`${htmlFor}-error`}
            role="alert"
            className="text-sm font-semibold text-[var(--status-error-fg)]"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
