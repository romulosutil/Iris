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
import { cn } from "@/lib/cn";
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

function formatarNumeroRegistro(valor: string, conselho: string): string {
  const limpo = valor.trim();
  if (conselho === "crp") {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length <= 2) return digitos;
    return `${digitos.slice(0, 2)}/${digitos.slice(2, 8)}`;
  }
  if (conselho === "crfa") {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length <= 4) return digitos;
    return `${digitos.slice(0, 4)}-${digitos.slice(4, 5)}`;
  }
  return limpo;
}

function obterPlaceholderRegistro(conselho: string): string {
  switch (conselho) {
    case "crp":
      return "06/12345";
    case "crm":
      return "123456";
    case "crefito":
      return "12345-F";
    case "crfa":
      return "1234-5";
    default:
      return "Número do registro";
  }
}

/**
 * Formulário de cadastro self-service com Onboarding em 2 Etapas (Multi-step).
 *
 * Etapa 1: Credenciais de Acesso (Nome, E-mail, Senha com validação 12+)
 * Etapa 2: Clínica & Registro Profissional (Nome da clínica, Conselho, Nº Registro, UF e Termos)
 *
 * Preserva o DOM de todos os inputs em ambas as etapas para submissão nativa de FormData,
 * com validação client-side prévia e navegação bidirecional intuitiva.
 */
