"use client";

import { useActionState, useState } from "react";
import { Stack } from "@/components/ui/layout";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { DataRow } from "@/components/ui/data-row";
import { declararEPsiAction, type PerfilState } from "./actions";
import type { PerfilProfissional } from "./logic";

const CONSELHO_LEGIVEL: Record<string, string> = {
  crp: "CRP",
  crfa: "CRFa",
  crefito: "CREFITO",
  crm: "CRM",
  outro: "Outro conselho",
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function registroLegivel(p: PerfilProfissional): string {
  if (!p.conselho || !p.registroNumero) return "Não informado no cadastro";
  const sigla = CONSELHO_LEGIVEL[p.conselho] ?? p.conselho.toUpperCase();
  return p.registroUf
    ? `${sigla} ${p.registroUf} ${p.registroNumero}`
    : `${sigla} ${p.registroNumero}`;
}

export function PerfilForm({ perfil }: { perfil: PerfilProfissional }) {
  const [state, formAction] = useActionState<PerfilState, FormData>(
    declararEPsiAction,
    {},
  );
  const [declarado, setDeclarado] = useState(perfil.ePsiVerified);

  return (
    <Stack gap="lg">
      <DataRow
        title="Registro profissional"
        subtitle={registroLegivel(perfil)}
      />
      <p className="text-sm text-[var(--text-secondary)]">
        O registro no conselho é informado no cadastro e não é editável aqui.
      </p>

      {/* Resumo fiel da Res. CFP 009/2024: a norma exige cadastro ativo no
          e-Psi de quem atende ou supervisiona por TIC. Não inventar obrigação
          que a norma não cria, nem prometer verificação que o Iris não faz. */}
      <Alert severidade="info" titulo="Por que o Iris pergunta isto">
        <Stack gap="sm">
          <p>
            A Resolução CFP nº 009/2024 exige que o psicólogo que presta
            serviços ou realiza supervisões clínicas mediadas por tecnologia da
            informação e comunicação mantenha cadastro ativo na plataforma
            e-Psi, do Conselho Federal de Psicologia.
          </p>
          <p>
            O Iris <strong>não</strong> consulta a base do CFP e{" "}
            <strong>não</strong> verifica o número informado — esta é uma
            declaração de sua responsabilidade, guardada para dar respaldo em
            auditoria de fiscalização do CRP. Nenhuma função do Iris é liberada
            ou bloqueada por ela.
          </p>
        </Stack>
      </Alert>

      {perfil.ePsiVerified && perfil.ePsiDeclaradoEm ? (
        <Alert severidade="sucesso" titulo="Declaração registrada">
          Cadastro no e-Psi declarado em {formatarData(perfil.ePsiDeclaradoEm)}.
          Se o seu cadastro deixar de estar ativo, desmarque a declaração.
        </Alert>
      ) : null}

      <Form action={formAction} error={state.error}>
        {state.ok ? <Alert severidade="sucesso">Declaração salva.</Alert> : null}

        <Checkbox
          id="declarado"
          name="declarado"
          checked={declarado}
          onCheckedChange={(v) => setDeclarado(v === true)}
          label="Declaro que mantenho cadastro ativo na plataforma e-Psi do CFP, conforme a Resolução CFP nº 009/2024."
        />

        <Field label="Número do cadastro no e-Psi" htmlFor="numero">
          <Input
            id="numero"
            name="numero"
            required={declarado}
            maxLength={60}
            defaultValue={perfil.ePsiNumber ?? ""}
            placeholder="Como aparece no seu cadastro do e-Psi"
          />
        </Field>
        <p className="text-sm text-[var(--text-secondary)]">
          Desmarcar a declaração apaga o número deste cadastro. O histórico de
          quando você declarou permanece na trilha de auditoria da clínica.
        </p>

        <Button type="submit" variante="primaria">
          Salvar declaração
        </Button>
      </Form>
    </Stack>
  );
}
