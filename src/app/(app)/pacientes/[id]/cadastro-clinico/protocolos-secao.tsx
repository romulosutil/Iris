"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatarDisciplina } from "@/lib/disciplinas";
import {
  ativarProtocoloAction,
  desativarProtocoloAction,
  inicializarProtocolosAction,
} from "./protocolo-actions";
import type { ProtocoloState } from "./protocolo-logic";
import {
  agruparProtocolosPorPrescricao,
  type ProtocoloCatalogo,
  type ProtocoloVinculado,
  type VinculoProtocolo,
} from "./protocolo-agrupamento";

/**
 * Protocolos estruturados como ENCAIXE da prescrição (#203, fatia 3).
 *
 * O que mudou em relação ao desenho anterior, e por quê:
 *
 *   Saiu o rádio "Terapia Convencional × Protocolos de Marcos". Ele guardava em
 *   `useState` uma escolha que o banco não registra — recarregar a página
 *   devolvia o modo pela existência de vínculo, então o controle mentia sobre
 *   ser uma decisão. A ausência de protocolo JÁ significa acompanhamento
 *   narrativo; o que faltava era dizer isso em texto, não pedir de novo.
 *
 *   O catálogo deixou de ser oferecido inteiro. Protocolo só aparece dentro da
 *   disciplina prescrita correspondente. Oferecer VB-MAPP a um paciente sem ABA
 *   prescrita monta acompanhamento estruturado numa disciplina que a equipe não
 *   pode atender (a prescrição é o teto — fatia 4).
 *
 *   Vínculo órfão ganhou bloco próprio. Encerrar a prescrição de uma disciplina
 *   deixa o protocolo dela sem casa; escondê-lo criaria linha viva no banco que
 *   ninguém enxerga nem desvincula.
 */
export function ProtocolosSecao({
  patientId,
  catalogo,
  vinculos,
  disciplinasPrescritas,
}: {
  patientId: string;
  catalogo: ProtocoloCatalogo[];
  vinculos: VinculoProtocolo[];
  disciplinasPrescritas: string[];
}) {
  const { grupos, foraDaPrescricao } = agruparProtocolosPorPrescricao(
    disciplinasPrescritas,
    catalogo,
    vinculos,
  );
  const semPrescricao = disciplinasPrescritas.length === 0;
  const temAtivos = vinculos.some((v) => !v.desativadoEm);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            Protocolos estruturados (encaixe opcional)
          </h2>
          <p className="font-body text-xs text-[var(--text-secondary)]">
            Protocolo de marcos (VB-MAPP, Denver, ABLLS-R, PROC) é um
            sub-encaixe de uma disciplina já prescrita. Disciplina sem protocolo
            vinculado é acompanhada em formato narrativo — psicologia
            generalista, psicanálise ou TCC — e isso é uma escolha clínica
            válida, não configuração pendente.
          </p>
        </div>
        {temAtivos && (
          <Button
            variante="secundaria"
            tamanho="sm"
            className="shrink-0"
            asChild
          >
            <Link href={`/pacientes/${patientId}/protocolos`}>
              Ver Progresso →
            </Link>
          </Button>
        )}
      </div>

      {semPrescricao ? (
        <Alert severidade="info" titulo="Prescreva uma disciplina primeiro">
          <p className="text-sm leading-relaxed">
            Protocolo se encaixa em disciplina prescrita. Assim que houver
            prescrição vigente, os protocolos do catálogo aparecem aqui
            agrupados por disciplina.{" "}
            <a
              href="#prescricao"
              className="font-semibold underline underline-offset-4"
            >
              Ir para a prescrição ↑
            </a>
          </p>
        </Alert>
      ) : catalogo.length === 0 ? (
        <CatalogoVazio patientId={patientId} />
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <GrupoDeDisciplina
              key={grupo.disciplina}
              patientId={patientId}
              disciplina={grupo.disciplina}
              ativos={grupo.ativos}
              disponiveis={grupo.disponiveis}
            />
          ))}
        </div>
      )}

      {foraDaPrescricao.length > 0 && (
        <ForaDaPrescricao patientId={patientId} itens={foraDaPrescricao} />
      )}
    </section>
  );
}

