"use client";

import * as React from "react";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { salvarDadosClinicaAction } from "./actions";
import { useCep, type EnderecoViaCep } from "./use-cep";
import type { DadosClinica } from "./logic";

/** 00000000 → 00000-000; parciais ficam como estão (só dígitos). */
function formatarCep(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5
    ? `${digitos.slice(0, 5)}-${digitos.slice(5)}`
    : digitos;
}

export function FormularioDadosClinica({
  dados,
  documentoTravado,
}: {
  dados: DadosClinica;
  documentoTravado: boolean;
}) {
  const [state, formAction] = useActionState<
    { ok?: true; error?: string },
    FormData
  >(salvarDadosClinicaAction, {});

  // Endereço controlado: o ViaCEP só preenche campo vazio, nunca sobrescreve
  // o que a pessoa já digitou.
  const [cep, setCep] = React.useState(formatarCep(dados.cep ?? ""));
  const [logradouro, setLogradouro] = React.useState(dados.logradouro ?? "");
  const [bairro, setBairro] = React.useState(dados.bairro ?? "");
  const [cidade, setCidade] = React.useState(dados.cidade ?? "");
  const [uf, setUf] = React.useState(dados.uf ?? "");

  const aoEncontrarEndereco = React.useCallback((endereco: EnderecoViaCep) => {
    setLogradouro((atual: string) =>
      atual.trim() ? atual : endereco.logradouro,
    );
    setBairro((atual: string) => (atual.trim() ? atual : endereco.bairro));
    setCidade((atual: string) => (atual.trim() ? atual : endereco.cidade));
    setUf((atual: string) => (atual.trim() ? atual : endereco.uf));
  }, []);

  const { buscarCep, buscando, aviso } = useCep(aoEncontrarEndereco);

  return (
    <Form action={formAction} error={state.error}>
      {state.ok ? (
        <Alert severidade="sucesso">Dados da clínica salvos.</Alert>
      ) : null}

      <Field label="Razão social" htmlFor="razaoSocial">
        <Input
          id="razaoSocial"
          name="razaoSocial"
          defaultValue={dados.razaoSocial ?? ""}
          autoComplete="organization"
        />
      </Field>

      <Field
        label="CPF/CNPJ"
        htmlFor="cpfCnpj"
        hint={
          documentoTravado
            ? "Documento travado: já existem cobranças emitidas com este CPF/CNPJ"
            : "CPF ou CNPJ do titular da cobrança, apenas números."
        }
      >
        <Input
          id="cpfCnpj"
          name="cpfCnpj"
          required={!documentoTravado}
          disabled={documentoTravado}
          defaultValue={dados.cpfCnpj ?? ""}
          inputMode="numeric"
        />
      </Field>
      {documentoTravado ? (
        // Input disabled não entra no FormData; reenvia o valor atual para o
        // servidor não interpretar ausência como "limpar o documento".
        <input type="hidden" name="cpfCnpj" value={dados.cpfCnpj ?? ""} />
      ) : null}

      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <legend className="font-display mb-1.5 p-0 text-sm font-semibold text-[var(--text-primary)]">
          Endereço
        </legend>

        <Field
          label="CEP"
          htmlFor="cep"
          hint={aviso ?? (buscando ? "Buscando endereço pelo CEP…" : undefined)}
        >
          <Input
            id="cep"
            name="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            value={cep}
            onChange={(e) => {
              const formatado = formatarCep(e.target.value);
              setCep(formatado);
              if (formatado.replace(/\D/g, "").length === 8) {
                void buscarCep(formatado);
              }
            }}
            onBlur={() => void buscarCep(cep)}
            placeholder="00000-000"
          />
        </Field>

        <Field label="Logradouro" htmlFor="logradouro">
          <Input
            id="logradouro"
            name="logradouro"
            autoComplete="address-line1"
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Field label="Número" htmlFor="numero" className="sm:w-40">
            <Input
              id="numero"
              name="numero"
              defaultValue={dados.numero ?? ""}
            />
          </Field>
          <Field label="Complemento" htmlFor="complemento" className="flex-1">
            <Input
              id="complemento"
              name="complemento"
              defaultValue={dados.complemento ?? ""}
              autoComplete="address-line2"
            />
          </Field>
        </div>

        <Field label="Bairro" htmlFor="bairro">
          <Input
            id="bairro"
            name="bairro"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Field label="Cidade" htmlFor="cidade" className="flex-1">
            <Input
              id="cidade"
              name="cidade"
              autoComplete="address-level2"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </Field>
          <Field label="UF" htmlFor="uf" className="sm:w-24">
            <Input
              id="uf"
              name="uf"
              maxLength={2}
              autoComplete="address-level1"
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              placeholder="SP"
            />
          </Field>
        </div>
      </fieldset>

      <Field
        label="E-mail financeiro"
        htmlFor="emailFinanceiro"
        hint="Para onde vão as notificações de cobrança e as notas fiscais."
      >
        <Input
          id="emailFinanceiro"
          name="emailFinanceiro"
          type="email"
          autoComplete="email"
          defaultValue={dados.emailFinanceiro ?? ""}
        />
      </Field>

      <Button type="submit" variante="primaria">
        Salvar dados da clínica
      </Button>
    </Form>
  );
}
