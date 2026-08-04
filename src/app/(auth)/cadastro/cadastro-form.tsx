"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
 * Formulário de cadastro self-service. `cadastrar` (Task 7) colapsa toda
 * saída não-erro em `redirect("/cadastro/verifique-email")` — este
 * componente nunca vê um estado de "sucesso", só o de erro (uma string
 * genérica) ou o `pending` do próprio envio.
 *
 * TODOS os campos são controlados (fix round 1, I2/G3): confirmado ao vivo
 * (pnpm dev + Playwright) que o formulário inteiro — inclusive Select e
 * Checkbox, não só os inputs nativos — reseta a cada roundtrip de erro da
 * server action. Controlar o estado aqui faz os valores sobreviverem.
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

  // I7: move o foco para o alerta de erro quando ele aparece — sem isto quem
  // usa teclado/leitor de tela fica preso onde estava, e quem enviou o
  // formulário de baixo da dobra não percebe a mudança.
  React.useEffect(() => {
    if (!estado?.error) return;
    const alerta = containerRef.current?.querySelector('[role="alert"]');
    if (alerta instanceof HTMLElement) {
      alerta.setAttribute("tabindex", "-1");
      alerta.focus();
    }
  }, [estado]);

  // I2/G3: React 19 dispara um evento "reset" real no <form> ao final de
  // toda action, mesmo quando ela só RETORNA (erro). `<Form onReset=…>`
  // (prop do React, entregue via listener delegado no document) roda TARDE
  // demais: o Select e o Checkbox do Radix registram
  // `form.addEventListener("reset", …)` diretamente no nó do <form> — um
  // listener nativo no próprio alvo, que dispara antes do listener
  // delegado do React alcançar o document. Resultado observado ao vivo:
  // mesmo com os campos controlados aqui, Conselho e Termos voltavam ao
  // padrão a cada erro (texto/e-mail/senha sobreviviam por serem re-commitados
  // pelo React logo em seguida; Select/Checkbox não, porque o handler do
  // Radix já tinha revertido o estado interno deles). Fix: interceptar o
  // evento na FASE DE CAPTURA num ancestral do form e cortar a propagação
  // antes que ele alcance o <form> — impede o listener do Radix de rodar e
  // cancela (via preventDefault) o reset nativo dos demais campos.
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
      <Form action={formAction} error={estado?.error}>
        <Field label="Nome completo" htmlFor="nome">
          <Input
            id="nome"
            name="nome"
            type="text"
            autoComplete="name"
            required
            value={campos.nome}
            onChange={(e) => set("nome", e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={campos.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Field label="Senha" htmlFor="senha" hint="Mínimo 12 caracteres.">
          <Input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={campos.senha}
            onChange={(e) => set("senha", e.target.value)}
            aria-describedby="senha-hint"
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Field label="Nome da clínica" htmlFor="nomeClinica">
          <Input
            id="nomeClinica"
            name="nomeClinica"
            type="text"
            autoComplete="organization"
            required
            value={campos.nomeClinica}
            onChange={(e) => set("nomeClinica", e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Field label="Conselho profissional" htmlFor="conselho-trigger">
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
              <SelectValue placeholder="Selecione seu conselho" />
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

        <Field label="Número do registro" htmlFor="registroNumero">
          <Input
            id="registroNumero"
            name="registroNumero"
            type="text"
            autoComplete="off"
            required
            value={campos.registroNumero}
            onChange={(e) => set("registroNumero", e.target.value)}
            aria-invalid={estado?.error ? true : undefined}
          />
        </Field>

        <Field label="UF do registro" htmlFor="registroUf-trigger">
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
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Política de Privacidade
              </Link>{" "}
              do Iris.
            </span>
          }
        />

        <Button type="submit" isLoading={pending}>
          {pending ? "Criando conta…" : "Criar conta"}
        </Button>
      </Form>
    </div>
  );
}
