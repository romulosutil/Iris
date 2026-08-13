"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
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
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewClinicalIllustration } from "@/components/ui/illustrations";
import { ConfidenceCard } from "@/components/ui/patterns/confidence-card";
import { CompareRow } from "@/components/ui/patterns/compare-row";
import { BatchBar } from "@/components/ui/patterns/batch-bar";
import {
  confirmarEvidenciaAction,
  invalidarEvidenciaAction,
  devolverComDuvidaAction,
  reclassificarEvidenciaAction,
  aprovarLoteAction,
  type ValidacaoState,
} from "./actions";
import type { ItemFila } from "./queries";
import type { AlvoValido } from "./alvos";
import { ClassificacaoAtual, rotuloAlvo } from "./classificacao-atual";

const rotuloMotivo: Record<ItemFila["motivo"][number], string> = {
  baixa_confianca: "Baixa confiança",
  inconsistente_historico: "Inconsistente com histórico",
};

/** Mapeia a fricção do domínio (masc.) para o contrato do ConfidenceCard (fem.). */
const friccaoParaCard: Record<ItemFila["nivelFriccao"], "baixa" | "media" | "alta"> = {
  baixo: "baixa",
  medio: "media",
  alto: "alta",
};

/** Faixa de confiança → valor exibível (aproximação da faixa, não precisão falsa). */
const confiancaParaNumero: Record<ItemFila["confianca"], number> = {
  alta: 90,
  media: 60,
  baixa: 30,
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

/**
 * Um item da fila = um ConfidenceCard do design system + diálogos de ação.
 * Aprovar dispara o action direto; Editar abre o diálogo de reclassificação;
 * Descartar abre o diálogo de invalidação. "Ver detalhes" expande a
 * classificação atual e, quando o item é inconsistente com o histórico, a
 * comparação lado a lado (CompareRow). Ao registrar a validação com sucesso,
 * o item some da lista local (otimista — `revalidatePath` no wrapper do
 * server action mantém a fonte de verdade em sincronia).
 */
function ItemCard({
  item,
  indice,
  total,
  alvos,
  selecionado,
  onToggleSelecao,
  onResolvido,
}: {
  item: ItemFila;
  indice: number;
  total: number;
  alvos: AlvoValido[];
  selecionado: boolean;
  onToggleSelecao: (evidenceId: string, marcado: boolean) => void;
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

  const [, startTransition] = useTransition();
  const [reclassificarAberto, setReclassificarAberto] = useState(false);
  const [invalidarAberto, setInvalidarAberto] = useState(false);
  const [alvoSelecionadoIdx, setAlvoSelecionadoIdx] = useState<string | undefined>(
    undefined,
  );
  const novoAlvoJson =
    alvoSelecionadoIdx !== undefined ? JSON.stringify(alvos[Number(alvoSelecionadoIdx)]) : "";

  const pendente =
    confirmarPendente || invalidarPendente || devolverPendente || reclassificarPendente;

  function aprovar() {
    const fd = new FormData();
    fd.set("evidenceId", item.evidenceId);
    startTransition(() => confirmarFormAction(fd));
  }

  return (
    <Stack gap="sm" como="li" id={`validacao-card-${item.evidenceId}`}>
      <span className="text-[var(--text-secondary)] font-mono text-xs font-semibold tracking-wide uppercase">
        Item {indice} de {total}
      </span>

      {item.podeLote ? (
        <Checkbox
          label={`Selecionar evidência de ${item.patientNome} para aprovação em lote`}
          checked={selecionado}
          onCheckedChange={(marcado) => onToggleSelecao(item.evidenceId, marcado === true)}
        />
      ) : null}

      <ConfidenceCard
        titulo={
          <Link href={`/pacientes/${item.patientId}`} className="hover:underline">
            {item.patientNome}
          </Link>
        }
        protocolo={item.protocolId ?? undefined}
        trecho={item.trecho || "(sem trecho registrado)"}
        friccao={friccaoParaCard[item.nivelFriccao]}
        confianca={confiancaParaNumero[item.confianca]}
        onAprovar={aprovar}
        onEditar={() => setReclassificarAberto(true)}
        onDescartar={() => setInvalidarAberto(true)}
        carregando={pendente}
      />

      <Cluster gap="sm">
        {/* Expansão: detalhes da classificação + comparação com histórico */}
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variante="secundaria" tamanho="sm">
              Ver detalhes
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Detalhes da evidência</DialogTitle>
            <DialogDescription>
              Classificação sugerida pela IA e comparação com o histórico do paciente.
            </DialogDescription>
            <Stack gap="md" className="mt-4">
              <Stack gap="sm">
                <span className="text-[var(--text-secondary)] text-sm font-semibold">
                  Classificação atual
                </span>
                <ClassificacaoAtual classificacao={item.classificacaoAtual} />
              </Stack>

              {item.motivo.length > 0 ? (
                <ChipGroup rotulo="Motivo da validação">
                  {item.motivo.map((m) => (
                    <Chip key={m}>{rotuloMotivo[m]}</Chip>
                  ))}
                </ChipGroup>
              ) : null}

              {item.inconsistenteComHistorico && item.historicoAnterior ? (
                <CompareRow
                  rotulo="Classificação"
                  divergente
                  dadoAnterior={
                    <ClassificacaoAtual classificacao={item.historicoAnterior.classificacao} />
                  }
                  dadoSugerido={<ClassificacaoAtual classificacao={item.classificacaoAtual} />}
                  dataAnterior={formatarData(item.historicoAnterior.criadoEm)}
                  motivoDivergencia="A sugestão diverge do histórico recente — confirme antes de aprovar."
                />
              ) : null}

              <Cluster gap="sm">
                <DialogClose asChild>
                  <Button type="button" variante="terciaria">
                    Fechar
                  </Button>
                </DialogClose>
              </Cluster>
            </Stack>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variante="secundaria" tamanho="sm">
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
      </Cluster>

      <Dialog
        open={reclassificarAberto}
        onOpenChange={(aberto) => {
          setReclassificarAberto(aberto);
          if (!aberto) setAlvoSelecionadoIdx(undefined);
        }}
      >
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

      <Dialog open={invalidarAberto} onOpenChange={setInvalidarAberto}>
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

      {confirmarState.error ? <Alert severidade="erro">{confirmarState.error}</Alert> : null}
    </Stack>
  );
}

/**
 * Fila de validação — cards do design system (ConfidenceCard) + aprovação em
 * lote (BatchBar) restrita a itens elegíveis (`podeLote`). Itens de alta
 * fricção continuam exigindo olhar humano individual. Os alvos de
 * reclassificação chegam prontos do server (`alvosPorPaciente`) — a fila pode
 * cruzar pacientes, então o picker de cada card usa só os alvos do paciente
 * daquele item.
 */
export function ValidacaoFila({
  itens,
  alvosPorPaciente,
}: {
  itens: ItemFila[];
  alvosPorPaciente: Record<string, AlvoValido[]>;
}) {
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [totalValidadas, setTotalValidadas] = useState(0);
  const [, startTransition] = useTransition();
  const loteEnviadoRef = useRef<string[]>([]);

  const pendentes = useMemo(
    () => itens.filter((i) => !resolvidos.has(i.evidenceId)),
    [itens, resolvidos],
  );

  const elegiveis = useMemo(() => pendentes.filter((i) => i.podeLote), [pendentes]);
  const bloqueados = pendentes.length - elegiveis.length;

  const [loteState, loteFormAction, lotePendente] = useActionState<
    ValidacaoState & { aprovadas?: number },
    FormData
  >(async (prev, fd) => {
    const r = await aprovarLoteAction(prev, fd);
    if (r.ok) {
      const aprovadasIds = loteEnviadoRef.current;
      setResolvidos((prevSet) => {
        const s = new Set(prevSet);
        for (const id of aprovadasIds) s.add(id);
        return s;
      });
      setSelecionados(new Set());
      setTotalValidadas((n) => n + (r.aprovadas ?? aprovadasIds.length));
    }
    return r;
  }, {});

  function aprovarLote() {
    // Interseção com os itens AINDA pendentes e elegíveis: uma seleção pode
    // conter id resolvido por outra ação entre o clique e o envio (estado
    // otimista) — enviar id já tratado abortaria o lote inteiro no servidor.
    const elegiveisIds = new Set(elegiveis.map((i) => i.evidenceId));
    const ids = Array.from(selecionados).filter((id) => elegiveisIds.has(id));
    if (ids.length === 0) return;
    if (ids.length !== selecionados.size) setSelecionados(new Set(ids));
    loteEnviadoRef.current = ids;
    const fd = new FormData();
    fd.set("evidenceIds", JSON.stringify(ids));
    startTransition(() => loteFormAction(fd));
  }

  function toggleSelecao(evidenceId: string, marcado: boolean) {
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (marcado) s.add(evidenceId);
      else s.delete(evidenceId);
      return s;
    });
  }

  const anuncio =
    totalValidadas > 0
      ? `${totalValidadas} ${totalValidadas === 1 ? "evidência validada" : "evidências validadas"}`
      : "";

  return (
    <>
      {/* Anúncio para leitores de tela após aprovações individuais e em lote */}
      <div aria-live="polite" role="status" className="sr-only">
        {anuncio}
      </div>

      {pendentes.length === 0 ? (
        <EmptyState
          illustration={<ReviewClinicalIllustration size={100} />}
          title="Tudo em dia na Fila de Revisão!"
          description="Todas as anotações do dia foram validadas. Seu olhar clínico faz toda a diferença!"
          variant="celebration"
        />
      ) : (
        <>
          <Stack gap="md" como="ul">
            {pendentes.map((item, idx) => (
              <ItemCard
                key={item.evidenceId}
                item={item}
                indice={idx + 1}
                total={pendentes.length}
                alvos={alvosPorPaciente[item.patientId] ?? []}
                selecionado={selecionados.has(item.evidenceId)}
                onToggleSelecao={toggleSelecao}
                onResolvido={() => {
                  setResolvidos((prev) => new Set(prev).add(item.evidenceId));
                  setSelecionados((prev) => {
                    if (!prev.has(item.evidenceId)) return prev;
                    const s = new Set(prev);
                    s.delete(item.evidenceId);
                    return s;
                  });
                  setTotalValidadas((n) => n + 1);
                }}
              />
            ))}
          </Stack>

          {loteState.error ? <Alert severidade="erro">{loteState.error}</Alert> : null}

          <BatchBar
            className="fixed inset-x-4 bottom-4"
            selecionados={selecionados.size}
            totalElegiveis={elegiveis.length}
            totalItens={pendentes.length}
            bloqueados={bloqueados}
            onAprovarLote={aprovarLote}
            onLimparSelecao={() => setSelecionados(new Set())}
            onSelecionarTodosElegiveis={() =>
              setSelecionados(new Set(elegiveis.map((i) => i.evidenceId)))
            }
            carregando={lotePendente}
          />
        </>
      )}
    </>
  );
}
