"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { DISCIPLINAS_PADRAO } from "@/lib/disciplinas";
import { adicionarMembroEquipeAction } from "./actions";

export type ProfissionalOpcao = {
  id: string;
  nome: string;
  email: string;
  conselho?: string;
  registroNumero?: string;
  papel: string;
};

export function AdicionarMembroForm({
  patientId,
  profissionais,
  disciplinasPrescritas = [],
}: {
  patientId: string;
  profissionais: ProfissionalOpcao[];
  disciplinasPrescritas?: string[];
}) {
  const [state, formAction] = useActionState(
    adicionarMembroEquipeAction.bind(null, patientId),
    {},
  );

  const [disciplinaSelecionada, setDisciplinaSelecionada] = useState<string>(
    disciplinasPrescritas[0] ?? "ABA",
  );

  const supervisores = profissionais.filter((p) => p.papel === "coordenador");

  return (
    <div className="border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] rounded-[var(--radius-control)] p-6 shadow-[var(--ds-shadow-sm)]">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="font-display text-[var(--text-primary)] text-xl font-bold flex items-center gap-2">
          <span>➕</span> Adicionar Profissional à Equipe
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Vincule um terapeuta ou coordenador cadastrado na clínica para conceder acesso ao prontuário.
        </p>
      </div>

      <Form action={formAction} error={state.error}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Profissional da clínica" htmlFor="userId">
            <Select name="userId" required>
              <SelectTrigger id="userId">
                <SelectValue placeholder="Selecione o profissional" />
              </SelectTrigger>
              <SelectContent>
                {profissionais.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} ({p.papel === "coordenador" ? "Coordenador" : "Terapeuta"}
                    {p.conselho && p.registroNumero ? ` · ${p.conselho} ${p.registroNumero}` : ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Disciplina" htmlFor="disciplina">
            <Select
              name="disciplina"
              value={disciplinaSelecionada}
              onValueChange={setDisciplinaSelecionada}
            >
              <SelectTrigger id="disciplina">
                <SelectValue placeholder="Selecione a disciplina" />
              </SelectTrigger>
              <SelectContent>
                {DISCIPLINAS_PADRAO.map((d) => {
                  const ehPrescrita = disciplinasPrescritas.some(
                    (dp) => dp.toLowerCase() === d.id.toLowerCase(),
                  );
                  return (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome} {ehPrescrita ? "🎯 (Prescrita)" : ""}
                    </SelectItem>
                  );
                })}
                <SelectItem value="Outra">Outra (especificar)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {disciplinaSelecionada === "Outra" ? (
            <Field label="Especifique a disciplina" htmlFor="disciplinaCustom" className="md:col-span-2">
              <Input
                id="disciplinaCustom"
                name="disciplinaCustom"
                required
                placeholder="Ex.: Psicomotricidade"
              />
            </Field>
          ) : null}

          <Field label="Papel na equipe" htmlFor="papelNaEquipe">
            <Select name="papelNaEquipe" defaultValue="terapeuta_referencia">
              <SelectTrigger id="papelNaEquipe">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terapeuta_referencia">
                  Terapeuta de referência (Titular da disciplina)
                </SelectItem>
                <SelectItem value="coordenador_referencia">
                  Coordenador de referência (Supervisão geral do caso)
                </SelectItem>
                <SelectItem value="substituto">
                  Aplicador / Substituto
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Responsável técnico / Supervisor (opcional)" htmlFor="responsavelTecnicoId">
            <Select name="responsavelTecnicoId">
              <SelectTrigger id="responsavelTecnicoId">
                <SelectValue placeholder="Nenhum (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum (Sem supervisor direto)</SelectItem>
                {supervisores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} (Coordenador)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit">Vincular à equipe</Button>
        </div>
      </Form>
    </div>
  );
}
