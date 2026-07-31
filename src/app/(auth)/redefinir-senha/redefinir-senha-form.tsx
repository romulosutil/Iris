"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SENHA_MIN = 12;
const SENHA_MAX = 128;

/**
 * Mensagem única para QUALQUER falha da chamada a `resetPassword` — token
 * ausente, malformado, expirado, ou já consumido. Não distingue o motivo:
 * do lado do Better-Auth o endpoint `/reset-password` lança o mesmo
 * `INVALID_TOKEN` para "não existe" e para "expirou" (ver
 * `node_modules/better-auth/dist/api/routes/password.mjs`), e não há
 * ganho de usabilidade em tentar diferenciar — só risco de reabrir um
 * canal que a Task 7 fechou a duras penas em outra rota. Mesma classe de
 * regra: colapsar depois do núcleo, não enumerar casos conhecidos.
 */
const MENSAGEM_TOKEN_INVALIDO =
  "Este link de redefinição é inválido ou expirou. Solicite um novo link.";

type Props = { token?: string };

/**
 * Formulário de `/redefinir-senha`. Diferente de `/esqueci-senha`, esta
 * tela NÃO precisa de server action com throttle — o token já é um segredo
 * de posse (só quem recebeu o e-mail o tem), e o brief pede consumo direto
 * de `authClient.resetPassword` (mesmo padrão client-side de
 * `../login/page.tsx`, que chama `signIn.email` diretamente).
 *
 * Sem `token` (ausente/malformado na query), a página que monta este
 * componente (`./page.tsx`) já filtra e não o renderiza — ver lá.
 */
export function RedefinirSenhaForm({ token }: Props) {
  const router = useRouter();
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erro, setErro] = React.useState<string | undefined>(undefined);
  const [enviando, setEnviando] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!erro) return;
    const alerta = containerRef.current?.querySelector('[role="alert"]');
    if (alerta instanceof HTMLElement) {
      alerta.setAttribute("tabindex", "-1");
      alerta.focus();
    }
  }, [erro]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando || !token) return;

    // Validação de FORMATO da senha nova — não depende de conta/token, só
    // do que foi digitado, então pode ter mensagem própria (mesma regra de
    // `../cadastro/logic.ts`, `validarCadastro`).
    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa ter ao menos ${SENHA_MIN} caracteres.`);
      return;
    }
    if (senha.length > SENHA_MAX) {
      setErro(`A senha pode ter no máximo ${SENHA_MAX} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }

    setErro(undefined);
    setEnviando(true);

    void (async () => {
      const { error } = await authClient.resetPassword({
        newPassword: senha,
        token,
      });
      if (error) {
        // QUALQUER erro do reset (token inválido/expirado, ou falha do
        // Better-Auth) colapsa na mesma mensagem — ver docstring acima.
        setErro(MENSAGEM_TOKEN_INVALIDO);
        setEnviando(false);
        return;
      }
      router.push("/login?senhaAlterada=1");
    })();
  }

  return (
    <div ref={containerRef}>
      <Form onSubmit={handleSubmit} error={erro}>
        <Field
          label="Nova senha"
          htmlFor="senha"
          hint={`Mínimo ${SENHA_MIN} caracteres.`}
        >
          <Input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            minLength={SENHA_MIN}
            maxLength={SENHA_MAX}
            required
            disabled={!token}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-describedby="senha-hint"
            aria-invalid={erro ? true : undefined}
          />
        </Field>

        <Field label="Confirme a nova senha" htmlFor="confirmacao">
          <Input
            id="confirmacao"
            name="confirmacao"
            type="password"
            autoComplete="new-password"
            minLength={SENHA_MIN}
            maxLength={SENHA_MAX}
            required
            disabled={!token}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </Field>

        <Button type="submit" isLoading={enviando} disabled={!token}>
          {enviando ? "Redefinindo…" : "Redefinir senha"}
        </Button>
      </Form>

      <p className="text-[var(--text-secondary)] mt-4 text-center text-sm">
        <Link
          href="/login"
          className="text-[var(--text-primary)] font-semibold underline underline-offset-2"
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
