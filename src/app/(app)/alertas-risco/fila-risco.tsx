"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
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
import { AlertaRiscoCard } from "@/components/ui/patterns/alerta-risco-card";
import type { MenuAcaoItem } from "@/components/ui/primitives/menu-acoes";
import { prazoRestanteMs, vencido } from "@/lib/risco/prazos";
import { avisoLegal } from "@/lib/risco/copy";
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
 * Compromissos fundamentais:
 *
 * 1. O relato clínico fica SEMPRE visível em leitura corrida e íntegra (ClinicalQuote),
 *    destacando a evidência em negrito (§6.1). A decisão de conduta é 100% humana.
 * 2. Prazos e disclaimers de IA são apresentados por revelação progressiva ("Ver
 *    respaldo regulatório"), eliminando ruído sem perder a declaração jurídica
 *    obrigatória (§4.1) — que continua alcançável por teclado e leitor de tela.
 * 3. Ambiguidade (`ambiguo_citado`) baixa a prioridade visual, nunca o prazo real (§4.1).
 * 4. Um único CTA visível por card; Resolver/Descartar ficam no menu de reticências,
 *    e cada um confirma em modal antes de mutar.
 */

/** Formatação de SLA discreto: `01h 01m` acima de uma hora, `15m` abaixo. */
function formatarSla(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const dd = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${dd(h)}h ${dd(m)}m` : `${dd(m)}m`;
}

/**
 * Relógio de 1s como fonte externa (`useSyncExternalStore`), mantendo estabilidade
 * de renderização e sem loop de estado no React.
 */
let relogioMs = 0;

function assinarSegundo(aoMudar: () => void): () => void {
  relogioMs = Date.now();
  aoMudar();
  const id = setInterval(() => {
    relogioMs = Date.now();
    aoMudar();
  }, 1000);
  return () => clearInterval(id);
}

const lerRelogio = () => relogioMs;
const lerRelogioServidor = () => 0;

function ItemFilaRisco({ item }: { item: ItemRisco }) {
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

  const agoraMs = useSyncExternalStore(
    assinarSegundo,
    lerRelogio,
    lerRelogioServidor,
  );
  const agora = agoraMs > 0 ? new Date(agoraMs) : null;
  const prazo = new Date(item.prazoReconhecimento);
  const jaVenceu = agora ? vencido(prazo, agora) : false;
  const restante = agora ? prazoRestanteMs(prazo, agora) : null;
  const tempoRestante =
    restante !== null
      ? jaVenceu
        ? "Prazo vencido"
        : formatarSla(restante)
      : null;

  const aviso = avisoLegal(item.categoria, item.pacienteNascimento, new Date());
  const terminal = item.status === "resolvido" || item.status === "descartado";
  const aguardandoReconhecimento = item.status === "aberto";

  // Um CTA por card: enquanto o alerta não foi reconhecido, "Reconhecer" é a
  // decisão pedida. Depois disso, a decisão pedida passa a ser "Resolver".
  const acoesSecundarias = useMemo<MenuAcaoItem[]>(() => {
    if (terminal) return [];
    const itens: MenuAcaoItem[] = [];
    if (aguardandoReconhecimento) {
      itens.push({
        id: "resolver",
        rotulo: "Resolver alerta…",
        aoSelecionar: () => setResolverAberto(true),
      });
    }
    itens.push({
      id: "descartar",
      rotulo: "Descartar alerta…",
      tom: "destrutivo",
      aoSelecionar: () => setDescartarAberto(true),
    });
    return itens;
  }, [terminal, aguardandoReconhecimento]);

  const acaoPrimaria = terminal ? null : aguardandoReconhecimento ? (
    <form action={reconhecerFormAction} className="contents">
      <input type="hidden" name="alertaId" value={item.id} />
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
      <AlertaRiscoCard
        como="li"
        id={`alerta-${item.id}`}
        pacienteNome={item.pacienteNome}
        categoria={item.categoria}
        status={item.status}
        trechoFonte={item.trechoFonte}
        detalhe={item.detalhe}
        tempoRestanteFormatado={tempoRestante}
        jaVenceu={jaVenceu}
        ambiguo={item.certeza === "ambiguo_citado"}
        reconhecidoPorNome={item.reconhecidoPorNome}
        avisoLegalTexto={aviso}
        condutaRegistrada={item.condutaRegistrada}
        motivoDescarte={item.motivoDescarte}
        acaoPrimaria={acaoPrimaria}
        acoesSecundarias={acoesSecundarias}
        erro={
          reconhecerState.error ? (
            <Alert severidade="erro">{reconhecerState.error}</Alert>
          ) : null
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
            Encerra o caso registrando a conduta adotada. O registro é a prova
            de diligência do profissional — descreva o que foi feito.
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

export function FilaRisco({ itens }: { itens: ItemRisco[] }) {
  if (itens.length === 0) {
    return (
      <Alert severidade="sucesso" titulo="Nenhum sinal em aberto">
        Nenhum alerta de risco aguardando revisão no momento.
      </Alert>
    );
  }

  return (
    <Stack gap="md" como="ul">
      {itens.map((item) => (
        <ItemFilaRisco key={item.id} item={item} />
      ))}
    </Stack>
  );
}
