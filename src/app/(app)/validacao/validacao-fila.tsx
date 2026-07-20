"use client";

import { useActionState, useMemo, useState } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import {
  confirmarEvidenciaAction,
  invalidarEvidenciaAction,
  devolverComDuvidaAction,
  reclassificarEvidenciaAction,
  type ValidacaoState,
} from "./actions";
import type { ItemFila } from "./queries";
import type { AlvoValido } from "./alvos";

const rotuloMotivo: Record<ItemFila["motivo"][number], string> = {
  baixa_confianca: "Baixa confiança",
  inconsistente_historico: "Inconsistente com histórico",
};

function rotuloAlvo(alvo: AlvoValido): string {
  if (alvo.goal_id) return `Meta do paciente (${alvo.goal_id.slice(0, 8)})`;
  return `Protocolo ${alvo.protocol_id} · domínio ${alvo.dominio_id}`;
}

const rotuloNivelAjuda: Record<string, string> = {
  independente: "Independente",
  dica_gestual: "Dica gestual",
  dica_verbal: "Dica verbal",
  dica_fisica: "Dica física",
  modelagem: "Modelagem",
};

const rotuloPolaridade: Record<string, string> = {
  positivo: "Positivo",
  negativo: "Negativo",
};

/**
 * Renderiza `classificacaoAtual` de forma legível para o clínico — reusa a
 * mesma convenção de rótulo do picker de reclassificação (`rotuloAlvo`) para
 * o campo `alvo`, e traduz os demais campos conhecidos (`nivel_ajuda`,
 * `polaridade`, `funcao`) para pt-BR simples. MVP: sem JSON bruto na tela.
 */
function ClassificacaoAtual({ classificacao }: { classificacao: unknown }) {
  if (!classificacao || typeof classificacao !== "object") {
    return <span className="text-graphite text-sm">Classificação não disponível.</span>;
  }

  const c = classificacao as Record<string, unknown>;
  const alvo = c.alvo && typeof c.alvo === "object" ? (c.alvo as AlvoValido) : null;
  const nivelAjuda = typeof c.nivel_ajuda === "string" ? c.nivel_ajuda : null;
  const polaridade = typeof c.polaridade === "string" ? c.polaridade : null;
  const funcao = typeof c.funcao === "string" ? c.funcao : null;

  return (
    <Stack gap="sm">
      <p className="text-graphite text-sm">
        Alvo: <span className="text-ink font-medium">{alvo ? rotuloAlvo(alvo) : "—"}</span>
      </p>
      {nivelAjuda ? (
        <p className="text-graphite text-sm">
          Nível de ajuda:{" "}
          <span className="text-ink font-medium">
            {rotuloNivelAjuda[nivelAjuda] ?? nivelAjuda}
          </span>
        </p>
      ) : null}
      {polaridade ? (
        <p className="text-graphite text-sm">
          Polaridade:{" "}
          <span className="text-ink font-medium">{rotuloPolaridade[polaridade] ?? polaridade}</span>
        </p>
      ) : null}
      {funcao ? (
        <p className="text-graphite text-sm">
          Função: <span className="text-ink font-medium">{funcao}</span>
        </p>
      ) : null}
    </Stack>
  );
}

/**
 * Um item da fila = um card de ação unitária. Sem checkbox, sem "selecionar
 * todos" — cada evidência de baixa confiança/inconsistente exige olhar
 * humano individual (é o propósito da fila). Ao registrar a validação com
 * sucesso, o item some da lista local (otimista — `revalidatePath` no
 * wrapper do server action mantém a fonte de verdade em sincronia no próximo
 * carregamento da página).
 */
