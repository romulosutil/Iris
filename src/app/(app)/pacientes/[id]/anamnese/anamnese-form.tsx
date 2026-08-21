"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import {
  ROTULO_EIXO,
  ORDEM_EIXOS,
  type EixoEspectro,
} from "@/lib/evidence/espectro";
import { ProcedenciaMarcoZero } from "../timeline/procedencia-marco-zero";
import {
  salvarRascunhoAnamneseAction,
  validarAnamneseAction,
  type AnamneseActionResult,
} from "./actions";
import { PROCEDENCIAS, type Procedencia, type Alvo } from "./schemas";

export type MilestoneOpcao = {
  id: string;
  rotulo: string;
};

export type AnamneseAlvoItem = {
  id?: string;
  eixo: EixoEspectro;
  descricao: string;
  disciplina?: "ABA" | "Fono" | "TO" | null;
  milestone_id?: string | null;
  nivel_ajuda_inicial: number | null;
  procedencia: Procedencia;
  criterio_n: number;
  criterio_m: number;
  ciclo_revisao_semanas: number;
};

export type AnamneseDados = {
  id: string;
  estado: "rascunho" | "validada";
  validadaEm?: string | null;
  validadaPorNome?: string | null;
  criadoEm: string;
  alvos: AnamneseAlvoItem[];
};

const ROTULO_PROCEDENCIA: Record<Procedencia, string> = {
  relatado_responsavel: "Relatado pelo responsável",
  observado_avaliador: "Observado pelo avaliador",
  registro_anterior: "Registro anterior",
};

