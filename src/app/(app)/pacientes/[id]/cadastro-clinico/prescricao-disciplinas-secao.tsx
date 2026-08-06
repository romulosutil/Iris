"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { DISCIPLINAS_PADRAO, formatarDisciplina } from "@/lib/disciplinas";
import { formatarHoras, HORAS_MAX_SEMANA, HORAS_PASSO } from "@/lib/horas";
import { ancoraCobertura } from "../equipe/cobertura";
import { ConfirmarSobrealocacaoDialog } from "./confirmar-sobrealocacao-dialog";
import {
  encerrarPrescricaoAction,
  prescreverDisciplinaAction,
} from "./prescricao-actions";
import type { PrescricaoState, PrescricaoVigente } from "./prescricao-logic";

/**
 * Prescrição de disciplinas e carga horária — o pilar mestre (#203, fatia 2).
 *
 * Duas coisas que esta seção carrega e não são decoração:
 *
 *   O handoff 1. Paciente recém-cadastrado cai aqui (redirect de
 *   `/pacientes/novo` para `#prescricao`) e, sem prescrição, não consegue montar
 *   equipe. O banner existe para que "cadastrei e não sei o que fazer agora"
 *   não seja um estado possível — nenhuma etapa da jornada termina sem dizer
 *   qual é a próxima.
 *
 *   Horas se leem como tempo. Todo número visível passa por `formatarHoras()`:
 *   `1h30`, nunca `1,5h`. O decimal é só armazenamento.
 */
