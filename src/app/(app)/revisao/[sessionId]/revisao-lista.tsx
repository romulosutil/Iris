"use client";

import * as React from "react";
import { useActionState } from "react";
import { Stack, Cluster, Split } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import type { FriccaoNivel } from "@/lib/extraction/review-policy";
import { rotuloSubtipo, type LinhaResumo } from "./resumo";
import type { ExtracaoRevisavel, HistoricoItem } from "./queries";
import {
  aprovarExtracaoAction,
  descartarExtracaoAction,
  editarExtracaoAction,
  type RevisaoState,
} from "./actions";
import { mensagemDeErro } from "@/lib/copy/erros";

const dataFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

// Reforço redundante do estado de fricção (§3): a COR nunca carrega o
// significado sozinha — cada nível tem rótulo textual + faixa. Aprovar exige
// abrir o cartão em qualquer nível; nos níveis medio/alto ainda pedimos a
// confirmação explícita do nível de ajuda antes de liberar o botão.
const NIVEL: Record<
  FriccaoNivel,
  { rotulo: string; faixa: string; alerta: boolean; exigeConfirmacao: boolean }
> = {
  baixo: {
    rotulo: "Alta confiança",
    faixa: "bg-mint",
    alerta: false,
    exigeConfirmacao: false,
  },
  medio: {
    rotulo: "Baixa confiança — confira antes de aprovar",
    faixa: "bg-gold",
    alerta: false,
    exigeConfirmacao: true,
  },
  alto: {
    rotulo: "Inconsistente com o histórico",
    faixa: "bg-terracotta",
    alerta: true,
    exigeConfirmacao: true,
  },
};

const confiancaRotulo: Record<ExtracaoRevisavel["confianca"], string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};

