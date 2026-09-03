import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { extraction, session, tccRpdEntry } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";
import { registrarAlertaRiscoRPD } from "@/lib/risco/registrar";

import { detectarSinaisDeRiscoRPD } from "./deteccao-risco";
import {
  salvarRpdSchema,
  validarTaxonomiaDistorcoes,
  type TxDeTenant,
} from "./logic";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

// #392 — ponte agente → RPD sugerido. Fila de validação vive dentro da aba
// TCC do paciente (decisão de UX já fechada, ver spec.md) — `extraction`
// COM `subtipo='registro_pensamento' AND estado='sugerida'` É a fila; não
// existe tabela de staging nova. Aprovar grava em `tcc_rpd_entry` com
// proveniência (`origem_extraction_id`/`origem_agente=true`) e transiciona a
// extração para `aprovada`; descartar só transiciona para `descartada`. Em
// ambos os casos o alerta de risco já criado na Fase F de
// `diario/[sessionId]/logic.ts` (ancorado em `origem_extraction_id` da
// própria extração) NUNCA é migrado/recriado — trilha imutável (mesmo
// princípio de #391).

// ─── Leitura da fila ────────────────────────────────────────────────────────
// RLS da leitura NÃO é policy nova: `extraction_select` (0085:177) já isola
// por `clinic_id = app_clinic_id_exigido() AND app_session_clinica_visivel
// (session_id)`, genérico por linha, sem exceção por subtipo. Este SELECT só
// filtra `subtipo`/`estado`/`patient_id` EM CIMA de um resultado já isolado
// por tenant — não re-deriva o isolamento à mão.

/** Shape de `registroPensamentoSchema` (`agent-output-schema.ts:125`) — o
 * mesmo formato que `RPDSugestaoPayload` em `rpd-sugestoes.tsx` espera
 * (estruturalmente compatível, não importado direto de um componente
 * `"use client"` para não acoplar um módulo server-only a um client module só
 * por causa de um tipo). */
export type RPDSugestaoPayload = {
  evidencias_favor?: string | null;
  evidencias_contra?: string | null;
  credibilidade_inicial?: number | null;
  credibilidade_alternativa?: number | null;
  comportamento_resultante?: string | null;
  distorcoes_cognitivas?: string[];
};

export type RPDSugestao = {
  extractionId: string;
  trechoFonte: string;
  /** ISO 8601 — a UI (`rpd-sugestoes.tsx`) formata com `new Date(iso)`. */
  criadoEm: string;
  payload: RPDSugestaoPayload;
};

export async function obterRPDSugestoes(
  ctx: TenantContext,
  patientId: string,
): Promise<RPDSugestao[]> {
  requireRole(ctx, "coordenador", "terapeuta", "admin_recepcao");
  const rows = await withTenant(ctx, async (tx) => {
    return await tx
      .select({
        extractionId: extraction.id,
        trechoFonte: extraction.trechoFonte,
        payload: extraction.payload,
        criadoEm: extraction.criadoEm,
      })
      .from(extraction)
      .innerJoin(session, eq(session.id, extraction.sessionId))
      .where(
        and(
          eq(extraction.subtipo, "registro_pensamento"),
          eq(extraction.estado, "sugerida"),
          eq(session.patientId, patientId),
        ),
      )
      .orderBy(asc(session.criadoEm), asc(extraction.criadoEm));
  });
  return rows.map((r) => ({
    extractionId: r.extractionId,
    trechoFonte: r.trechoFonte,
    criadoEm: r.criadoEm.toISOString(),
    payload: (r.payload ?? {}) as RPDSugestaoPayload,
  }));
}

// ─── Aprovação ──────────────────────────────────────────────────────────────
// Aprovar NÃO é toggle de estado puro: é o formulário completo (`rpd-form.tsx`
// pré-preenchido) confirmado pelo terapeuta — reusa `salvarRpdSchema` por
// inteiro (RQ4: "o cliente reenvia tudo"), incluindo `patientId`/`sessionId`
// (a action `aprovarRPDSugestaoAction`, `actions.ts`, já os inclui no
// payload). O SERVIDOR NÃO CONFIA nesses dois campos para a escrita, porém:
// `patientId`/`sessionId` efetivos vêm sempre de uma leitura própria da
// extração (join com `session`, sob RLS/lock em
// `lerExtracaoSugeridaSobLock`) — fecha o caminho de IDOR (cliente não
// consegue reapontar a aprovação para outro paciente só trocando o payload
// do form). Os valores client-side só existem para o formulário poder ser
// reaproveitado sem um shape paralelo.
const aprovarRpdSchema = salvarRpdSchema.extend({
  extractionId: z.string().uuid("ID de extração inválido"),
});

export type AprovarRpdSugestaoInput = z.input<typeof aprovarRpdSchema>;