export function AnamneseForm({
  patientId,
  patientNome,
  isCoordenador,
  anamnese,
  milestones = [],
  taxonomiaAjuda = [
    "Independente",
    "Dica Verbal",
    "Dica Gestual",
    "Modelação",
    "Dica Física",
  ],
}: {
  patientId: string;
  patientNome: string;
  isCoordenador: boolean;
  anamnese?: AnamneseDados | null;
  milestones?: MilestoneOpcao[];
  taxonomiaAjuda?: string[];
}) {
  const isValidada = anamnese?.estado === "validada";

  const [anamneseId, setAnamneseId] = useState<string | null>(
    anamnese?.id ?? null,
  );
  const [alvos, setAlvos] = useState<AnamneseAlvoItem[]>(
    anamnese?.alvos && anamnese.alvos.length > 0
      ? anamnese.alvos
      : [
          {
            eixo: "comunicacao_expressiva",
            descricao: "",
            disciplina: "ABA",
            milestone_id: null,
            nivel_ajuda_inicial: null,
            procedencia: "relatado_responsavel",
            criterio_n: 3,
            criterio_m: 4,
            ciclo_revisao_semanas: 8,
          },
        ],
  );

  const [statusMessage, setStatusMessage] = useState<{
    tipo: "sucesso" | "erro";
    texto: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  function handleAddAlvo() {
    if (alvos.length >= 24) return;
    setAlvos((prev) => [
      ...prev,
      {
        eixo: "comunicacao_expressiva",
        descricao: "",
        disciplina: "ABA",
        milestone_id: null,
        nivel_ajuda_inicial: null,
        procedencia: "relatado_responsavel",
        criterio_n: 3,
        criterio_m: 4,
        ciclo_revisao_semanas: 8,
      },
    ]);
  }

  function handleRemoveAlvo(index: number) {
    setAlvos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateAlvo(
    index: number,
    field: keyof AnamneseAlvoItem,
    value: unknown,
  ) {
    setAlvos((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index]!, [field]: value };
      return updated;
    });
  }

  async function handleSalvarRascunho() {
    setStatusMessage(null);
    startTransition(async () => {
      const res = await salvarRascunhoAnamneseAction({
        patientId,
        alvos: alvos.map((a) => ({
          eixo: a.eixo,
          descricao: a.descricao,
          disciplina: a.disciplina,
          milestone_id: a.milestone_id,
          nivel_ajuda_inicial: a.nivel_ajuda_inicial,
          procedencia: a.procedencia,
          criterio_n: a.criterio_n,
          criterio_m: a.criterio_m,
          ciclo_revisao_semanas: a.ciclo_revisao_semanas,
        })),
      });

      if (res.error) {
        setStatusMessage({ tipo: "erro", texto: res.error });
      } else if (res.ok) {
        if (res.id) setAnamneseId(res.id);
        setStatusMessage({
          tipo: "sucesso",
          texto: "Rascunho de anamnese salvo com sucesso.",
        });
      }
    });
  }

  async function handleValidar() {
    if (!anamneseId) {
      setStatusMessage({
        tipo: "erro",
        texto: "Salve o rascunho antes de validar a anamnese.",
      });
      return;
    }
    setStatusMessage(null);
    startTransition(async () => {
      const res = await validarAnamneseAction(patientId, { anamneseId });
      if (res.error) {
        setStatusMessage({ tipo: "erro", texto: res.error });
      } else if (res.ok) {
        setStatusMessage({
          tipo: "sucesso",
          texto: "Anamnese validada e Marco Zero registrado na linha do tempo.",
        });
      }
    });
  }

  if (isValidada) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          className="rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-5 shadow-[var(--ds-shadow-sm)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold text-[var(--color-primary-green)]">
                  ✓ Anamnese Validada (Marco Zero Clínico)
                </span>
                <Chip variante="neutral">Somente Leitura</Chip>
              </div>
              <p className="font-body mt-1 text-xs text-[var(--text-secondary)]">
                Validada por {anamnese?.validadaPorNome ?? "Coordenador"} em{" "}
                {anamnese?.validadaEm
                  ? new Date(anamnese.validadaEm).toLocaleDateString("pt-BR")
                  : "Data registrada"}
                . O repertório inicial foi congelado e publicado na linha do
                tempo.
              </p>
            </div>
            <Link
              href={`/pacientes/${patientId}/timeline`}
              className="font-display inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--action-primary)] px-4 text-xs font-bold text-[var(--text-inverted)] shadow-[var(--ds-shadow-xs)] hover:bg-[var(--action-primary)]/90"
            >
              Ver Linha do Tempo
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            Alvos Estabelecidos ({alvos.length})
          </h2>
          <div className="flex flex-col gap-3">
            {alvos.map((alvo, idx) => (
              <div
                key={alvo.id ?? idx}
                className="flex flex-col gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow-xs)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">
                    {ROTULO_EIXO[alvo.eixo]}
                  </span>
                  <ProcedenciaMarcoZero
                    origem="anamnese"
                    procedencia={alvo.procedencia}
                  />
                </div>
                <p className="font-body text-sm font-semibold text-[var(--text-primary)]">
                  {alvo.descricao}
                </p>
                <div className="font-body flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                  <span>
                    <strong>Nível inicial:</strong>{" "}
                    {alvo.nivel_ajuda_inicial !== null
                      ? (taxonomiaAjuda[alvo.nivel_ajuda_inicial] ??
                        `Nível ${alvo.nivel_ajuda_inicial}`)
                      : "Não avaliado"}
                  </span>
                  {alvo.disciplina ? (
                    <span>
                      <strong>Disciplina:</strong> {alvo.disciplina}
                    </span>
                  ) : null}
                  <span>
                    <strong>Critério:</strong> {alvo.criterio_n} acertos em{" "}
                    {alvo.criterio_m} sessões
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {statusMessage ? (
        <div
          role="status"
          className={`rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] p-3 text-sm font-semibold shadow-[var(--ds-shadow-xs)] ${
            statusMessage.tipo === "sucesso"
              ? "bg-[var(--surface-elevated)] text-[var(--color-primary-green)]"
              : "bg-[var(--surface-card)] text-[var(--color-primary-terracota)]"
          }`}
        >
          {statusMessage.texto}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-brutal)]/30 pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            Preenchimento de Anamnese (Marco Zero)
          </h2>
          <p className="font-body text-xs text-[var(--text-secondary)]">
            Defina o ponto de partida do repertório clínico para {patientNome}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-display text-xs font-bold ${
              alvos.length >= 24
                ? "text-[var(--color-primary-terracota)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {alvos.length} de 24 alvos
          </span>
        </div>
      </div>

      {alvos.length >= 24 ? (
        <p
          role="status"
          className="font-body text-xs font-bold text-[var(--color-primary-terracota)]"
        >
          Máximo de 24 alvos por anamnese.
        </p>
      ) : null}

      <div className="flex flex-col gap-5">
        {alvos.map((alvo, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-4 rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-4 shadow-[var(--ds-shadow-sm)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-brutal)]/20 pb-2">
              <span className="font-display text-xs font-bold text-[var(--text-primary)]">
                Alvo #{idx + 1}
              </span>
              {alvos.length > 1 ? (
                <button
                  type="button"
                  onClick={() => handleRemoveAlvo(idx)}
                  className="font-display text-xs font-bold text-[var(--color-primary-terracota)] hover:underline"
                >
                  Remover alvo
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Eixo do Espectro" htmlFor={`eixo-${idx}`}>
                <select
                  id={`eixo-${idx}`}
                  value={alvo.eixo}
                  onChange={(e) =>
                    handleUpdateAlvo(
                      idx,
                      "eixo",
                      e.target.value as EixoEspectro,
                    )
                  }
                  className="focus-visible:outline-focus h-10 w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
                >
                  {ORDEM_EIXOS.map((eixo) => (
                    <option key={eixo} value={eixo}>
                      {ROTULO_EIXO[eixo]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Procedência da Informação"
                htmlFor={`procedencia-${idx}`}
              >
                <select
                  id={`procedencia-${idx}`}
                  value={alvo.procedencia}
                  onChange={(e) =>
                    handleUpdateAlvo(
                      idx,
                      "procedencia",
                      e.target.value as Procedencia,
                    )
                  }
                  className="focus-visible:outline-focus h-10 w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
                >
                  {PROCEDENCIAS.map((proc) => (
                    <option key={proc} value={proc}>
                      {ROTULO_PROCEDENCIA[proc]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Descrição do Alvo (Linguagem simples)"
              htmlFor={`desc-${idx}`}
            >
              <Input
                id={`desc-${idx}`}
                value={alvo.descricao}
                onChange={(e) =>
                  handleUpdateAlvo(idx, "descricao", e.target.value)
                }
                placeholder="Ex.: Solicitar água verbalmente ou por gesto independente"
                required
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Nível de Ajuda Inicial (Marco Zero)"
                htmlFor={`nivel-${idx}`}
              >
                <select
                  id={`nivel-${idx}`}
                  value={
                    alvo.nivel_ajuda_inicial === null
                      ? "null"
                      : String(alvo.nivel_ajuda_inicial)
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    handleUpdateAlvo(
                      idx,
                      "nivel_ajuda_inicial",
                      v === "null" ? null : Number(v),
                    );
                  }}
                  className="focus-visible:outline-focus h-10 w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
                >
                  <option value="null">Não avaliado (sem medida)</option>
                  {taxonomiaAjuda.map((nivelNome, nIdx) => (
                    <option key={nIdx} value={String(nIdx)}>
                      {nIdx} · {nivelNome}
                    </option>
                  ))}
                </select>
              </Field>

              {milestones.length > 0 ? (
                <Field
                  label="Vincular a Marco (Opcional)"
                  htmlFor={`milestone-${idx}`}
                >
                  <select
                    id={`milestone-${idx}`}
                    value={alvo.milestone_id ?? ""}
                    onChange={(e) =>
                      handleUpdateAlvo(
                        idx,
                        "milestone_id",
                        e.target.value || null,
                      )
                    }
                    className="focus-visible:outline-focus h-10 w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">Nenhum marco vinculado</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.rotulo}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Disciplina" htmlFor={`disciplina-${idx}`}>
                  <select
                    id={`disciplina-${idx}`}
                    value={alvo.disciplina ?? "ABA"}
                    onChange={(e) =>
                      handleUpdateAlvo(
                        idx,
                        "disciplina",
                        e.target.value as "ABA" | "Fono" | "TO",
                      )
                    }
                    className="focus-visible:outline-focus h-10 w-full rounded-[var(--radius-control)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)]"
                  >
                    <option value="ABA">ABA</option>
                    <option value="Fono">Fono</option>
                    <option value="TO">TO</option>
                  </select>
                </Field>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-brutal)]/30 pt-4">
        <Button
          type="button"
          variante="secundaria"
          disabled={alvos.length >= 24 || isPending}
          onClick={handleAddAlvo}
        >
          + Adicionar Outro Alvo
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variante="terciaria"
            disabled={isPending}
            onClick={handleSalvarRascunho}
          >
            {isPending ? "Salvando..." : "Salvar Rascunho"}
          </Button>

          {isCoordenador ? (
            <Button
              type="button"
              variante="primaria"
              disabled={isPending || !anamneseId}
              onClick={handleValidar}
            >
              {isPending ? "Validando..." : "Validar Anamnese"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