export function CadastroForm() {
  const [estado, formAction, pending] = useActionState(
    cadastrar,
    ESTADO_INICIAL,
  );
  const [passo, setPasso] = React.useState<1 | 2>(1);
  const [campos, setCampos] = React.useState<Campos>(CAMPOS_INICIAIS);
  const [errosPasso1, setErrosPasso1] = React.useState<{
    nome?: string;
    email?: string;
    senha?: string;
  }>({});
  const containerRef = React.useRef<HTMLDivElement>(null);

  function set<K extends keyof Campos>(chave: K, valor: Campos[K]) {
    setCampos((c) => ({ ...c, [chave]: valor }));
  }

  const senhaTamanhoOk = campos.senha.length >= 12;

  function validarPasso1(): boolean {
    const novosErros: { nome?: string; email?: string; senha?: string } = {};

    if (!campos.nome.trim()) {
      novosErros.nome = "Informe seu nome completo.";
    }

    if (!campos.email.trim() || !campos.email.includes("@")) {
      novosErros.email = "Informe um e-mail válido.";
    }

    if (campos.senha.length < 12) {
      novosErros.senha = "A senha precisa ter ao menos 12 caracteres.";
    }

    setErrosPasso1(novosErros);

    if (Object.keys(novosErros).length > 0) {
      if (novosErros.nome) {
        document.getElementById("nome")?.focus();
      } else if (novosErros.email) {
        document.getElementById("email")?.focus();
      } else if (novosErros.senha) {
        document.getElementById("senha")?.focus();
      }
      return false;
    }

    return true;
  }

  function avancarParaPasso2() {
    if (validarPasso1()) {
      setPasso(2);
    }
  }

  function voltarParaPasso1() {
    setPasso(1);
  }

  // Voltar ao passo 1 quando o servidor recusa credenciais é *derivação* do
  // resultado da action, não sincronização com sistema externo: ajustar o estado
  // durante o render (padrão React de "ajustar estado quando a prop muda") em vez
  // de dentro do efeito evita a renderização em cascata que o `useEffect` causava.
  const [erroJaTratado, setErroJaTratado] = React.useState<string | null>(null);
  if (estado?.error && estado.error !== erroJaTratado) {
    setErroJaTratado(estado.error);
    const erro = estado.error.toLowerCase();
    if (
      erro.includes("senha") ||
      erro.includes("e-mail") ||
      erro.includes("email") ||
      erro.includes("nome completo")
    ) {
      setPasso(1);
    }
  }

  // O efeito fica só com o que é de fato externo: mover o foco para o alerta.
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
        {/* Header de Etapas & Navegação */}
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <nav
            aria-label="Progresso do cadastro"
            className="flex items-center gap-1.5 text-xs sm:gap-2 sm:text-sm"
          >
            <button
              type="button"
              onClick={() => setPasso(1)}
              className={cn(
                "focus-visible:outline-focus flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-left transition-colors",
                passo === 1
                  ? "font-display font-bold text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                  passo === 1
                    ? "border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] text-[var(--action-primary-fg)] shadow-[1px_1px_0_0_#000]"
                    : "border-2 border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
                )}
              >
                {passo === 2 ? "✓" : "1"}
              </span>
              <span>Credenciais</span>
            </button>

            <span className="text-[var(--text-secondary)] select-none">→</span>

            <button
              type="button"
              onClick={() => {
                if (validarPasso1()) setPasso(2);
              }}
              className={cn(
                "focus-visible:outline-focus flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-left transition-colors",
                passo === 2
                  ? "font-display font-bold text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                  passo === 2
                    ? "border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] text-[var(--action-primary-fg)] shadow-[1px_1px_0_0_#000]"
                    : "border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]",
                )}
              >
                2
              </span>
              <span>Clínica & Conselho</span>
            </button>
          </nav>
        </div>

        {/* ─── PASSO 1: Credenciais de Acesso ─── */}
        <div className={cn("flex flex-col gap-6", passo !== 1 && "hidden")}>
          <fieldset className="flex flex-col gap-4">
            <legend className="sr-only">Credenciais de Acesso</legend>

            <Field
              label="Nome completo"
              htmlFor="nome"
              error={errosPasso1.nome}
            >
              <Input
                id="nome"
                name="nome"
                type="text"
                autoComplete="name"
                placeholder="Paula Silva"
                required
                value={campos.nome}
                onChange={(e) => {
                  set("nome", e.target.value);
                  if (errosPasso1.nome) {
                    setErrosPasso1((er) => ({ ...er, nome: undefined }));
                  }
                }}
                aria-invalid={
                  errosPasso1.nome || estado?.error ? true : undefined
                }
              />
            </Field>

            <Field
              label="E-mail profissional"
              htmlFor="email"
              error={errosPasso1.email}
            >
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="paula@clinica.com.br"
                required
                value={campos.email}
                onChange={(e) => {
                  set("email", e.target.value);
                  if (errosPasso1.email) {
                    setErrosPasso1((er) => ({ ...er, email: undefined }));
                  }
                }}
                aria-invalid={
                  errosPasso1.email || estado?.error ? true : undefined
                }
              />
            </Field>

            <Field
              label="Senha"
              htmlFor="senha"
              error={errosPasso1.senha}
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
                onChange={(e) => {
                  set("senha", e.target.value);
                  if (errosPasso1.senha) {
                    setErrosPasso1((er) => ({ ...er, senha: undefined }));
                  }
                }}
                aria-invalid={
                  errosPasso1.senha || estado?.error ? true : undefined
                }
              />
            </Field>
          </fieldset>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={avancarParaPasso2}
              className="w-full"
            >
              Continuar
            </Button>

            <p className="text-center text-xs text-[var(--text-secondary)]">
              Já possui uma conta?{" "}
              <Link
                href="/login"
                className="font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--action-primary-fg)]"
              >
                Fazer login
              </Link>
            </p>
          </div>
        </div>

        {/* ─── PASSO 2: Clínica & Registro Profissional ─── */}
        <div className={cn("flex flex-col gap-6", passo !== 2 && "hidden")}>
          <fieldset className="flex flex-col gap-4">
            <legend className="sr-only">Clínica e Registro Profissional</legend>

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

            {/* Linha 1: Conselho e UF */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Conselho" htmlFor="conselho-trigger">
                <Select
                  name="conselho"
                  required
                  value={campos.conselho}
                  onValueChange={(v) => {
                    set("conselho", v);
                    if (campos.registroNumero) {
                      set(
                        "registroNumero",
                        formatarNumeroRegistro(campos.registroNumero, v),
                      );
                    }
                  }}
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

              <Field label="UF do conselho" htmlFor="registroUf-trigger">
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
                    <SelectValue placeholder="Selecione a UF" />
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

            {/* Linha 2: Nº do registro com máscara automática */}
            <Field label="Nº do registro" htmlFor="registroNumero">
              <Input
                id="registroNumero"
                name="registroNumero"
                type="text"
                autoComplete="off"
                placeholder={obterPlaceholderRegistro(campos.conselho)}
                required
                value={campos.registroNumero}
                onChange={(e) => {
                  const formatado = formatarNumeroRegistro(
                    e.target.value,
                    campos.conselho,
                  );
                  set("registroNumero", formatado);
                }}
                aria-invalid={estado?.error ? true : undefined}
              />
            </Field>
          </fieldset>

          <Checkbox
            name="termos"
            required
            label={
              <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Li e aceito os{" "}
                <Link
                  href="/termos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--action-primary-fg)]"
                >
                  Termos de Uso{" "}
                  <span className="sr-only">(abre em nova aba)</span>
                </Link>{" "}
                e a{" "}
                <Link
                  href="/privacidade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--action-primary-fg)]"
                >
                  Política de Privacidade{" "}
                  <span className="sr-only">(abre em nova aba)</span>
                </Link>{" "}
                do Iris.
              </span>
            }
          />

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variante="terciaria"
              onClick={voltarParaPasso1}
              className="sm:w-auto"
            >
              ← Voltar
            </Button>
            <Button type="submit" isLoading={pending} className="flex-1">
              {pending ? "Criando conta…" : "Criar conta no Iris"}
            </Button>
          </div>
        </div>
      </Form>
    </div>
  );
}