function ResumoDefinicoes({ linhas }: { linhas: LinhaResumo[] }) {
  if (linhas.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Sem detalhes estruturados.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {linhas.map((l, i) => (
        <React.Fragment key={`${l.rotulo}-${i}`}>
          <dt className="font-semibold text-[var(--text-secondary)]">
            {l.rotulo}
          </dt>
          <dd className="text-[var(--text-primary)]">{l.valor}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function PainelHistorico({ itens }: { itens: HistoricoItem[] }) {
  return (
    <section
      aria-label="Histórico do paciente no mesmo domínio"
      className="rounded-[var(--radius-xs)] border-2 border-dashed border-[var(--border-brutal)] bg-[var(--surface-elevated)] p-4"
    >
      <h4 className="font-display mb-2 text-sm font-bold tracking-wide text-[var(--text-primary)] uppercase">
        Histórico do paciente (mesmo domínio)
      </h4>
      {itens.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Sem registro anterior aprovado neste domínio para comparar. A IA
          sinalizou inconsistência — confirme manualmente antes de aprovar.
        </p>
      ) : (
        <Stack gap="md" como="ul">
          {itens.map((h) => (
            <li
              key={h.id}
              className="border-l-2 border-[var(--text-secondary)] pl-3"
            >
              <p className="text-sm text-[var(--text-primary)] italic">
                &quot;{h.trechoFonte}&quot;
              </p>
              {h.revisadoEm ? (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  aprovado em {dataFmt.format(h.revisadoEm)}
                </p>
              ) : null}
              <div className="mt-1.5">
                <ResumoDefinicoes linhas={h.resumo} />
              </div>
            </li>
          ))}
        </Stack>
      )}
    </section>
  );
}

/** Botão de ação irreversível (aprovar/descartar) com sua própria Server Action. */
function AcaoForm({
  action,
  sessionId,
  extractionId,
  children,
  variante,
  disabled,
  camposExtras,
}: {
  action: (prev: RevisaoState, fd: FormData) => Promise<RevisaoState>;
  sessionId: string;
  extractionId: string;
  children: React.ReactNode;
  variante?: "primaria" | "neutra";
  disabled?: boolean;
  /** Campos hidden/visíveis extras (ex.: justificativa do colapso, T07). */
  camposExtras?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<RevisaoState, FormData>(
    action,
    {},
  );
  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="extractionId" value={extractionId} />
      {camposExtras}
      <Button type="submit" variante={variante} disabled={disabled || pending}>
        {pending ? "…" : children}
      </Button>
      {state.error ? (
        <Alert severidade="erro" className="w-full">
          {mensagemDeErro(state.error)}
        </Alert>
      ) : null}
    </form>
  );
}

function DialogoEditar({
  ex,
  sessionId,
}: {
  ex: ExtracaoRevisavel;
  sessionId: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [state, formAction, pending] = useActionState<RevisaoState, FormData>(
    editarExtracaoAction,
    {},
  );

  // Sem auto-close via efeito: ao salvar, o revalidate re-renderiza a lista sem
  // esta extração (estado vira `editada`, some do filtro `sugerida`) e o cartão
  // — com o diálogo — desmonta. O usuário pode fechar manualmente antes disso.
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button type="button" variante="neutra" onClick={() => setAberto(true)}>
        Editar
      </Button>
      <DialogContent>
        <DialogTitle>Editar sugestão</DialogTitle>
        <DialogDescription>
          A sugestão original da IA é preservada para auditoria — sua correção é
          registrada como a classificação final.
        </DialogDescription>
        <form action={formAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="extractionId" value={ex.id} />
          <input
            type="hidden"
            name="payloadOriginal"
            value={JSON.stringify(payloadOriginalDe(ex))}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Função
            </span>
            <input
              name="funcao"
              defaultValue={valorDe(ex, "funcao")}
              className={campoClasses}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Nível de ajuda
            </span>
            <input
              name="nivel_ajuda"
              defaultValue={valorDe(ex, "nivel_ajuda")}
              className={campoClasses}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Resultado
            </span>
            <input
              name="resultado"
              defaultValue={valorDe(ex, "resultado")}
              className={campoClasses}
            />
          </label>
          {state.error ? (
            <Alert severidade="erro">{mensagemDeErro(state.error)}</Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar correção"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const campoClasses =
  "bg-[var(--surface-card)] text-[var(--text-primary)] font-body border-[var(--border-brutal)] focus-visible:outline-focus w-full border-2 px-3 py-2 text-base outline-none rounded-[var(--radius-xs)] focus-visible:outline-[length:var(--ring-width)] focus-visible:outline-offset-[var(--ring-offset)]";

// A UI de edição expõe os campos clínicos mais corrigidos (função/nível de
// ajuda/resultado). O resumo já vem pronto do servidor; recuperamos os valores
// crus a partir das linhas para pré-preencher o form.
function valorDe(ex: ExtracaoRevisavel, campo: string): string {
  const mapa: Record<string, string> = {
    funcao: "Função",
    nivel_ajuda: "Nível de ajuda",
    resultado: "Resultado",
  };
  const rotulo = mapa[campo];
  const linha = ex.resumo.find((l) => l.rotulo === rotulo);
  return linha?.valor ?? "";
}

// Reconstrói um payload mínimo com os campos editáveis para o merge server-side
// preservar o resto. O payload original imutável fica no banco (coluna payload).
function payloadOriginalDe(ex: ExtracaoRevisavel): Record<string, string> {
  const p: Record<string, string> = {};
  for (const campo of ["funcao", "nivel_ajuda", "resultado"]) {
    const v = valorDe(ex, campo);
    if (v) p[campo] = v;
  }
  return p;
}

function CartaoRevisao({
  ex,
  sessionId,
  ehDono,
  podeColapsarAprovacao,
}: {
  ex: ExtracaoRevisavel;
  sessionId: string;
  ehDono: boolean;
  /**
   * T07 (R-07/R-10/R-11, §3.5): `podeAutoValidar` já vale true para esta
   * sessão — a mesma aprovação grava o carimbo de `evidence_revision`, sem
   * uma segunda visita a /validacao. Fricção alta continua exigindo
   * justificativa escrita (R-10): o textarea abaixo só aparece quando os
   * dois são verdadeiros, e o servidor recusa a aprovação inteira sem ela
   * (não é só validação de UI).
   */
  podeColapsarAprovacao: boolean;
}) {
  const info = NIVEL[ex.nivelFriccao];
  // medio/alto abrem expandidos por padrão (§3); alta confiança nasce compacto —
  // a expansão é o gate de "abrir para aprovar" (o lastro de exibição).
  const [expandido, setExpandido] = React.useState(ex.nivelFriccao !== "baixo");
  const [confirmado, setConfirmado] = React.useState(false);
  const [justificativaColapso, setJustificativaColapso] = React.useState("");
  const detalheId = `detalhe-${ex.id}`;

  const exigeJustificativaColapso =
    podeColapsarAprovacao && info.exigeConfirmacao;

  const podeAprovar =
    ehDono &&
    (!info.exigeConfirmacao || confirmado) &&
    (!exigeJustificativaColapso || justificativaColapso.trim() !== "");

  return (
    <article className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] shadow-[var(--ds-shadow)]">
      <div className={cn("h-2 w-full", info.faixa)} aria-hidden />
      <div className="flex flex-col gap-3 p-5">
        <Split alinha="start">
          <Stack gap="sm">
            <Cluster gap="sm">
              <StatusBadge estado="sugerida" />
              <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
                {rotuloSubtipo(ex.subtipo)}
              </span>
            </Cluster>
            <p className="text-sm text-[var(--text-secondary)]">
              {info.alerta ? "⚠ " : ""}
              {info.rotulo} · {confiancaRotulo[ex.confianca]}
            </p>
          </Stack>
        </Split>

        <blockquote className="border-l-2 border-[var(--text-secondary)] pl-3 text-base text-[var(--text-primary)] italic">
          “{ex.trechoFonte}”
        </blockquote>

        {expandido ? (
          <div id={detalheId} className="flex flex-col gap-4">
            <ResumoDefinicoes linhas={ex.resumo} />

            {ex.justificativaConfianca ? (
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-semibold">Por que esta confiança: </span>
                {ex.justificativaConfianca}
              </p>
            ) : null}

            {ex.inconsistenteComHistorico ? (
              <PainelHistorico itens={ex.historico} />
            ) : null}

            {info.exigeConfirmacao && ehDono ? (
              <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 border-2 border-[var(--border-brutal)] accent-[color:var(--color-suggested)]"
                />
                <span>
                  Confirmo que revisei o nível de ajuda observado e o alvo antes
                  de aprovar.
                </span>
              </label>
            ) : null}

            {exigeJustificativaColapso ? (
              <label
                className="flex flex-col gap-1 text-sm text-[var(--text-primary)]"
                htmlFor={`justificativa-colapso-${ex.id}`}
              >
                <span className="font-semibold">
                  Justificativa (obrigatória — você é a coordenadora e a
                  terapeuta desta sessão, então esta aprovação já é o carimbo
                  final)
                </span>
                <textarea
                  id={`justificativa-colapso-${ex.id}`}
                  value={justificativaColapso}
                  onChange={(e) => setJustificativaColapso(e.target.value)}
                  required
                  rows={2}
                  className={campoClasses}
                />
              </label>
            ) : null}

            {ehDono ? (
              <Cluster gap="sm">
                <AcaoForm
                  action={aprovarExtracaoAction}
                  sessionId={sessionId}
                  extractionId={ex.id}
                  variante="primaria"
                  disabled={!podeAprovar}
                  camposExtras={
                    exigeJustificativaColapso ? (
                      <input
                        type="hidden"
                        name="justificativaColapso"
                        value={justificativaColapso}
                      />
                    ) : null
                  }
                >
                  {podeColapsarAprovacao ? "Aprovar e confirmar" : "Aprovar"}
                </AcaoForm>
                <DialogoEditar ex={ex} sessionId={sessionId} />
                <AcaoForm
                  action={descartarExtracaoAction}
                  sessionId={sessionId}
                  extractionId={ex.id}
                  variante="neutra"
                >
                  Descartar
                </AcaoForm>
              </Cluster>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Só o terapeuta da sessão pode aprovar — você está acompanhando.
              </p>
            )}
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variante="neutra"
              onClick={() => setExpandido(true)}
              aria-expanded={false}
              aria-controls={detalheId}
            >
              Revisar →
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Lista de cartões de revisão. Presentacional/interativo — recebe os dados já
 * prontos do servidor. Cada cartão gerencia sua própria expansão e chama as
 * Server Actions (que re-derivam o tenant). Aprovar só é possível com o cartão
 * aberto: o botão de aprovar não existe no estado compacto.
 */
export function RevisaoLista({
  sessionId,
  extracoes,
  ehDono,
  podeColapsarAprovacao = false,
}: {
  sessionId: string;
  extracoes: ExtracaoRevisavel[];
  ehDono: boolean;
  /** T07 — `podeAutoValidar(ctx, sessão)` (R-07). Default false preserva o
   * fluxo de dois passos em /revisao/[sessionId] para quem não passa a prop. */
  podeColapsarAprovacao?: boolean;
}) {
  if (extracoes.length === 0) {
    return (
      <p className="rounded-[var(--radius-control)] border-2 border-dashed border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 text-[var(--text-primary)]">
        Nenhuma sugestão pendente nesta sessão — tudo revisado.
      </p>
    );
  }

  return (
    <Stack gap="md" como="ul">
      {extracoes.map((ex) => (
        <li key={ex.id}>
          <CartaoRevisao
            ex={ex}
            sessionId={sessionId}
            ehDono={ehDono}
            podeColapsarAprovacao={podeColapsarAprovacao}
          />
        </li>
      ))}
    </Stack>
  );
}
