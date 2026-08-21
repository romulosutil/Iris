"use client";

import { useActionState, useMemo, useState } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { SupervisaoCard } from "@/components/ui/supervisao-card";
import type { MenuAcaoItem } from "@/components/ui/primitives/menu-acoes";
import {
  reconhecerAlertaAction,
  resolverAlertaAction,
  descartarAlertaAction,
  type SupervisaoState,
} from "./actions";
import type { ItemSupervisao } from "./queries";

/** Campos de identidade do alerta repetidos em cada formulário de mutação. */
function CamposIdentidade({ item }: { item: ItemSupervisao }) {
  return (
    <>
      <input type="hidden" name="chaveNatural" value={item.chaveNatural} />
      <input type="hidden" name="tipo" value={item.tipo} />
      <input type="hidden" name="patientId" value={item.patientId} />
      <input type="hidden" name="goalId" value={item.goalId || ""} />
      <input type="hidden" name="protocolId" value={item.protocolId || ""} />
      <input
        type="hidden"
        name="detalhe"
        value={JSON.stringify(item.detalhe)}
      />
    </>
  );
}

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
  const [reconhecerState, reconhecerFormAction, reconhecerPendente] =
    useActionState<SupervisaoState, FormData>(async (prev, fd) => {
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

  const [descartarState, descartarFormAction, descartarPendente] =
    useActionState<SupervisaoState, FormData>(async (prev, fd) => {
      const r = await descartarAlertaAction(prev, fd);
      if (r.ok) onResolvido();
      return r;
    }, {});

  const [resolverAberto, setResolverAberto] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);

  const hasError =
    reconhecerState.error || resolverState.error || descartarState.error;
  const errorMsg =
    reconhecerState.error || resolverState.error || descartarState.error;

  const renderedError =
    errorMsg === "CONCURRENCY_ERROR"
      ? "Este alerta mudou. Recarregue a página."
      : errorMsg;

  // Enquanto o alerta é novo, a decisão pedida é reconhecê-lo; depois disso
  // (ou quando o sinal já cessou), a decisão pedida é resolvê-lo.
  const podeReconhecer = item.estado === "novo" && item.sinalPresente;

  const acoesSecundarias = useMemo<MenuAcaoItem[]>(() => {
    const itens: MenuAcaoItem[] = [];
    if (podeReconhecer) {
      itens.push({
        id: "resolver",
        rotulo: "Resolver alerta…",
        aoSelecionar: () => setResolverAberto(true),
      });
    }
    if (item.sinalPresente) {
      itens.push({
        id: "descartar",
        rotulo: "Descartar alerta…",
        tom: "destrutivo",
        aoSelecionar: () => setDescartarAberto(true),
      });
    }
    return itens;
  }, [podeReconhecer, item.sinalPresente]);

  const acaoPrimaria = podeReconhecer ? (
    <form action={reconhecerFormAction} className="contents">
      <CamposIdentidade item={item} />
      <Button type="submit" variante="primaria" disabled={reconhecerPendente}>
        {reconhecerPendente ? "Reconhecendo…" : "Reconhecer"}
      </Button>
    </form>
  ) : (
    <Button
      type="button"
      variante="primaria"
      onClick={() => setResolverAberto(true)}
    >
      Resolver
    </Button>
  );

  return (
    <>
      <SupervisaoCard
        id={`item-card-${item.chaveNatural}`}
        indice={indice}
        total={total}
        patientId={item.patientId}
        patientNome={item.patientNome}
        tipo={item.tipo}
        goalNome={item.goalNome}
        protocolNome={item.protocolNome}
        detalhe={item.detalhe}
        sinalPresente={item.sinalPresente}
        estado={item.estado}
        acaoPrimaria={acaoPrimaria}
        acoesSecundarias={acoesSecundarias}
        erro={
          hasError ? <Alert severidade="erro">{renderedError}</Alert> : null
        }
      />

      {/*
        Os modais ficam FORA do card: o menu de reticências desmonta o painel ao
        selecionar o item, e um Dialog montado dentro dele nunca chegaria a abrir.
      */}
      <Dialog open={resolverAberto} onOpenChange={setResolverAberto}>
        <DialogContent>
          <DialogTitle>Resolver alerta</DialogTitle>
          <DialogDescription>
            Esta ação registra que a condição foi tratada e suprime futuros
            alertas.
          </DialogDescription>
          <form action={resolverFormAction}>
            <Stack gap="md" className="mt-4">
              <CamposIdentidade item={item} />

              <Field
                label="Nota de resolução"
                htmlFor={`nota-${item.chaveNatural}`}
              >
                <Input id={`nota-${item.chaveNatural}`} name="nota" required />
              </Field>

              {resolverState.error ? (
                <Alert severidade="erro">
                  {resolverState.error === "CONCURRENCY_ERROR"
                    ? "Este alerta mudou. Recarregue a página."
                    : resolverState.error}
                </Alert>
              ) : null}

              <Cluster gap="sm">
                <Button
                  type="submit"
                  variante="primaria"
                  disabled={resolverPendente}
                >
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

      <Dialog open={descartarAberto} onOpenChange={setDescartarAberto}>
        <DialogContent>
          <DialogTitle>Descartar alerta</DialogTitle>
          <DialogDescription>
            Esta ação descarta a notificação e suprime novos alertas para esta
            condição.
          </DialogDescription>
          <form action={descartarFormAction}>
            <Stack gap="md" className="mt-4">
              <CamposIdentidade item={item} />

              <Field
                label="Motivo do descarte"
                htmlFor={`motivo-${item.chaveNatural}`}
              >
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
                <Button
                  type="submit"
                  variante="primaria"
                  disabled={descartarPendente}
                >
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
    </>
  );
}

export function SupervisaoFila({ itens }: { itens: ItemSupervisao[] }) {
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
