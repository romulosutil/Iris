"use client";

import Link from "next/link";
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
import { formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras, HORAS_PASSO, papelConsomeSaldo } from "@/lib/horas";
import { adicionarMembroEquipeAction } from "./actions";

export type ProfissionalOpcao = {
  id: string;
  nome: string;
  email: string;
  conselho?: string;
  registroNumero?: string;
  papel: string;
};

/** Uma disciplina prescrita vigente com o saldo que ainda cabe nela. */
export type DisciplinaComSaldo = {
  disciplina: string;
  horasAlvo: number;
  horasRestantes: number;
};

/**
 * Vincular profissional consumindo a carga prescrita (#203, fatia 4).
 *
 * Três mudanças de desenho em relação à versão anterior, todas de jornada:
 *
 *   O dropdown lista SÓ disciplinas prescritas. A opção "Outra" com campo livre
 *   deixou de existir — no lugar entra o link `Prescrever outra disciplina →`.
 *   A prescrição vira o único ponto de entrada de disciplina nova, que é o que
 *   "pilar mestre" significa; manter o campo livre aqui recriaria vínculos que
 *   não somam em barra nenhuma.
 *
 *   O campo de horas SOME em `coordenador_referencia` (D-C). Gestão do caso não
 *   é carga clínica, e o banco recusa horas nesse papel por CHECK. Campo
 *   desabilitado sem explicação seria pior: ocupa espaço e não diz por quê.
 *
 *   O saldo restante aparece ao lado do campo, na notação de tempo do produto
 *   (`8h30`, nunca `8,5h`). Sem ele, o coordenador descobre o teto por recusa.
 */
export function AdicionarMembroForm({
  patientId,
  profissionais,
  disciplinasPrescritas,
}: {
  patientId: string;
  profissionais: ProfissionalOpcao[];
  disciplinasPrescritas: DisciplinaComSaldo[];
}) {
  const [state, formAction] = useActionState(
    adicionarMembroEquipeAction.bind(null, patientId),
    {},
  );

  const [disciplinaSelecionada, setDisciplinaSelecionada] = useState<string>(
    disciplinasPrescritas[0]?.disciplina ?? "",
  );
  const [papelSelecionado, setPapelSelecionado] = useState<string>(
    "terapeuta_referencia",
  );

  const supervisores = profissionais.filter((p) => p.papel === "coordenador");
  const saldo = disciplinasPrescritas.find(
    (d) => d.disciplina === disciplinaSelecionada,
  );
  const exigeHoras = papelConsomeSaldo(papelSelecionado);

  return (
    <div className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow-sm)]">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="font-display flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <span>➕</span> Adicionar Profissional à Equipe
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          A alocação consome a carga horária prescrita da disciplina. Vincular
          um profissional concede a ele acesso ao prontuário deste paciente.
        </p>
      </div>

      <Form action={formAction} error={state.error}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Profissional da clínica" htmlFor="userId">
            <Select name="userId" required>
              <SelectTrigger id="userId">
                <SelectValue placeholder="Selecione o profissional" />
              </SelectTrigger>
              <SelectContent>
                {profissionais.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} (
                    {p.papel === "coordenador" ? "Coordenador" : "Terapeuta"}
                    {p.conselho && p.registroNumero
                      ? ` · ${p.conselho} ${p.registroNumero}`
                      : ""}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Disciplina prescrita" htmlFor="disciplina">
            <Select
              name="disciplina"
              value={disciplinaSelecionada}
              onValueChange={setDisciplinaSelecionada}
              required
            >
              <SelectTrigger id="disciplina">
                <SelectValue placeholder="Selecione a disciplina" />
              </SelectTrigger>
              <SelectContent>
                {disciplinasPrescritas.map((d) => (
                  <SelectItem key={d.disciplina} value={d.disciplina}>
                    {formatarDisciplina(d.disciplina)} · restam{" "}
                    {formatarHoras(d.horasRestantes)} de{" "}
                    {formatarHoras(d.horasAlvo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Substitui a antiga opção "Outra" com campo livre: disciplina nova
                entra pela prescrição, nunca pela equipe. */}
            <Link
              href={`/pacientes/${patientId}/cadastro-clinico#prescricao`}
              className="mt-1 inline-block text-xs font-semibold text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              Prescrever outra disciplina →
            </Link>
          </Field>

          <Field label="Papel na equipe" htmlFor="papelNaEquipe">
            <Select
              name="papelNaEquipe"
              value={papelSelecionado}
              onValueChange={setPapelSelecionado}
            >
              <SelectTrigger id="papelNaEquipe">
                <SelectValue placeholder="Selecione o papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terapeuta_referencia">
                  Terapeuta de referência (titular da disciplina)
                </SelectItem>
                <SelectItem value="coordenador_referencia">
                  Coordenador de referência (gestão do caso, sem carga)
                </SelectItem>
                <SelectItem value="substituto">
                  Aplicador / Substituto (consome carga)
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {exigeHoras ? (
            <Field
              label="Horas semanais"
              htmlFor="horasSemana"
              hint={
                saldo
                  ? `Restam ${formatarHoras(saldo.horasRestantes)} de ${formatarHoras(saldo.horasAlvo)} prescritas em ${formatarDisciplina(saldo.disciplina)}.`
                  : undefined
              }
            >
              <Input
                id="horasSemana"
                name="horasSemana"
                type="number"
                inputMode="decimal"
                required
                min={HORAS_PASSO}
                step={HORAS_PASSO}
                placeholder="Ex.: 8 ou 8,5"
              />
            </Field>
          ) : (
            <div className="flex items-end">
              <p className="rounded-[var(--radius-xs)] border border-[var(--border-brutal)]/20 bg-[var(--surface-elevated)] p-2 text-xs text-[var(--text-secondary)]">
                Coordenador de referência é <strong>gestão do caso</strong> e
                não consome carga prescrita. Se este profissional também atende,
                adicione um segundo vínculo como terapeuta de referência.
              </p>
            </div>
          )}

          <Field
            label="Responsável técnico / Supervisor (opcional)"
            htmlFor="responsavelTecnicoId"
          >
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
