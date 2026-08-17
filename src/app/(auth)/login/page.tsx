"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/auth/client";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { surface } from "@/components/ui/primitives/surface";
import { Pill } from "@/components/ui/primitives/pill";
import { ShieldIcon, LockIcon } from "@/components/ui/icon";

/**
 * Aviso pós-redefinição de senha (Task 9, `../redefinir-senha`). Isolado num
 * componente próprio, dentro de `<Suspense>`, porque `useSearchParams`
 * numa página client exige um boundary de suspense — sem isso o Next
 * recusa a build desta rota.
 */
function AvisoSenhaAlterada() {
  const params = useSearchParams();
  if (params.get("senhaAlterada") !== "1") return null;
  return (
    <Alert severidade="sucesso" titulo="Senha alterada">
      Sua senha foi redefinida. Entre com a nova senha.
    </Alert>
  );
}

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

      <React.Suspense fallback={null}>
        <AvisoSenhaAlterada />
      </React.Suspense>

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

        {/* Selos são afirmação factual medida — evidência em `docs/arquitetura/trust-indicators-login.md`. */}
        <div className="mt-6 flex flex-col gap-4 border-t-2 border-dashed border-[var(--border-brutal)] pt-6 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            <Pill
              variant="solid"
              colorScheme="neutral"
              size="sm"
              icon={<ShieldIcon size={12} />}
              data-testid="badge-lgpd"
            >
              Conformidade LGPD
            </Pill>
            <Pill
              variant="solid"
              colorScheme="neutral"
              size="sm"
              icon={<LockIcon size={12} />}
              data-testid="badge-tls"
            >
              Conexão Criptografada TLS 1.3
            </Pill>
          </div>
          <p className="mx-auto max-w-[240px] text-xs leading-relaxed text-[var(--text-secondary)]">
            Dados clínicos protegidos por criptografia e isolamento
            multi-tenant.
          </p>
        </div>
      </div>

      <p className="text-center text-sm text-[var(--text-secondary)]">
        <Link
          href="/esqueci-senha"
          className="font-semibold text-[var(--text-primary)] underline underline-offset-2"
        >
          Esqueceu sua senha?
        </Link>
      </p>

      <p className="text-center text-sm text-[var(--text-secondary)]">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="font-semibold text-[var(--text-primary)] underline underline-offset-2"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
