"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { StatusBadge, type BadgesVariantes } from "@/components/ui/status-badge";
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
import {
  DECLARACAO_PRAZOS,
  prazoRestanteMs,
  rotuloPrazo,
  vencido,
  type StatusRisco,
} from "@/lib/risco/prazos";
import {
  CATEGORIA_LEGIVEL,
  TITULO_ALERTA,
  avisoLegal,
  corpoAlerta,
} from "@/lib/risco/copy";
import {
  descartarAction,
  reconhecerAction,
  resolverAction,
  type RiscoState,
} from "./actions";
import type { ItemRisco } from "./queries";

/**
 * #122 — fila de alerta de risco clínico.
 *
 * Três compromissos que não são detalhe visual e não podem ser "otimizados"
 * depois:
 *
 * 1. O TRECHO LITERAL do diário fica SEMPRE visível, na íntegra, sem "ver mais"
 *    e sem paráfrase (§6.1). A decisão de conduta é 100% humana e o humano
 *    decide sobre o texto original, não sobre a categorização da máquina.
 * 2. Ao lado de QUALQUER temporizador aparece `DECLARACAO_PRAZOS` literal
 *    (§4.1) — declaração travada por parecer jurídico, nunca tooltip escondido.
 * 3. Ambiguidade (`ambiguo_citado`) baixa a PRIORIDADE VISUAL, nunca o prazo:
 *    o número exibido é idêntico ao do caso explícito (§4.1, última linha).
 *
 * Copy: só as constantes de `@/lib/risco/copy`. O sistema SINALIZA, o humano
 * avalia — nada aqui pode ler como veredito diagnóstico do software.
 */

const ROTULO_STATUS: Record<StatusRisco, string> = {
  aberto: "Aguardando reconhecimento",
  reconhecido: "Reconhecido",
  escalado_estagio_1: "Escalado (1º estágio)",
  escalado_estagio_2: "Escalado (2º estágio)",
  resolvido: "Resolvido",
  descartado: "Descartado",
};

const VARIANTE_STATUS: Record<StatusRisco, BadgesVariantes> = {
  aberto: "warning",
  reconhecido: "info",
  escalado_estagio_1: "warning",
  escalado_estagio_2: "warning",
  resolvido: "success",
  descartado: "neutral",
};

const TERMINAIS: StatusRisco[] = ["resolvido", "descartado"];

