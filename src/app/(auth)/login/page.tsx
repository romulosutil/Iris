"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/auth/client";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";

/**
 * Tela de login (área pública). Email + senha via design system. No sucesso
 * redireciona para `/` (o shell protegido decide destino a partir da Task 11).
 * O handler é async, mas `Form.onSubmit` é síncrono: chamamos
 * `event.preventDefault()` no topo e a autenticação roda fire-and-forget,
 * controlando `erro`/`enviando` no estado local desta página.
 */
export default function LoginPage() {
  const router = useRouter();
  const [erro, setErro] = React.useState<string | undefined>(undefined);
  const [enviando, setEnviando] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;

    const dados = new FormData(event.currentTarget);
    const email = String(dados.get("email") ?? "");
    const password = String(dados.get("password") ?? "");

    setErro(undefined);
    setEnviando(true);

    void (async () => {
      const { data, error } = await signIn.email({ email, password });
      if (error) {
        setErro("E-mail ou senha inválidos.");
        setEnviando(false);
        return;
      }
      // Fase 6.2b: usuário com MFA ativo não recebe sessão aqui — o Better-Auth
      // devolve { twoFactorRedirect: true } e o 2º fator completa em /mfa/verify.
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        router.push("/mfa/verify");
        return;
      }
      router.push("/");
    })();
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Entrar
        </h1>
      </div>

      <div
        className={cn(
          "rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]",
        )}
      >
        <Form onSubmit={handleSubmit} error={erro}>
          <Field label="E-mail" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={erro ? true : undefined}
            />
          </Field>

          <Field label="Senha" htmlFor="password">
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
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </Form>
      </div>

      <p className="text-[var(--text-secondary)] text-center text-sm">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="text-[var(--text-primary)] font-semibold underline underline-offset-2"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
