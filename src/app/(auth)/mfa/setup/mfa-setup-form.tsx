"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * Cadastro de MFA (TOTP + códigos de backup) — Fase 6.2b. Fluxo do plugin
 * twoFactor: (1) confirma senha → `enable` devolve segredo + backups (ainda NÃO
 * ativa); (2) usuário cadastra no app autenticador e confirma um código →
 * `verifyTotp` ativa o 2º fator. Chama o Better-Auth client (idioma LoginPage:
 * useState + Form.onSubmit síncrono com fire-and-forget).
 */
export function MfaSetupForm() {
  const router = useRouter();
  const [etapa, setEtapa] = React.useState<"senha" | "ativar">("senha");
  const [erro, setErro] = React.useState<string | undefined>();
  const [enviando, setEnviando] = React.useState(false);
  const [segredo, setSegredo] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);

  function iniciar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setErro(undefined);
    setEnviando(true);
    void (async () => {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data) {
        setErro("Senha inválida ou não foi possível iniciar o cadastro.");
        setEnviando(false);
        return;
      }
      let secret = "";
      try {
        secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
      } catch {
        secret = "";
      }
      setSegredo(secret);
      setBackupCodes(data.backupCodes ?? []);
      setEtapa("ativar");
      setEnviando(false);
    })();
  }

  function ativar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setErro(undefined);
    setEnviando(true);
    void (async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setErro("Código incorreto. Confira o app autenticador e tente de novo.");
        setEnviando(false);
        return;
      }
      router.push("/");
    })();
  }

  if (etapa === "senha") {
    return (
      <Form onSubmit={iniciar} error={erro}>
        <p className="text-sm text-[var(--text-secondary)]">
          Papéis clínicos precisam de um segundo fator (MFA). Confirme sua senha
          para gerar o segredo.
        </p>
        <Field label="Senha atual" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={erro ? true : undefined}
          />
        </Field>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Gerando…" : "Gerar segredo"}
        </Button>
      </Form>
    );
  }

  return (
    <Form onSubmit={ativar} error={erro}>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Cadastre esta chave no seu app autenticador (Google Authenticator,
          Authy…) por entrada manual:
        </p>
        <code className="block rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-muted)] p-3 font-mono text-sm break-all">
          {segredo || "—"}
        </code>
      </div>

      <Alert
        severidade="sucesso"
        titulo="Guarde seus códigos de backup agora"
        destacado
      >
        <p className="mb-2 text-sm">
          Mostrados uma única vez. Use-os para entrar se perder o app
          autenticador.
        </p>
        <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
          {backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Alert>

      <Field label="Código do app (6 dígitos)" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          aria-invalid={erro ? true : undefined}
        />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Ativando…" : "Ativar MFA"}
      </Button>
    </Form>
  );
}