function ItemCard({
  item,
  indice,
  total,
  alvos,
  onResolvido,
}: {
  item: ItemFila;
  indice: number;
  total: number;
  alvos: AlvoValido[];
  onResolvido: () => void;
}) {
  const [confirmarState, confirmarFormAction, confirmarPendente] = useActionState<
    ValidacaoState,
    FormData
  >(async (prev, fd) => {
    const r = await confirmarEvidenciaAction(prev, fd);
    if (r.ok) onResolvido();
    return r;
  }, {});

  const [invalidarState, invalidarFormAction, invalidarPendente] = useActionState<
    ValidacaoState,
    FormData
  >(async (prev, fd) => {
    const r = await invalidarEvidenciaAction(prev, fd);
    if (r.ok) onResolvido();
    return r;
  }, {});

  const [devolverState, devolverFormAction, devolverPendente] = useActionState<
    ValidacaoState,
    FormData
  >(async (prev, fd) => {
    const r = await devolverComDuvidaAction(prev, fd);
    if (r.ok) onResolvido();
    return r;
  }, {});

  const [reclassificarState, reclassificarFormAction, reclassificarPendente] =
    useActionState<ValidacaoState, FormData>(async (prev, fd) => {
      const r = await reclassificarEvidenciaAction(prev, fd);
      if (r.ok) onResolvido();
      return r;
    }, {});

  const [reclassificarAberto, setReclassificarAberto] = useState(false);
  const [alvoSelecionadoIdx, setAlvoSelecionadoIdx] = useState<string | undefined>(
    undefined,
  );
  const novoAlvoJson =
    alvoSelecionadoIdx !== undefined ? JSON.stringify(alvos[Number(alvoSelecionadoIdx)]) : "";

  return (
    <Stack
      gap="md"
      como="li"
      className={cn("bg-bg-surface p-5", surface("solida"))}
    >
      <Stack gap="sm">
        <span className="text-graphite text-sm font-semibold tracking-wide uppercase">
          Item {indice} de {total}
        </span>
        <h3 className="text-ink text-lg font-semibold">
          {item.patientNome} · sessão {item.sessionNumero}
        </h3>
        <p className="text-ink text-base">{item.trecho || "(sem trecho registrado)"}</p>
        <Stack gap="sm">
          <span className="text-graphite text-sm">Classificação atual:</span>
          <ClassificacaoAtual classificacao={item.classificacaoAtual} />
        </Stack>
        {item.motivo.length > 0 ? (
          <ChipGroup rotulo="Motivo da validação">
            {item.motivo.map((m) => (
              <Chip key={m}>{rotuloMotivo[m]}</Chip>
            ))}
          </ChipGroup>
        ) : null}
      </Stack>

      <Cluster gap="sm">
        <form action={confirmarFormAction} className="contents">
          <input type="hidden" name="evidenceId" value={item.evidenceId} />
          <Button type="submit" variante="primaria" disabled={confirmarPendente}>
            {confirmarPendente ? "Confirmando…" : "Confirmar"}
          </Button>
        </form>

        <Dialog
          open={reclassificarAberto}
          onOpenChange={(aberto) => {
            setReclassificarAberto(aberto);
            if (!aberto) setAlvoSelecionadoIdx(undefined);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variante="secundaria">
              Reclassificar ▾
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Reclassificar evidência</DialogTitle>
            <DialogDescription>
              Esta ação é definitiva — confira o novo alvo antes de confirmar.
            </DialogDescription>
            <form action={reclassificarFormAction}>
              <Stack gap="md" className="mt-4">
                <input type="hidden" name="evidenceId" value={item.evidenceId} />
                <input type="hidden" name="novoAlvo" value={novoAlvoJson} />

                <Field label="Novo alvo" htmlFor={`novo-alvo-${item.evidenceId}`}>
                  <Select
                    value={alvoSelecionadoIdx}
                    onValueChange={setAlvoSelecionadoIdx}
                    name="novoAlvoIdx"
                  >
                    <SelectTrigger id={`novo-alvo-${item.evidenceId}`}>
                      <SelectValue placeholder="Selecione um alvo" />
                    </SelectTrigger>
                    <SelectContent>
                      {alvos.map((a, idx) => (
                        <SelectItem key={idx} value={String(idx)}>
                          {rotuloAlvo(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Justificativa" htmlFor={`justificativa-${item.evidenceId}`}>
                  <Input
                    id={`justificativa-${item.evidenceId}`}
                    name="justificativa"
                    required
                  />
                </Field>

                {reclassificarState.error ? (
                  <Alert severidade="erro">{reclassificarState.error}</Alert>
                ) : null}

                <Cluster gap="sm">
                  <Button
                    type="submit"
                    variante="primaria"
                    disabled={reclassificarPendente || alvoSelecionadoIdx === undefined}
                  >
                    {reclassificarPendente ? "Reclassificando…" : "Confirmar reclassificação"}
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variante="terciaria">
                      Cancelar
                    </Button>
                  </DialogClose>
                </Cluster>
              </Stack>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variante="secundaria">
              Devolver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Devolver com dúvida</DialogTitle>
            <DialogDescription>
              A pergunta fica registrada para o terapeuta responsável responder.
            </DialogDescription>
            <form action={devolverFormAction}>
              <Stack gap="md" className="mt-4">
                <input type="hidden" name="evidenceId" value={item.evidenceId} />
                <Field label="Pergunta" htmlFor={`pergunta-${item.evidenceId}`}>
                  <Input id={`pergunta-${item.evidenceId}`} name="pergunta" required />
                </Field>
                {devolverState.error ? (
                  <Alert severidade="erro">{devolverState.error}</Alert>
                ) : null}
                <Cluster gap="sm">
                  <Button type="submit" variante="primaria" disabled={devolverPendente}>
                    {devolverPendente ? "Devolvendo…" : "Devolver"}
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variante="terciaria">
                      Cancelar
                    </Button>
                  </DialogClose>
                </Cluster>
              </Stack>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variante="secundaria">
              Invalidar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Invalidar evidência</DialogTitle>
            <DialogDescription>
              A evidência deixa de contar para a classificação do paciente.
            </DialogDescription>
            <form action={invalidarFormAction}>
              <Stack gap="md" className="mt-4">
                <input type="hidden" name="evidenceId" value={item.evidenceId} />
                <Field label="Motivo" htmlFor={`motivo-${item.evidenceId}`}>
                  <Input id={`motivo-${item.evidenceId}`} name="motivo" required />
                </Field>
                {invalidarState.error ? (
                  <Alert severidade="erro">{invalidarState.error}</Alert>
                ) : null}
                <Cluster gap="sm">
                  <Button type="submit" variante="primaria" disabled={invalidarPendente}>
                    {invalidarPendente ? "Invalidando…" : "Invalidar"}
                  </Button>
                  <DialogClose asChild>
                    <Button type="button" variante="terciaria">
                      Cancelar
                    </Button>
                  </DialogClose>
                </Cluster>
              </Stack>
            </form>
          </DialogContent>
        </Dialog>
      </Cluster>

      {confirmarState.error ? <Alert severidade="erro">{confirmarState.error}</Alert> : null}
    </Stack>
  );
}

/**
 * Fila de validação — presentacional + orquestração das 4 ações. Sem ação em
 * lote (§ requisito): cada card resolve uma evidência de cada vez. Os alvos
 * de reclassificação chegam prontos do server (`alvosPorPaciente`) — a fila
 * pode cruzar pacientes, então o picker de cada card usa só os alvos do
 * paciente daquele item.
 */
export function ValidacaoFila({
  itens,
  alvosPorPaciente,
}: {
  itens: ItemFila[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
}) {
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());

  const pendentes = useMemo(
    () => itens.filter((i) => !resolvidos.has(i.evidenceId)),
    [itens, resolvidos],
  );

  if (pendentes.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Fila vazia">
        Nenhuma evidência pede validação no momento — clínica em dia.
      </Alert>
    );
  }

  return (
    <Stack gap="md" como="ul">
      {pendentes.map((item, idx) => (
        <ItemCard
          key={item.evidenceId}
          item={item}
          indice={idx + 1}
          total={pendentes.length}
          alvos={alvosPorPaciente[item.patientId] ?? []}
          onResolvido={() =>
            setResolvidos((prev) => new Set(prev).add(item.evidenceId))
          }
        />
      ))}
    </Stack>
  );
}
