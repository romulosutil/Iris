"use client";

import { useActionState, useMemo, useState } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { surface } from "@/components/ui/primitives/surface";
import { cn } from "@/lib/cn";
import { responderQueryAction, type ValidacaoState } from "./actions";
import type { DuvidaAberta } from "./queries";
import type { AlvoValido } from "../validacao/alvos";
import { ClassificacaoAtual, rotuloAlvo } from "../validacao/classificacao-atual";

/**
 * Um item da lista = uma dúvida aberta pelo coordenador em `devolverComDuvida`,
 * respondida pelo terapeuta (ou coordenador cobrindo). A correção de alvo é
 * opcional — só é enviada (`novoAlvo`) se o terapeuta escolher um item no
 * picker; sem escolha, a resposta é só texto (mesmo padrão de
 * `responderQueryAction`, que trata `novoAlvo` vazio como "sem correção").
 * Ao responder com sucesso, o item some da lista local (otimista —
 * `revalidatePath` no wrapper do server action mantém a fonte de verdade em
 * sincronia no próximo carregamento da página).
 */
function DuvidaCard({
  item,
  indice,
  total,
  alvos,
  onRespondida,
}: {
  item: DuvidaAberta;
  indice: number;
  total: number;
  alvos: AlvoValido[];
  onRespondida: () => void;
}) {
  const [state, formAction, pendente] = useActionState<ValidacaoState, FormData>(
    async (prev, fd) => {
      const r = await responderQueryAction(prev, fd);
      if (r.ok) onRespondida();
      return r;
    },
    {},
  );

  const [corrigirAlvo, setCorrigirAlvo] = useState(false);
  const [alvoSelecionadoIdx, setAlvoSelecionadoIdx] = useState<string | undefined>(undefined);
  const novoAlvoJson =
    corrigirAlvo && alvoSelecionadoIdx !== undefined
      ? JSON.stringify(alvos[Number(alvoSelecionadoIdx)])
      : "";

  return (
    <Card
      como="li"
      titulo={`Sessão ${item.sessionNumero}`}
      className="p-5"
    >
      <Stack gap="sm">
        <span className="text-[var(--text-secondary)] text-sm font-semibold tracking-wide uppercase font-mono">
          Dúvida {indice} de {total}
        </span>
        <p className="text-[var(--text-primary)] text-base">{item.trecho || "(sem trecho registrado)"}</p>
        <Stack gap="sm">
          <span className="text-[var(--text-secondary)] text-sm">Classificação atual:</span>
          <ClassificacaoAtual classificacao={item.classificacaoAtual} />
        </Stack>
        <p className="text-[var(--text-primary)] text-base font-medium">{item.pergunta}</p>
      </Stack>

      <form action={formAction} className="mt-4">
        <Stack gap="md">
          <input type="hidden" name="evidenceQueryId" value={item.evidenceQueryId} />
          <input type="hidden" name="novoAlvo" value={novoAlvoJson} />

          <Field label="Resposta" htmlFor={`resposta-${item.evidenceQueryId}`}>
            <Input id={`resposta-${item.evidenceQueryId}`} name="respostaTexto" required />
          </Field>

          {alvos.length > 0 ? (
            <Stack gap="sm">
              <Button
                type="button"
                variante="terciaria"
                onClick={() => {
                  setCorrigirAlvo((v) => !v);
                  if (corrigirAlvo) setAlvoSelecionadoIdx(undefined);
                }}
              >
                {corrigirAlvo ? "Cancelar correção de alvo" : "Corrigir alvo ▾"}
              </Button>

              {corrigirAlvo ? (
                <Field label="Novo alvo" htmlFor={`novo-alvo-${item.evidenceQueryId}`}>
                  <Select value={alvoSelecionadoIdx} onValueChange={setAlvoSelecionadoIdx}>
                    <SelectTrigger id={`novo-alvo-${item.evidenceQueryId}`}>
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
              ) : null}
            </Stack>
          ) : null}

          {state.error ? <Alert severidade="erro">{state.error}</Alert> : null}

          <Cluster gap="sm">
            <Button
              type="submit"
              variante="primaria"
              disabled={pendente || (corrigirAlvo && alvoSelecionadoIdx === undefined)}
            >
              {pendente ? "Enviando…" : "Responder"}
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Card>
  );
}

/**
 * Lista de dúvidas abertas — presentacional + orquestração de resposta. Cada
 * card resolve uma dúvida de cada vez (sem ação em lote, mesmo padrão de
 * `ValidacaoFila`). Os alvos de correção chegam prontos do server
 * (`alvosPorPaciente`) — a lista pode cruzar pacientes, então o picker de
 * cada card usa só os alvos do paciente daquela evidência.
 */
export function DuvidasLista({
  itens,
  alvosPorPaciente,
}: {
  itens: DuvidaAberta[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
}) {
  const [respondidas, setRespondidas] = useState<Set<string>>(new Set());

  const pendentes = useMemo(
    () => itens.filter((i) => !respondidas.has(i.evidenceQueryId)),
    [itens, respondidas],
  );

  if (pendentes.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Nenhuma dúvida aberta">
        Não há dúvidas do coordenador pendentes de resposta no momento.
      </Alert>
    );
  }

  return (
    <Stack gap="md" como="ul">
      {pendentes.map((item, idx) => (
        <DuvidaCard
          key={item.evidenceQueryId}
          item={item}
          indice={idx + 1}
          total={pendentes.length}
          alvos={alvosPorPaciente[item.patientId] ?? []}
          onRespondida={() =>
            setRespondidas((prev) => new Set(prev).add(item.evidenceQueryId))
          }
        />
      ))}
    </Stack>
  );
}
