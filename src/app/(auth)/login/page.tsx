"use client";
 
import * as React from "react";
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
      const { error } = await signIn.email({ email, password });
      if (error) {
        setErro("E-mail ou senha inválidos.");
        setEnviando(false);
        return;
      }
      router.push("/");
    })();
  }
 
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo altura={40} aria-label="Iris" />
        <h1 className="font-display text-[var(--text-primary)] text-2xl font-bold">
          Entrar
        </h1>
      </div>
 
      <div className={cn("bg-[var(--surface-card)] border-2 border-[var(--border-brutal)] rounded-[var(--radius-control)] shadow-[var(--ds-shadow)] p-6")}>
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
    </div>
  );
}
