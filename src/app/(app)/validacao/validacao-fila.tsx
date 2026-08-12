"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
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
import { ClassificacaoAtual, rotuloAlvo } from "./classificacao-atual";
import { ConfidenceCard } from "@/components/ui/confidence-card";
import { CompareRow } from "@/components/ui/compare-row";
import { BatchBar } from "@/components/ui/batch-bar";
import { avaliarFriccao } from "@/lib/extraction/review-policy";

const rotuloMotivo: Record<ItemFila["motivo"][number], string> = {
  baixa_confianca: "Baixa confiança",
  inconsistente_historico: "Inconsistente com histórico",
};

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
    <ConfidenceCard
      confianca={item.confianca}
      inconsistenteComHistorico={item.inconsistenteComHistorico}
      como="li"
      id={`validacao-card-${item.evidenceId}`}
    >
      <Stack gap="sm">
        <span className="text-[var(--text-secondary)] font-mono text-xs font-semibold tracking-wide uppercase">
          Item {indice} de {total}
        </span>
        <h3 className="text-[var(--text-primary)] font-display text-lg font-bold">
          <Link href={`/pacientes/${item.patientId}`} className="hover:underline">
            {item.patientNome}
          </Link>
        </h3>
        <p className="text-[var(--text-primary)] text-base">{item.trecho || "(sem trecho registrado)"}</p>

        <Cluster gap="sm" className="items-center">
          <span className="text-[var(--text-secondary)] text-sm font-semibold">Classificação atual:</span>
          <ClassificacaoAtual classificacao={item.classificacaoAtual} />
        </Cluster>

        {item.inconsistenteComHistorico ? (
          <CompareRow
            leftTitle="Sugerido / Atual"
            leftContent={<ClassificacaoAtual classificacao={item.classificacaoAtual} />}
            rightTitle="Histórico Clínico"
            rightContent="Inconsistente com o histórico do paciente. Nenhuma ocorrência independente registrada anteriormente."
            className="mt-2"
          />
        ) : null}

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
    </ConfidenceCard>
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
  const [carregandoLote, setCarregandoLote] = useState(false);

  const pendentes = useMemo(
    () => itens.filter((i) => !resolvidos.has(i.evidenceId)),
    [itens, resolvidos],
  );

  const elegiveisLote = useMemo(() => {
    return pendentes.filter((item) => {
      const { podeLote } = avaliarFriccao({
        confianca: item.confianca,
        inconsistenteComHistorico: item.inconsistenteComHistorico,
      });
      return podeLote;
    });
  }, [pendentes]);

  const handleAprovarLote = async () => {
    setCarregandoLote(true);
    try {
      for (const item of elegiveisLote) {
        const fd = new FormData();
        fd.append("evidenceId", item.evidenceId);
        const r = await confirmarEvidenciaAction({}, fd);
        if (r.ok) {
          setResolvidos((prev) => {
            const next = new Set(prev);
            next.add(item.evidenceId);
            return next;
          });
        }
      }
    } finally {
      setCarregandoLote(false);
    }
  };

  if (pendentes.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Fila vazia">
        Nenhuma evidência pede validação no momento — clínica em dia.
      </Alert>
    );
  }

  return (
    <Stack gap="lg" className="relative">
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

      <BatchBar
        total={itens.length}
        resolvidos={resolvidos.size}
        elegiveisLote={elegiveisLote.length}
        onAprovarLote={handleAprovarLote}
        carregando={carregandoLote}
      />
    </Stack>
  );
}
