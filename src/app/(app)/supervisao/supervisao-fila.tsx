"use client";

import { useActionState, useState } from "react";
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
import { surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import {
  reconhecerAlertaAction,
  resolverAlertaAction,
  descartarAlertaAction,
  type SupervisaoState,
} from "./actions";
import type { ItemSupervisao } from "./queries";

const rotuloTipo = {
  estagnacao: "Estagnação",
  regressao: "Regressão",
  faltas_excessivas: "Faltas",
};

function ItemCard({
  item,
  indice,
  total,
  onResolvido,
}: {
  item: ItemSupervisao;
  indice: number;
  total: number;
  onResolvido: () => void;
}) {
  const [reconhecerState, reconhecerFormAction, reconhecerPendente] = useActionState<
    SupervisaoState,
    FormData
  >(async (prev, fd) => {
    const r = await reconhecerAlertaAction(prev, fd);
    if (r.ok) onResolvido();
    return r;
  }, {});

  const [resolverState, resolverFormAction, resolverPendente] = useActionState<
    SupervisaoState,
    FormData
  >(async (prev, fd) => {
    const r = await resolverAlertaAction(prev, fd);
    if (r.ok) onResolvido();
    return r;
  }, {});

  const [descartarState, descartarFormAction, descartarPendente] = useActionState<
    SupervisaoState,
    FormData
  >(async (prev, fd) => {
    const r = await descartarAlertaAction(prev, fd);
    if (r.ok) onResolvido();
    return r;
  }, {});

  const [resolverAberto, setResolverAberto] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);

  const formatDetalhe = () => {
    if (item.tipo === "faltas_excessivas") {
      const d = item.detalhe as { faltas: number; janelaSemanas: number; limiar: number };
      return `${d.faltas} faltas do paciente nas últimas ${d.janelaSemanas} semanas (limiar ${d.limiar})`;
    } else {
      const d = item.detalhe as { metrica: string; tipoEstrutura: string; sessionNumero: number };
      const rot = item.tipo === "estagnacao" ? "estagnação" : "regressão";
      return `${item.goalNome} — ${item.protocolNome}: ${rot} (métrica ${d.metrica}, sessão ${d.sessionNumero})`;
    }
  };

  const hasError = reconhecerState.error || resolverState.error || descartarState.error;
  const errorMsg = reconhecerState.error || resolverState.error || descartarState.error;

  const renderedError = errorMsg === "CONCURRENCY_ERROR" 
    ? "Este alerta mudou. Recarregue a página." 
    : errorMsg;

  return (
    <Stack
      gap="md"
      como="li"
      className={cn("bg-bg-surface p-5", surface("solida"))}
      id={`item-card-${item.chaveNatural}`}
    >
      <Stack gap="sm">
        <span className="text-graphite text-sm font-semibold tracking-wide uppercase">
          Item {indice} de {total}
        </span>
        <h3 className="text-ink text-lg font-semibold">
          <Link href={`/pacientes/${item.patientId}`} className="hover:underline">
            {item.patientNome}
          </Link>
        </h3>
        <p className="text-ink text-base">{formatDetalhe()}</p>

        <ChipGroup rotulo="Status e Tipo do Alerta">
          <Chip>{rotuloTipo[item.tipo]}</Chip>
          {item.sinalPresente === false ? (
            <Chip className="border-red-600 bg-bg-surface text-red-600">sinal cessou</Chip>
          ) : null}
          {item.estado === "reconhecido" ? (
            <Chip>Reconhecido</Chip>
          ) : null}
        </ChipGroup>
      </Stack>

      <Cluster gap="sm">
        {item.estado === "novo" && item.sinalPresente && (
          <form action={reconhecerFormAction} className="contents">
            <input type="hidden" name="chaveNatural" value={item.chaveNatural} />
            <input type="hidden" name="tipo" value={item.tipo} />
            <input type="hidden" name="patientId" value={item.patientId} />
            <input type="hidden" name="goalId" value={item.goalId || ""} />
            <input type="hidden" name="protocolId" value={item.protocolId || ""} />
            <input type="hidden" name="detalhe" value={JSON.stringify(item.detalhe)} />
            <Button type="submit" variante="primaria" disabled={reconhecerPendente}>
              {reconhecerPendente ? "Reconhecendo…" : "Reconhecer"}
            </Button>
          </form>
        )}

        <Dialog open={resolverAberto} onOpenChange={setResolverAberto}>
          <DialogTrigger asChild>
            <Button type="button" variante="secundaria">
              Resolver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Resolver alerta</DialogTitle>
            <DialogDescription>
              Esta ação registra que a condição foi tratada e suprime futuros alertas.
            </DialogDescription>
            <form action={resolverFormAction}>
              <Stack gap="md" className="mt-4">
                <input type="hidden" name="chaveNatural" value={item.chaveNatural} />
                <input type="hidden" name="tipo" value={item.tipo} />
                <input type="hidden" name="patientId" value={item.patientId} />
                <input type="hidden" name="goalId" value={item.goalId || ""} />
                <input type="hidden" name="protocolId" value={item.protocolId || ""} />
                <input type="hidden" name="detalhe" value={JSON.stringify(item.detalhe)} />

                <Field label="Nota de resolução" htmlFor={`nota-${item.chaveNatural}`}>
                  <Input
                    id={`nota-${item.chaveNatural}`}
                    name="nota"
                    required
                  />
                </Field>

                {resolverState.error ? (
                  <Alert severidade="erro">
                    {resolverState.error === "CONCURRENCY_ERROR" 
                      ? "Este alerta mudou. Recarregue a página." 
                      : resolverState.error}
                  </Alert>
                ) : null}

                <Cluster gap="sm">
                  <Button type="submit" variante="primaria" disabled={resolverPendente}>
                    {resolverPendente ? "Resolvendo…" : "Confirmar resolução"}
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

        {item.sinalPresente && (
          <Dialog open={descartarAberto} onOpenChange={setDescartarAberto}>
            <DialogTrigger asChild>
              <Button type="button" variante="secundaria">
                Descartar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Descartar alerta</DialogTitle>
              <DialogDescription>
                Esta ação descarta a notificação e suprime novos alertas para esta condição.
              </DialogDescription>
              <form action={descartarFormAction}>
                <Stack gap="md" className="mt-4">
                  <input type="hidden" name="chaveNatural" value={item.chaveNatural} />
                  <input type="hidden" name="tipo" value={item.tipo} />
                  <input type="hidden" name="patientId" value={item.patientId} />
                  <input type="hidden" name="goalId" value={item.goalId || ""} />
                  <input type="hidden" name="protocolId" value={item.protocolId || ""} />
                  <input type="hidden" name="detalhe" value={JSON.stringify(item.detalhe)} />

                  <Field label="Motivo do descarte" htmlFor={`motivo-${item.chaveNatural}`}>
                    <Input
                      id={`motivo-${item.chaveNatural}`}
                      name="motivo"
                      required
                    />
                  </Field>

                  {descartarState.error ? (
                    <Alert severidade="erro">
                      {descartarState.error === "CONCURRENCY_ERROR" 
                        ? "Este alerta mudou. Recarregue a página." 
                        : descartarState.error}
                    </Alert>
                  ) : null}

                  <Cluster gap="sm">
                    <Button type="submit" variante="primaria" disabled={descartarPendente}>
                      {descartarPendente ? "Descartando…" : "Confirmar descarte"}
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
        )}
      </Cluster>

      {hasError && errorMsg !== "CONCURRENCY_ERROR" ? (
        <Alert severidade="erro">{renderedError}</Alert>
      ) : null}
      {hasError && errorMsg === "CONCURRENCY_ERROR" ? (
        <Alert severidade="erro">{renderedError}</Alert>
      ) : null}
    </Stack>
  );
}

export function SupervisaoFila({
  itens,
}: {
  itens: ItemSupervisao[];
}) {
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());

  const pendentes = itens.filter((i) => !resolvidos.has(i.chaveNatural));

  if (pendentes.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Nada a supervisionar">
        Nenhum alerta pendente no momento — clínica em dia.
      </Alert>
    );
  }

  return (
    <Stack gap="md" como="ul">
      {pendentes.map((item, idx) => (
        <ItemCard
          key={item.chaveNatural}
          item={item}
          indice={idx + 1}
          total={pendentes.length}
          onResolvido={() =>
            setResolvidos((prev) => new Set(prev).add(item.chaveNatural))
          }
        />
      ))}
    </Stack>
  );
}
