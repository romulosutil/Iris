"use client";

import { useActionState, useState, useTransition } from "react";
import { Stack, Cluster } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { RpdForm, type CamposRpdIniciais } from "./rpd-form";
import {
  aprovarRPDSugestaoAction,
  descartarRPDSugestaoAction,
  type DescartarRpdSugestaoState,
} from "./actions";
import type { RPDSugestao, RPDSugestaoPayload } from "./sugestoes";

export type { RPDSugestao, RPDSugestaoPayload };

function truncar(texto: string, max = 220): string {
  if (texto.length <= max) return texto;
  return `${texto.slice(0, max).trimEnd()}…`;
}

/** `criadoEm` chega como ISO 8601 (`./sugestoes`, serializável do server para
 * o client component). */
function formatarData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function valoresIniciaisDeSugestao(sugestao: RPDSugestao): CamposRpdIniciais {
  const payload: RPDSugestaoPayload = sugestao.payload;
  return {
    // #392 spec "Decisão de design: forma da aprovação" — trecho literal do
    // diário é a base do pensamento automático, não uma paráfrase gerada.
    pensamentoAutomatico: sugestao.trechoFonte,
    evidenciasFavor: payload.evidencias_favor ?? undefined,
    evidenciasContra: payload.evidencias_contra ?? undefined,
    credibilidadeInicial: payload.credibilidade_inicial ?? undefined,
    credibilidadeAlternativa: payload.credibilidade_alternativa ?? undefined,
    comportamentoResultante: payload.comportamento_resultante ?? undefined,
    distorcoesCognitivas: payload.distorcoes_cognitivas ?? undefined,
  };
}

function SugestaoItem({
  patientId,
  sugestao,
  onResolvida,
}: {
  patientId: string;
  sugestao: RPDSugestao;
  onResolvida: () => void;
}) {
  const [formAberto, setFormAberto] = useState(false);
  const [, startTransition] = useTransition();

  // "Descartar" é ação de um clique, sem diálogo bloqueante — mesmo padrão de
  // `validacao-fila.tsx` (`aprovar()`/`confirmarFormAction`): dispara direto,
  // sem confirmação intermediária.
  const [descartarState, descartarFormAction, descartarPendente] =
    useActionState<DescartarRpdSugestaoState, FormData>(async (prev, fd) => {
      const r = await descartarRPDSugestaoAction(
        sugestao.extractionId,
        patientId,
        prev,
        fd,
      );
      if (r.ok) onResolvida();
      return r;
    }, {});

  function descartar() {
    startTransition(() => descartarFormAction(new FormData()));
  }

  if (formAberto) {
    return (
      <Stack gap="sm" como="li">
        <RpdForm
          patientId={patientId}
          valoresIniciais={valoresIniciaisDeSugestao(sugestao)}
          acaoSubmit={aprovarRPDSugestaoAction.bind(
            null,
            sugestao.extractionId,
            patientId,
          )}
          aoSalvarComSucesso={onResolvida}
        />
        <Cluster gap="sm">
          <Button
            type="button"
            variante="terciaria"
            tamanho="sm"
            onClick={() => setFormAberto(false)}
          >
            Cancelar aprovação
          </Button>
        </Cluster>
      </Stack>
    );
  }

  const payload = sugestao.payload;

  return (
    <Card como="li" epistemicState="sugerida">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
          Sugestão de RPD · {formatarData(sugestao.criadoEm)}
        </span>
        <p className="font-body text-sm text-[var(--text-primary)] italic">
          &quot;{truncar(sugestao.trechoFonte)}&quot;
        </p>
        {payload.evidencias_favor ? (
          <p className="font-body text-xs text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">
              Evidências a favor:
            </strong>{" "}
            {truncar(payload.evidencias_favor, 140)}
          </p>
        ) : null}
      </div>

      <Cluster gap="sm">
        <Button
          type="button"
          variante="primaria"
          tamanho="sm"
          onClick={() => setFormAberto(true)}
        >
          Aprovar
        </Button>
        <Button
          type="button"
          variante="secundaria"
          tamanho="sm"
          onClick={descartar}
          disabled={descartarPendente}
        >
          {descartarPendente ? "Descartando…" : "Descartar"}
        </Button>
      </Cluster>

      {descartarState.error ? (
        <Alert severidade="erro">{descartarState.error}</Alert>
      ) : null}
    </Card>
  );
}

/**
 * Fila de RPD sugerido pelo agente (#392) — vive dentro da aba TCC, não em
 * `/validacao` (domínio conceitual diferente, decisão da spec). Cada item é
 * uma extração `subtipo='registro_pensamento' AND estado='sugerida'`
 * (`obterRPDSugestoes`, buscada no server component `page.tsx` e passada aqui
 * como prop — sem fetch client-side). Zero sugestões pendentes é estado
 * válido, não erro (memória `fila-validacao-lote-zero-elegiveis`).
 */
export function RpdSugestoes({
  patientId,
  sugestoes,
}: {
  patientId: string;
  sugestoes: RPDSugestao[];
}) {
  const [resolvidas, setResolvidas] = useState<Set<string>>(new Set());
  const pendentes = sugestoes.filter(
    (s) => !resolvidas.has(s.extractionId),
  );

  if (pendentes.length === 0) {
    return (
      <EmptyState
        variant="compact"
        title="Nenhum RPD sugerido pendente"
        description="Quando o agente identificar um pensamento automático numa sessão narrada, a sugestão aparece aqui para revisão — aprovar ou descartar."
      />
    );
  }

  return (
    <Stack gap="md" como="ul">
      {pendentes.map((sugestao) => (
        <SugestaoItem
          key={sugestao.extractionId}
          patientId={patientId}
          sugestao={sugestao}
          onResolvida={() =>
            setResolvidas((prev) => new Set(prev).add(sugestao.extractionId))
          }
        />
      ))}
    </Stack>
  );
}