/** `h:mm:ss` acima de uma hora, `mm:ss` abaixo. */
function formatarRestante(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dd = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`;
}

/**
 * Relógio de 1s como fonte externa (`useSyncExternalStore`), não como
 * `setState` dentro de efeito: o tempo É um sistema externo ao React, e o
 * snapshot precisa ser estável entre ticks — `Date.now()` direto no getSnapshot
 * mudaria a cada render e derrubaria o store em loop.
 */
let relogioMs = 0;

function assinarSegundo(aoMudar: () => void): () => void {
  relogioMs = Date.now();
  aoMudar(); // primeiro valor imediato, sem esperar 1s
  const id = setInterval(() => {
    relogioMs = Date.now();
    aoMudar();
  }, 1000);
  return () => clearInterval(id);
}

const lerRelogio = () => relogioMs;
/** No servidor não existe "agora" do usuário — 0 = ainda desconhecido. */
const lerRelogioServidor = () => 0;

/** Contagem regressiva viva + a declaração obrigatória colada nela. */
function Temporizador({ item }: { item: ItemRisco }) {
  const agoraMs = useSyncExternalStore(assinarSegundo, lerRelogio, lerRelogioServidor);
  const agora = agoraMs > 0 ? new Date(agoraMs) : null;

  const prazo = new Date(item.prazoReconhecimento);
  const jaVenceu = agora ? vencido(prazo, agora) : false;
  const restante = agora ? prazoRestanteMs(prazo, agora) : null;

  return (
    <Stack gap="xs">
      <Cluster gap="sm">
        <span className="font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
          Prazo de notificação e escalonamento interno: {rotuloPrazo(item.prazoMinutos)}
        </span>
        <span
          aria-live="off"
          className={
            jaVenceu
              ? "rounded-[var(--radius-xs)] border-2 border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2 py-0.5 font-mono text-sm font-bold text-[var(--status-error-fg)]"
              : "rounded-[var(--radius-xs)] border-2 border-[var(--border-brutal)] bg-[var(--surface-elevated)] px-2 py-0.5 font-mono text-sm font-bold text-[var(--text-primary)]"
          }
        >
          {restante === null
            ? "—"
            : jaVenceu
              ? "prazo vencido"
              : `restam ${formatarRestante(restante)}`}
        </span>
      </Cluster>
      {/* §4.1 — literal, sempre ao lado do temporizador. Não resumir. */}
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
        {DECLARACAO_PRAZOS}
      </p>
    </Stack>
  );
}

function CartaoRisco({ item }: { item: ItemRisco }) {
  const [reconhecerState, reconhecerFormAction, reconhecerPendente] =
    useActionState<RiscoState, FormData>(reconhecerAction, {});
  const [resolverState, resolverFormAction, resolverPendente] = useActionState<
    RiscoState,
    FormData
  >(resolverAction, {});
  const [descartarState, descartarFormAction, descartarPendente] =
    useActionState<RiscoState, FormData>(descartarAction, {});

  const [resolverAberto, setResolverAberto] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);

  const terminal = TERMINAIS.includes(item.status);
  const ambiguo = item.certeza === "ambiguo_citado";
  const aviso = avisoLegal(item.categoria, item.pacienteNascimento, new Date());

  return (
    <Stack
      gap="md"
      como="li"
      className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow)]"
    >
      <Stack gap="sm">
        <Cluster gap="sm" className="justify-between">
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            {TITULO_ALERTA}
          </h3>
          <StatusBadge variante={VARIANTE_STATUS[item.status]}>
            {ROTULO_STATUS[item.status]}
          </StatusBadge>
        </Cluster>

        {item.pacienteNome ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Paciente: <span className="text-[var(--text-primary)]">{item.pacienteNome}</span>
          </p>
        ) : null}

        <p className="text-base text-[var(--text-primary)]">
          {corpoAlerta(CATEGORIA_LEGIVEL[item.categoria])}
        </p>
      </Stack>

      {/* §6.1 — trecho literal do diário, íntegro e sempre visível. Sem "ver
          mais", sem truncar, sem parafrasear: o humano decide sobre a fonte. */}
      <figure className="m-0">
        <figcaption className="mb-1 font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
          Trecho literal do relato de sessão
        </figcaption>
        <blockquote className="m-0 rounded-[var(--radius-control)] border-2 border-l-[6px] border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-4 font-mono text-base leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
          {item.trechoFonte}
        </blockquote>
      </figure>

      <p className="text-sm text-[var(--text-primary)]">{item.detalhe}</p>

      {aviso ? (
        <Alert severidade="erro" titulo="Dever legal aplicável a este registro">
          {aviso}
        </Alert>
      ) : null}

      <Temporizador item={item} />

      <ChipGroup rotulo="Classificação do sinal">
        {ambiguo ? (
          // Prioridade visual MENOR — e o prazo acima continua idêntico ao do
          // caso explícito. Nada aqui pode sugerir que ambiguidade dá folga.
          <Chip>texto ambíguo, citado literalmente</Chip>
        ) : null}
        {item.reconhecidoPorNome ? (
          <Chip>reconhecido por {item.reconhecidoPorNome}</Chip>
        ) : null}
      </ChipGroup>

      {terminal ? (
        <Alert
          severidade={item.status === "resolvido" ? "sucesso" : "info"}
          titulo={
            item.status === "resolvido"
              ? "Conduta registrada"
              : "Motivo do descarte"
          }
        >
          {item.status === "resolvido"
            ? (item.condutaRegistrada ?? "—")
            : (item.motivoDescarte ?? "—")}
        </Alert>
      ) : (
        <Stack gap="sm">
          <p className="text-sm text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Reconhecer</strong> é
            dar ciência — “estou ciente e estou avaliando” — e para o
            escalonamento interno.{" "}
            <strong className="text-[var(--text-primary)]">Resolver</strong>{" "}
            encerra o caso e exige a conduta adotada por escrito. As duas ações
            são distintas: reconhecer não encerra nada.
          </p>

          <Cluster gap="sm">
            {item.status === "aberto" ? (
              <form action={reconhecerFormAction} className="contents">
                <input type="hidden" name="alertaId" value={item.id} />
                <Button type="submit" variante="primaria" disabled={reconhecerPendente}>
                  {reconhecerPendente ? "Reconhecendo…" : "Reconhecer"}
                </Button>
              </form>
            ) : null}

            <Dialog open={resolverAberto} onOpenChange={setResolverAberto}>
              <DialogTrigger asChild>
                <Button type="button" variante="secundaria">
                  Resolver
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Resolver alerta</DialogTitle>
                <DialogDescription>
                  Encerra o caso registrando a conduta adotada. O registro é a
                  prova de diligência do profissional — descreva o que foi feito.
                </DialogDescription>
                <form action={resolverFormAction}>
                  <Stack gap="md" className="mt-4">
                    <input type="hidden" name="alertaId" value={item.id} />
                    <Field label="Conduta adotada" htmlFor={`conduta-${item.id}`}>
                      <Input
                        id={`conduta-${item.id}`}
                        name="conduta"
                        multiline
                        rows={4}
                        required
                        minLength={10}
                        placeholder="Descreva a conduta adotada (mínimo 10 caracteres)."
                      />
                    </Field>
                    {resolverState.error ? (
                      <Alert severidade="erro">{resolverState.error}</Alert>
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

            <Dialog open={descartarAberto} onOpenChange={setDescartarAberto}>
              <DialogTrigger asChild>
                <Button type="button" variante="secundaria">
                  Descartar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Descartar alerta</DialogTitle>
                <DialogDescription>
                  Marca o sinal como avaliado e não caracterizado como risco. O
                  registro não é apagado: fica com o motivo, e o descarte nunca é
                  silencioso.
                </DialogDescription>
                <form action={descartarFormAction}>
                  <Stack gap="md" className="mt-4">
                    <input type="hidden" name="alertaId" value={item.id} />
                    <Field label="Motivo do descarte" htmlFor={`motivo-${item.id}`}>
                      <Input
                        id={`motivo-${item.id}`}
                        name="motivo"
                        multiline
                        rows={4}
                        required
                        minLength={10}
                        placeholder="Descreva por que o sinal não é risco (mínimo 10 caracteres)."
                      />
                    </Field>
                    {descartarState.error ? (
                      <Alert severidade="erro">{descartarState.error}</Alert>
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
          </Cluster>

          {reconhecerState.error ? (
            <Alert severidade="erro">{reconhecerState.error}</Alert>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}

export function FilaRisco({ itens }: { itens: ItemRisco[] }) {
  if (itens.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Nenhum sinal em aberto">
        Nenhum alerta de risco aguardando revisão no momento.
      </Alert>
    );
  }

  // Ordem exatamente como veio da query: já chega por urgência (prazo mais
  // curto primeiro, vencido antes do que ainda tem folga). Não reordenar aqui.
  return (
    <Stack gap="md" como="ul">
      {itens.map((item) => (
        <CartaoRisco key={item.id} item={item} />
      ))}
    </Stack>
  );
}
