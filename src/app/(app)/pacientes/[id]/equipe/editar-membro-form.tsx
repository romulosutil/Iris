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
import { formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras, HORAS_PASSO, papelConsomeSaldo } from "@/lib/horas";
import { editarMembroEquipeAction } from "./actions";
import type { DisciplinaComSaldo } from "./adicionar-membro-form";

/**
 * Ajuste de disciplina, papel e horas de um vínculo VIGENTE (#203, fatia 4).
 *
 * Sem esta tela, corrigir 8h digitadas como 18h exigiria encerrar o vínculo e
 * criar outro — e encerrar CORTA O ACESSO ao prontuário na hora (D-A), além de
 * registrar no histórico uma saída que nunca aconteceu. Erro de digitação não
 * pode custar um evento clínico falso.
 *
 * O saldo mostrado já EXCLUI as horas atuais deste membro (o servidor faz o
 * mesmo com `ignorarMembershipId`): o coordenador precisa ver quanto cabe se
 * ele mudar, não quanto cabe além do que ele já ocupa.
 */
export function EditarMembroForm({
  patientId,
  membershipId,
  nomeProfissional,
  disciplinaAtual,
  papelAtual,
  horasAtuais,
  disciplinasPrescritas,
}: {
  patientId: string;
  membershipId: string;
  nomeProfissional: string;
  disciplinaAtual: string;
  papelAtual: string;
  horasAtuais: string | null;
  disciplinasPrescritas: DisciplinaComSaldo[];
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useActionState(
    editarMembroEquipeAction.bind(null, patientId, membershipId),
    {},
  );
  const [disciplina, setDisciplina] = useState(disciplinaAtual);
  const [papel, setPapel] = useState(papelAtual);

  // Disciplina do vínculo pode ter saído da prescrição (legado). Ela continua
  // listada para não sumir do formulário do próprio membro — mas sem saldo,
  // porque não há prescrição vigente contra a qual descontar.
  const opcoes: DisciplinaComSaldo[] = disciplinasPrescritas.some(
    (d) => d.disciplina === disciplinaAtual,
  )
    ? disciplinasPrescritas
    : [
        { disciplina: disciplinaAtual, horasAlvo: 0, horasRestantes: 0 },
        ...disciplinasPrescritas,
      ];
  const saldo = disciplinasPrescritas.find((d) => d.disciplina === disciplina);
  const exigeHoras = papelConsomeSaldo(papel);

  if (!aberto) {
    return (
      <Button
        variante="secundaria"
        tamanho="sm"
        type="button"
        onClick={() => setAberto(true)}
      >
        {horasAtuais === null && papelConsomeSaldo(papelAtual)
          ? "Definir horas"
          : "Ajustar alocação"}
      </Button>
    );
  }

  return (
    <div className="w-full border-t border-[var(--border-brutal)]/20 pt-3">
      <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">
        Ajustar alocação de {nomeProfissional}
      </p>
      <Form action={formAction} error={state.error}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Disciplina" htmlFor={`disciplina-${membershipId}`}>
            <Select
              name="disciplina"
              value={disciplina}
              onValueChange={setDisciplina}
            >
              <SelectTrigger id={`disciplina-${membershipId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((d) => (
                  <SelectItem key={d.disciplina} value={d.disciplina}>
                    {formatarDisciplina(d.disciplina)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Papel na equipe" htmlFor={`papel-${membershipId}`}>
            <Select name="papelNaEquipe" value={papel} onValueChange={setPapel}>
              <SelectTrigger id={`papel-${membershipId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terapeuta_referencia">
                  Terapeuta de referência
                </SelectItem>
                <SelectItem value="coordenador_referencia">
                  Coordenador de referência (sem carga)
                </SelectItem>
                <SelectItem value="substituto">
                  Aplicador / Substituto
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {exigeHoras ? (
            <Field
              label="Horas semanais"
              htmlFor={`horas-${membershipId}`}
              hint={
                saldo
                  ? `Cabem até ${formatarHoras(saldo.horasRestantes)} nesta disciplina, sem contar as horas atuais deste vínculo.`
                  : "Disciplina sem prescrição vigente — prescreva antes de alocar horas nela."
              }
            >
              <Input
                id={`horas-${membershipId}`}
                name="horasSemana"
                type="number"
                inputMode="decimal"
                required
                min={HORAS_PASSO}
                step={HORAS_PASSO}
                defaultValue={horasAtuais ?? ""}
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variante="secundaria"
            tamanho="sm"
            onClick={() => setAberto(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" tamanho="sm">
            Salvar alocação
          </Button>
        </div>
      </Form>
    </div>
  );
}
