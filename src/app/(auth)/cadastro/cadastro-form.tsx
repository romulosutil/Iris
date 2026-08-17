"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input, InputSenha } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTADOS_UF } from "@/lib/uf";
import { cadastrar, type EstadoCadastro } from "./actions";

const ESTADO_INICIAL: EstadoCadastro = {};

const CONSELHOS = [
  { valor: "crp", rotulo: "CRP" },
  { valor: "crfa", rotulo: "CRFa" },
  { valor: "crefito", rotulo: "CREFITO" },
  { valor: "crm", rotulo: "CRM" },
  { valor: "outro", rotulo: "Outro" },
] as const;

type Campos = {
  nome: string;
  email: string;
  senha: string;
  nomeClinica: string;
  conselho: string;
  registroNumero: string;
  registroUf: string;
};

const CAMPOS_INICIAIS: Campos = {
  nome: "",
  email: "",
  senha: "",
  nomeClinica: "",
  conselho: "",
  registroNumero: "",
  registroUf: "",
};

/**
 * Formulário de cadastro self-service otimizado com UX de Onboarding.
 * Divide a entrada em 2 seções visuais em grid (Credenciais e Perfil Profissional),
 * inclui olho de visibilidade de senha e grupo inline para Registro Profissional.
 */
export function CadastroForm() {
  const [estado, formAction, pending] = useActionState(
    cadastrar,
    ESTADO_INICIAL,
  );
  const [campos, setCampos] = React.useState<Campos>(CAMPOS_INICIAIS);
  const containerRef = React.useRef<HTMLDivElement>(null);

  function set<K extends keyof Campos>(chave: K, valor: Campos[K]) {
    setCampos((c) => ({ ...c, [chave]: valor }));
  }

  const senhaTamanhoOk = campos.senha.length >= 12;

  React.useEffect(() => {
    if (!estado?.error) return;
    const alerta = containerRef.current?.querySelector('[role="alert"]');
    if (alerta instanceof HTMLElement) {
      alerta.setAttribute("tabindex", "-1");
      alerta.focus();
    }
  }, [estado]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bloquear = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    container.addEventListener("reset", bloquear, true);
    return () => container.removeEventListener("reset", bloquear, true);
  }, []);

  return (
    <div ref={containerRef}>
      <Form
        action={formAction}
        error={estado?.error}
        className="flex flex-col gap-6"
      >
        {/* Seção 1: Credenciais de Acesso */}
        <fieldset className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6">
          <legend className="font-display mb-1 text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
            1. Credenciais de Acesso
          </legend>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nome completo" htmlFor="nome">
              <Input
                id="nome"
                name="nome"
                type="text"
                autoComplete="name"
                placeholder="Dra. Paula Silva"
                required
                value={campos.nome}
                onChange={(e) => set("nome", e.target.value)}
                aria-invalid={estado?.error ? true : undefined}
              />
            </Field>

            <Field label="E-mail profissional" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="paula@clinica.com.br"
                required
                value={campos.email}
                onChange={(e) => set("email", e.target.value)}
                aria-invalid={estado?.error ? true : undefined}
              />
            </Field>
          </div>

          <Field
            label="Senha"
            htmlFor="senha"
            hint={
              <span className="flex items-center gap-1.5 text-xs">
                <span
                  className={
                    senhaTamanhoOk
                      ? "font-semibold text-[var(--status-success-fg)]"
                      : "text-[var(--text-secondary)]"
                  }
                >
                  {senhaTamanhoOk
                    ? "✓ Mínimo 12 caracteres atendido"
                    : "Mínimo 12 caracteres."}
                </span>
              </span>
            }
          >
            <InputSenha
              id="senha"
              name="senha"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              placeholder="Digite sua senha segura"
              required
              value={campos.senha}
              onChange={(e) => set("senha", e.target.value)}
              aria-invalid={estado?.error ? true : undefined}
            />
          </Field>
        </fieldset>

        {/* Seção 2: Organização & Registro Profissional */}
        <fieldset className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6">
          <legend className="font-display mb-1 text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
            2. Clínica & Registro Profissional
          </legend>

          <Field label="Nome da clínica" htmlFor="nomeClinica">
            <Input
              id="nomeClinica"
              name="nomeClinica"
              type="text"
              autoComplete="organization"
              placeholder="Clínica Desenvolvimento Infantil"
              required
              value={campos.nomeClinica}
              onChange={(e) => set("nomeClinica", e.target.value)}
              aria-invalid={estado?.error ? true : undefined}
            />
          </Field>

          {/* Registro Profissional Inline em Grid de 3 Colunas */}
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <Field label="Conselho" htmlFor="conselho-trigger">
                <Select
                  name="conselho"
                  required
                  value={campos.conselho}
                  onValueChange={(v) => set("conselho", v)}
                >
                  <SelectTrigger
                    id="conselho-trigger"
                    aria-invalid={estado?.error ? true : undefined}
                  >
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSELHOS.map((c) => (
                      <SelectItem key={c.valor} value={c.valor}>
                        {c.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="md:col-span-5">
              <Field label="Nº do registro" htmlFor="registroNumero">
                <Input
                  id="registroNumero"
                  name="registroNumero"
                  type="text"
                  autoComplete="off"
                  placeholder="Ex: 06/12345"
                  required
                  value={campos.registroNumero}
                  onChange={(e) => set("registroNumero", e.target.value)}
                  aria-invalid={estado?.error ? true : undefined}
                />
              </Field>
            </div>

            <div className="md:col-span-3">
              <Field label="UF" htmlFor="registroUf-trigger">
                <Select
                  name="registroUf"
                  required
                  value={campos.registroUf}
                  onValueChange={(v) => set("registroUf", v)}
                >
                  <SelectTrigger
                    id="registroUf-trigger"
                    aria-invalid={estado?.error ? true : undefined}
                  >
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_UF.map((uf) => (
                      <SelectItem key={uf.sigla} value={uf.sigla}>
                        {uf.sigla} - {uf.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </fieldset>

        <Checkbox
          name="termos"
          required
          label={
            <span>
              Li e aceito os{" "}
              <Link
                href="/termos"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Termos de Uso{" "}
                <span className="sr-only">(abre em nova aba)</span>
              </Link>{" "}
              e a{" "}
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Política de Privacidade{" "}
                <span className="sr-only">(abre em nova aba)</span>
              </Link>{" "}
              do Iris.
            </span>
          }
        />

        <Button type="submit" isLoading={pending} className="w-full">
          {pending ? "Criando conta…" : "Criar conta no Iris"}
        </Button>
      </Form>
    </div>
  );
}