const VAZIO: ProtocoloState = {};

function CatalogoVazio({ patientId }: { patientId: string }) {
  const [state, formAction, isPending] = useActionState<
    ProtocoloState,
    FormData
  >(inicializarProtocolosAction.bind(null, patientId), VAZIO);

  return (
    <Alert
      severidade="info"
      titulo="Nenhum protocolo cadastrado no catálogo da clínica"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Sua clínica ainda não possui protocolos cadastrados. Carregue o
          catálogo padrão (VB-MAPP, Denver, ABLLS-R, PROC…) para poder encaixar
          um protocolo nas disciplinas prescritas deste paciente.
        </p>
        {state.error ? (
          <Alert severidade="erro" destacado={!!state.bloqueioConta}>
            {state.error}
          </Alert>
        ) : null}
        <form action={formAction}>
          <Button type="submit" variante="secundaria" isLoading={isPending}>
            {isPending
              ? "Carregando catálogo..."
              : "Carregar catálogo de protocolos padrão"}
          </Button>
        </form>
      </div>
    </Alert>
  );
}

function GrupoDeDisciplina({
  patientId,
  disciplina,
  ativos,
  disponiveis,
}: {
  patientId: string;
  disciplina: string;
  ativos: ProtocoloVinculado[];
  disponiveis: ProtocoloCatalogo[];
}) {
  const nome = formatarDisciplina(disciplina);
  const semCatalogo = ativos.length === 0 && disponiveis.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/30 bg-[var(--surface-card)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
          {nome}
        </h3>
        <Chip variante={ativos.length > 0 ? "info" : "neutral"}>
          {ativos.length > 0
            ? `${ativos.length} protocolo(s) encaixado(s)`
            : "Acompanhamento narrativo"}
        </Chip>
      </div>

      {semCatalogo ? (
        <p className="text-xs text-[var(--text-secondary)] italic">
          O catálogo da clínica não tem protocolo estruturado para {nome}. O
          acompanhamento desta disciplina segue em formato narrativo.
        </p>
      ) : (
        <>
          {ativos.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ativos.map((a) => (
                <li key={a.vinculoId}>
                  <ProtocoloAtivo patientId={patientId} item={a} />
                </li>
              ))}
            </ul>
          )}

          {disponiveis.length > 0 && (
            <div className="flex flex-col gap-2">
              {ativos.length === 0 && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Nenhum protocolo encaixado em {nome} — os diários serão
                  analisados em formato narrativo. Encaixar é opcional.
                </p>
              )}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {disponiveis.map((p) => (
                  <li key={p.id}>
                    <ProtocoloDisponivel patientId={patientId} protocolo={p} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProtocoloDisponivel({
  patientId,
  protocolo,
}: {
  patientId: string;
  protocolo: ProtocoloCatalogo;
}) {
  const [state, formAction, isPending] = useActionState<
    ProtocoloState,
    FormData
  >(ativarProtocoloAction.bind(null, patientId, protocolo.id), VAZIO);
  const { addToast } = useToast();

  useEffect(() => {
    if (!state.ok) return;
    addToast({
      titulo: "Protocolo encaixado",
      mensagem: `${protocolo.nome} passa a orientar a coleta de dados de ${formatarDisciplina(protocolo.disciplina)}.`,
      severidade: "sucesso",
    });
  }, [state.ok, addToast, protocolo.nome, protocolo.disciplina]);

  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)]/30 bg-[var(--surface-page)] p-4 transition-all hover:border-[var(--border-brutal)]">
      <h4 className="font-display text-sm font-bold text-[var(--text-primary)]">
        {protocolo.nome}
      </h4>
      {state.error ? (
        <Alert severidade="erro" destacado={!!state.bloqueioConta}>
          {state.error}
        </Alert>
      ) : null}
      <form action={formAction}>
        <Button
          type="submit"
          tamanho="sm"
          className="w-full"
          isLoading={isPending}
        >
          {isPending ? "Encaixando..." : "+ Encaixar protocolo"}
        </Button>
      </form>
    </div>
  );
}

function ProtocoloAtivo({
  patientId,
  item,
}: {
  patientId: string;
  item: ProtocoloVinculado;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, formAction, isPending] = useActionState<
    ProtocoloState,
    FormData
  >(desativarProtocoloAction.bind(null, patientId, item.vinculoId), VAZIO);
  const { addToast } = useToast();

  useEffect(() => {
    if (!state.ok) return;
    addToast({
      titulo: "Protocolo desencaixado",
      mensagem: `${item.protocolo.nome} deixou de orientar a coleta. As sessões e registros anteriores permanecem no histórico.`,
      severidade: "sucesso",
    });
  }, [state.ok, addToast, item.protocolo.nome]);

  return (
    <Card titulo={item.protocolo.nome} estado="conquistado" className="h-full">
      <div className="mt-1 flex flex-col gap-2">
        {state.error ? (
          <Alert severidade="erro" destacado={!!state.bloqueioConta}>
            {state.error}
          </Alert>
        ) : null}
        {item.foraDoCatalogo && (
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            O protocolo deste vínculo não está mais no catálogo da clínica,
            então não dá para dizer a que disciplina ele pertencia. Desencaixar
            é a única ação possível aqui.
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {item.foraDoCatalogo ? (
            <span />
          ) : (
            <Chip variante="info">
              {formatarDisciplina(item.protocolo.disciplina)}
            </Chip>
          )}
          <Button
            type="button"
            tamanho="sm"
            variante="terciaria"
            onClick={() => setConfirmando(true)}
          >
            Desencaixar
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmando}
        onOpenChange={(aberto) => {
          if (!aberto) setConfirmando(false);
        }}
      >
        <DialogContent>
          <DialogTitle>
            Desencaixar {item.protocolo.nome} deste paciente?
          </DialogTitle>
          <DialogDescription>
            A disciplina continua prescrita e a equipe segue alocada — só o
            acompanhamento por marcos deixa de valer, e os diários passam a ser
            analisados em formato narrativo. Os registros e as sessões
            anteriores permanecem intactos.
          </DialogDescription>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button
              type="button"
              variante="neutra"
              tamanho="sm"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </Button>
            <form action={formAction}>
              {/* Fecha no clique, como o diálogo de encerrar prescrição
                  (fatia 2): fechar no efeito de sucesso seria setState dentro
                  de efeito, que o lint do repo barra. Erro de servidor aparece
                  no cartão, que continua na tela. */}
              <Button
                type="submit"
                tamanho="sm"
                isLoading={isPending}
                onClick={() => setConfirmando(false)}
              >
                {isPending ? "Desencaixando..." : "Confirmar"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Bloco dos vínculos cuja disciplina não está prescrita hoje.
 *
 * Mesmo tratamento que o plano §3.1 deu ao membro de equipe fora da prescrição:
 * o estado aparece, é explicado, e tem as duas saídas possíveis (prescrever a
 * disciplina de volta ou desencaixar). Estado esquisito visível é dívida
 * pequena; estado esquisito escondido é bug que aparece na auditoria.
 */
function ForaDaPrescricao({
  patientId,
  itens,
}: {
  patientId: string;
  itens: ProtocoloVinculado[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert
        severidade="warning"
        titulo={`Fora da prescrição atual (${itens.length})`}
      >
        <p className="text-xs leading-relaxed">
          Estes protocolos continuam vinculados, mas a disciplina deles não está
          prescrita para este paciente — ninguém pode ser alocado nela e a
          coleta de marcos não tem carga horária correspondente.{" "}
          <a
            href="#prescricao"
            className="font-semibold underline underline-offset-4"
          >
            Prescreva a disciplina ↑
          </a>{" "}
          para trazê-los de volta ao acompanhamento, ou desencaixe-os.
        </p>
      </Alert>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {itens.map((item) => (
          <li key={item.vinculoId}>
            <ProtocoloAtivo patientId={patientId} item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