export function PrescricaoDisciplinasSecao({
  patientId,
  prescricoes,
}: {
  patientId: string;
  prescricoes: PrescricaoVigente[];
}) {
  const jaPrescritas = new Set(prescricoes.map((p) => p.disciplina));
  const disponiveis = DISCIPLINAS_PADRAO.filter((d) => !jaPrescritas.has(d.id));
  const totalSemanal = prescricoes.reduce(
    (soma, p) => soma + Number(p.horasAlvoSemana),
    0,
  );

  return (
    <section id="prescricao" className="flex scroll-mt-24 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
          Prescrição de disciplinas e carga horária
        </h2>
        <p className="font-body text-xs text-[var(--text-secondary)]">
          A carga prescrita aqui é o teto da equipe: cada terapeuta vinculado
          consome horas desta prescrição. Protocolo estruturado (VB-MAPP,
          Denver) é encaixe opcional — quem faz terapia convencional prescreve
          horas do mesmo jeito.
        </p>
      </div>

      {prescricoes.length === 0 ? (
        <Alert
          severidade="info"
          titulo="Paciente cadastrado. Falta a prescrição."
          destacado
        >
          <div className="flex flex-col gap-2 text-sm leading-relaxed">
            <p>
              Prescreva as disciplinas e a carga horária semanal para poder
              montar a equipe. Sem prescrição, a tela de equipe não tem teto
              para validar as horas de cada terapeuta.
            </p>
          </div>
        </Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Prescrição vigente ({prescricoes.length})
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Total prescrito:{" "}
              <strong className="text-[var(--text-primary)]">
                {formatarHoras(totalSemanal)}
              </strong>{" "}
              por semana
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {prescricoes.map((p) => (
              <li key={p.id}>
                <LinhaPrescricao patientId={patientId} prescricao={p} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--text-secondary)]">
            Com a prescrição no lugar,{" "}
            <Link
              href={`/pacientes/${patientId}/equipe`}
              className="font-semibold underline underline-offset-4"
            >
              monte a equipe do paciente →
            </Link>
          </p>
        </div>
      )}

      <NovaPrescricaoForm
        patientId={patientId}
        disponiveis={disponiveis.map((d) => ({ id: d.id, nome: d.nome }))}
        temPrescricao={prescricoes.length > 0}
      />
    </section>
  );
}

/** Estado inicial compartilhado — `useActionState` exige objeto, não `undefined`. */
const VAZIO: PrescricaoState = {};

function NovaPrescricaoForm({
  patientId,
  disponiveis,
  temPrescricao,
}: {
  patientId: string;
  disponiveis: { id: string; nome: string }[];
  temPrescricao: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    PrescricaoState,
    FormData
  >(prescreverDisciplinaAction.bind(null, patientId), VAZIO);
  const { addToast } = useToast();

  useEffect(() => {
    if (!state.ok) return;
    addToast({
      titulo: "Prescrição salva",
      mensagem: "A disciplina já pode receber terapeutas na tela de equipe.",
      severidade: "sucesso",
    });
  }, [state.ok, addToast]);

  if (disponiveis.length === 0) {
    return (
      <p className="text-xs text-[var(--text-secondary)] italic">
        Todas as disciplinas do catálogo já estão prescritas para este paciente.
        Para mudar a carga de alguma, edite as horas na linha correspondente.
      </p>
    );
  }

  return (
    <>
      {/* Prescrever uma disciplina NOVA também pode sobrealocar: encerrar a
          prescrição mantém os vínculos já montados (§3.1), e prescrever de novo
          com carga menor que a alocada cai no mesmo §MV4 da linha vigente. Sem
          este diálogo aqui, o servidor devolvia a confirmação, este formulário
          não sabia lê-la, e o submit virava um clique sem efeito e sem aviso. */}
      <ConfirmarSobrealocacaoDialog
        confirmacao={state.confirmacao}
        formAction={formAction}
        isPending={isPending}
      />
      <form
        action={formAction}
        // `key` derivado da lista de disponíveis: prescrever uma disciplina a
        // remove da lista, o formulário remonta e volta vazio. Limpar por
        // `setState` dentro do efeito de sucesso seria render em cascata (e o
        // lint do repo barra) — remontar é o mesmo resultado sem o ciclo extra.
        key={disponiveis.map((d) => d.id).join("|")}
        className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/30 bg-[var(--surface-card)] p-4"
      >
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
          {temPrescricao
            ? "Prescrever outra disciplina"
            : "Prescrever a primeira disciplina"}
        </h3>
        {state.error ? (
          <Alert severidade="erro" destacado={!!state.bloqueioConta}>
            {state.error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Disciplina" htmlFor="disciplina">
            <Select name="disciplina" required>
              <SelectTrigger id="disciplina">
                <SelectValue placeholder="Selecione a disciplina" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Carga horária semanal"
            htmlFor="horasAlvoSemana"
            // O passo de 30min não é preferência de UI: é o CHECK
            // `patient_alvo_horas_passo` no banco. Dizer aqui evita que o
            // coordenador descubra a regra por mensagem de erro.
            hint={`De 30 em 30 minutos, até ${formatarHoras(HORAS_MAX_SEMANA)} por semana. Ex.: 1,5 = 1h30.`}
          >
            <Input
              id="horasAlvoSemana"
              name="horasAlvoSemana"
              type="number"
              min={HORAS_PASSO}
              max={HORAS_MAX_SEMANA}
              step={HORAS_PASSO}
              inputMode="decimal"
              required
            />
          </Field>
        </div>
        <div>
          <Button type="submit" isLoading={isPending} tamanho="sm">
            {isPending ? "Salvando prescrição..." : "Salvar prescrição"}
          </Button>
        </div>
      </form>
    </>
  );
}

function LinhaPrescricao({
  patientId,
  prescricao,
}: {
  patientId: string;
  prescricao: PrescricaoVigente;
}) {
  const [state, formAction, isPending] = useActionState<
    PrescricaoState,
    FormData
  >(prescreverDisciplinaAction.bind(null, patientId), VAZIO);
  const { addToast } = useToast();
  const router = useRouter();
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false);
  const horasAtuais = Number(prescricao.horasAlvoSemana);
  const confirmacao = state.confirmacao;

  useEffect(() => {
    if (!state.ok) return;
    addToast({
      titulo: "Prescrição atualizada",
      mensagem: `${formatarDisciplina(prescricao.disciplina)} passou a valer a partir de hoje. A prescrição anterior fica no histórico.`,
      severidade: "sucesso",
    });
    // §MV4: o trabalho não termina no salvar, termina no ajuste. Quem reduziu
    // abaixo do alocado é levado à barra da disciplina afetada — a tela onde o
    // excedente é resolvido —, não deixado nesta, onde não há o que fazer.
    if (state.disciplinaSobrealocada) {
      router.push(
        `/pacientes/${patientId}/equipe#${ancoraCobertura(state.disciplinaSobrealocada)}`,
      );
    }
  }, [
    state.ok,
    state.disciplinaSobrealocada,
    addToast,
    prescricao.disciplina,
    patientId,
    router,
  ]);

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-l-4 border-[var(--border-brutal)] border-l-[var(--action-primary)] bg-[var(--surface-card)] p-3.5 shadow-[var(--ds-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-display text-base font-bold text-[var(--text-primary)]">
            {formatarDisciplina(prescricao.disciplina)}
          </span>
          {/* O valor prescrito aparece como tempo mesmo fora do input: o
              coordenador confere "1h30", não "1.5". */}
          <Chip variante="info">{formatarHoras(horasAtuais)} / semana</Chip>
        </div>
        <Button
          type="button"
          risco="alto"
          tamanho="sm"
          variante="terciaria"
          onClick={() => setConfirmandoEncerrar(true)}
        >
          Encerrar prescrição
        </Button>
      </div>

      {state.error ? <Alert severidade="erro">{state.error}</Alert> : null}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="disciplina" value={prescricao.disciplina} />
        <Field
          label="Alterar carga semanal"
          htmlFor={`horas-${prescricao.id}`}
          hint={`Vigente desde ${new Date(prescricao.vigenciaInicio + "T00:00:00").toLocaleDateString("pt-BR")}`}
        >
          <Input
            id={`horas-${prescricao.id}`}
            name="horasAlvoSemana"
            type="number"
            min={HORAS_PASSO}
            max={HORAS_MAX_SEMANA}
            step={HORAS_PASSO}
            inputMode="decimal"
            defaultValue={horasAtuais}
            required
          />
        </Field>
        <Button
          type="submit"
          variante="secundaria"
          tamanho="sm"
          isLoading={isPending}
        >
          {isPending ? "Salvando..." : "Atualizar carga"}
        </Button>
      </form>

      <ConfirmarSobrealocacaoDialog
        confirmacao={confirmacao}
        formAction={formAction}
        isPending={isPending}
      />

      <Dialog
        open={confirmandoEncerrar}
        onOpenChange={(aberto) => {
          if (!aberto) setConfirmandoEncerrar(false);
        }}
      >
        <DialogContent>
          <DialogTitle>
            Encerrar a prescrição de {formatarDisciplina(prescricao.disciplina)}
            ?
          </DialogTitle>
          <DialogDescription>
            A disciplina deixa de ter carga prescrita e some do cálculo de
            cobertura da equipe. Os vínculos já montados nela continuam
            existindo — encerre-os na tela de equipe se for o caso. O histórico
            desta prescrição permanece para auditoria do convênio.
          </DialogDescription>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button
              type="button"
              variante="neutra"
              tamanho="sm"
              onClick={() => setConfirmandoEncerrar(false)}
            >
              Cancelar
            </Button>
            <form
              action={encerrarPrescricaoAction.bind(
                null,
                patientId,
                prescricao.disciplina,
              )}
            >
              <Button
                type="submit"
                risco="alto"
                tamanho="sm"
                onClick={() => setConfirmandoEncerrar(false)}
              >
                Encerrar prescrição
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