export type AprovarRpdSugestaoResult = {
  error?: string;
  bloqueioConta?: BloqueioConta;
  id?: string;
  /** #391/#392 — erro ao REGISTRAR o alerta de risco sobre os campos FINAIS
   * confirmados (não ao aprovar em si). A aprovação já foi commitada quando
   * este campo aparece. */
  alertaRiscoErro?: string;
};

type ExtracaoParaAprovar = {
  id: string;
  subtipo: string;
  sessionId: string;
  patientId: string;
};

async function lerExtracaoSugeridaSobLock(
  tx: TxDeTenant,
  extractionId: string,
): Promise<
  | { erro: "NAO_ENCONTRADA" | "NAO_E_RPD" | "CONCURRENCY_ERROR" }
  | ExtracaoParaAprovar
> {
  const rows0 = (await tx.execute(sql`
    SELECT e.id, e.subtipo, e.session_id, s.patient_id
      FROM extraction e
      JOIN session s ON s.id = e.session_id
     WHERE e.id = ${extractionId}::uuid
  `)) as unknown as {
    id: string;
    subtipo: string;
    session_id: string;
    patient_id: string;
  }[];
  const extracao = rows0[0];
  if (!extracao) return { erro: "NAO_ENCONTRADA" };
  if (extracao.subtipo !== "registro_pensamento") return { erro: "NAO_E_RPD" };

  // ⚠️ ADVISORY LOCK por paciente — mesmo padrão de `validacao/logic.ts`
  // (`lerEvidenciaParaValidar`): serializa aprovação/descarte concorrentes da
  // mesma sugestão (2 abas, 2 terapeutas).
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${extracao.patient_id}::text, 0))`,
  );

  // Re-checagem SOB o lock: se outra transação já aprovou/descartou entre a
  // leitura acima e a aquisição do lock, aborta sem duplicar.
  const rows1 = (await tx.execute(sql`
    SELECT estado FROM extraction WHERE id = ${extractionId}::uuid
  `)) as unknown as { estado: string }[];
  if (rows1[0]?.estado !== "sugerida") return { erro: "CONCURRENCY_ERROR" };

  return {
    id: extracao.id,
    subtipo: extracao.subtipo,
    sessionId: extracao.session_id,
    patientId: extracao.patient_id,
  };
}

async function aprovarRPDSugestaoCore(
  ctx: TenantContext,
  input: AprovarRpdSugestaoInput,
): Promise<AprovarRpdSugestaoResult> {
  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  const parsed = aprovarRpdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }
  const d = parsed.data;
  const distorcoes =
    d.distorcoesCognitivas && d.distorcoesCognitivas.length > 0
      ? d.distorcoesCognitivas
      : null;

  try {
    const resultado = await withTenant(ctx, async (tx) => {
      const extracao = await lerExtracaoSugeridaSobLock(tx, d.extractionId);
      if ("erro" in extracao) {
        return {
          error:
            extracao.erro === "NAO_ENCONTRADA"
              ? "Sugestão de RPD não encontrada."
              : extracao.erro === "NAO_E_RPD"
                ? "Extração não é um RPD sugerido."
                : "CONCURRENCY_ERROR",
        };
      }

      const erroTaxonomia = await validarTaxonomiaDistorcoes(
        tx,
        ctx,
        distorcoes,
      );
      if (erroTaxonomia) return { error: erroTaxonomia };

      const [row] = await tx
        .insert(tccRpdEntry)
        .values({
          clinicId: ctx.clinicId,
          patientId: extracao.patientId,
          sessionId: extracao.sessionId,
          situacao: d.situacao,
          pensamentoAutomatico: d.pensamentoAutomatico,
          emocao: d.emocao,
          intensidade: d.intensidade,
          credibilidadeInicial: d.credibilidadeInicial ?? null,
          evidenciasFavor: d.evidenciasFavor ?? null,
          evidenciasContra: d.evidenciasContra ?? null,
          respostaRacional: d.respostaRacional ?? null,
          credibilidadeAlternativa: d.credibilidadeAlternativa ?? null,
          distorcoesCognitivas: distorcoes,
          comportamentoResultante: d.comportamentoResultante ?? null,
          intensidadePos: d.intensidadePos ?? null,
          criadoPor: ctx.userId,
          // #392 — proveniência: esta linha nasceu de uma sugestão do agente.
          origemExtractionId: d.extractionId,
          origemAgente: true,
        })
        .returning({ id: tccRpdEntry.id });

      // MESMA transação: sugestão sai da fila (`extraction.estado` →
      // 'aprovada'). RLS `extraction_update` restringe a escrita ao
      // terapeuta dono da sessão (mesma restrição já em vigor para
      // aprovarExtracao/descartarExtracao em `revisao/[sessionId]/logic.ts`)
      // — 0 linhas afetadas aqui é, na prática, indistinguível de corrida e
      // cai no mesmo `CONCURRENCY_ERROR` (a linha do RPD já foi inserida
      // acima; a transação inteira faz rollback via throw).
      const upd = (await tx.execute(sql`
        UPDATE extraction SET estado = 'aprovada'
         WHERE id = ${d.extractionId}::uuid
        RETURNING id
      `)) as unknown as { id: string }[];
      if (upd.length === 0) {
        throw new ConcurrencyAbortError();
      }

      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        extracao.patientId,
        "registro_clinico",
      );

      return { id: row!.id, patientId: extracao.patientId };
    });

    if ("error" in resultado) return resultado;

    // #392/RQ4 — varredura de risco NORMAL do RPD (#391) sobre os campos
    // FINAIS confirmados pelo terapeuta (não os do payload original da
    // extração) — DEPOIS do commit, mesmo padrão de `salvarRPDCore`. Pode
    // gerar um SEGUNDO alerta distinto do já criado na Fase F sobre a
    // sugestão (ancorado em `origem_extraction_id`); não deduplica — são
    // eventos distintos no tempo, um sobre texto sugerido, outro sobre texto
    // confirmado/editado pelo terapeuta.
    const sinais = detectarSinaisDeRiscoRPD({
      situacao: d.situacao,
      pensamentoAutomatico: d.pensamentoAutomatico,
      evidenciasFavor: d.evidenciasFavor,
      evidenciasContra: d.evidenciasContra,
      respostaRacional: d.respostaRacional,
      comportamentoResultante: d.comportamentoResultante,
    });

    let alertaRiscoErro: string | undefined;
    for (const sinal of sinais) {
      const r = await registrarAlertaRiscoRPD(ctx, {
        patientId: resultado.patientId,
        rpdEntryId: resultado.id!,
        responsavelId: ctx.userId,
        sinal: {
          categoria: sinal.categoria,
          severidade: sinal.severidade,
          certeza: sinal.certeza,
          trecho_fonte: sinal.trechoFonte,
          detalhe: sinal.detalhe,
        },
      });
      if ("erro" in r) alertaRiscoErro = r.erro;
    }

    return alertaRiscoErro
      ? { id: resultado.id, alertaRiscoErro }
      : { id: resultado.id };
  } catch (err) {
    if (err instanceof ConcurrencyAbortError) {
      return { error: "CONCURRENCY_ERROR" };
    }
    logarErroSemPII("aprovarRPDSugestao:", err);
    return { error: "Não foi possível aprovar a sugestão de RPD." };
  }
}

/** Sentinela interna: aborta (rollback) a transação de aprovação quando o
 * UPDATE de `extraction.estado` afeta 0 linhas (RLS ou corrida) DEPOIS que a
 * linha de `tcc_rpd_entry` já foi inserida na mesma transação — o rollback
 * desfaz o INSERT também, então nunca fica proveniência órfã. */
class ConcurrencyAbortError extends Error {}

export const aprovarRPDSugestao = comEscrita(aprovarRPDSugestaoCore);

// ─── Descarte ───────────────────────────────────────────────────────────────
// Um único UPDATE condicional (`WHERE ... AND estado = 'sugerida'`): a
// própria cláusula é o guard de concorrência (double-discard ou
// discard-after-approve afetam 0 linhas). Não apaga a extração nem toca
// `tcc_rpd_entry`/`alerta_risco_clinico` — spec RQ5.
const descartarSchema = z.object({
  extractionId: z.string().uuid("ID de extração inválido"),
});

export type DescartarRpdSugestaoResult = {
  error?: string;
  bloqueioConta?: BloqueioConta;
  ok?: boolean;
};

async function descartarRPDSugestaoCore(
  ctx: TenantContext,
  input: { extractionId: string },
): Promise<DescartarRpdSugestaoResult> {
  try {
    requireRole(ctx, "coordenador", "terapeuta");
  } catch (err) {
    if (err instanceof RoleError) return { error: err.message };
    throw err;
  }

  const parsed = descartarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }

  try {
    return await withTenant(ctx, async (tx) => {
      const rows = (await tx.execute(sql`
        UPDATE extraction SET estado = 'descartada'
         WHERE id = ${parsed.data.extractionId}::uuid
           AND subtipo = 'registro_pensamento'
           AND estado = 'sugerida'
        RETURNING id
      `)) as unknown as { id: string }[];
      if (rows.length === 0) {
        return { error: "Sugestão não encontrada ou já tratada." };
      }
      return { ok: true };
    });
  } catch (err) {
    logarErroSemPII("descartarRPDSugestao:", err);
    return { error: "Não foi possível descartar a sugestão." };
  }
}

export const descartarRPDSugestao = comEscrita(descartarRPDSugestaoCore);
