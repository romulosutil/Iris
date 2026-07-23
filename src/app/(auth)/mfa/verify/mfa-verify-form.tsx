"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Desafio de 2º fator no login (Fase 6.2b). O login de um usuário com MFA ativo
 * NÃO cria sessão — devolve twoFactorRedirect e cai aqui. `verifyTotp` (ou
 * `verifyBackupCode`) é o que efetivamente cria a sessão e libera o app.
 */
export function MfaVerifyForm() {
  const router = useRouter();
  const [backup, setBackup] = React.useState(false);
  const [erro, setErro] = React.useState<string | undefined>();
  const [enviando, setEnviando] = React.useState(false);

  function verificar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setErro(undefined);
    setEnviando(true);
    void (async () => {
      const { error } = backup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setErro(
          backup
            ? "Código de backup inválido."
            : "Código incorreto. Confira o app autenticador.",
        );
        setEnviando(false);
        return;
      }
      router.push("/");
    })();
  }

  return (
    <Form onSubmit={verificar} error={erro}>
      <Field
        label={backup ? "Código de backup" : "Código do app (6 dígitos)"}
        htmlFor="code"
      >
        <Input
          id="code"
          name="code"
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
          aria-invalid={erro ? true : undefined}
        />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Verificando…" : "Verificar"}
      </Button>
      <Button
        type="button"
        variante="terciaria"
        onClick={() => {
          setBackup((v) => !v);
          setErro(undefined);
        }}
      >
        {backup ? "Usar código do app" : "Usar código de backup"}
      </Button>
    </Form>
  );
}
