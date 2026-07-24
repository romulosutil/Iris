import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, RoleError } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { evidence, extraction, reinforcerProfile, session } from "@/db/schema";
import { drizzleMaterializarQueries, materializarSnapshot } from "@/lib/evidence/materializar";
import { type Alvo, drizzleResolverQueries, resolverAlvoParaFks } from "@/lib/evidence/resolver";

// ─── Inserção de `evidence` on-approve (Fase 4 · §4 da spec de resolução
// slug→UUID) ───────────────────────────────────────────────────────────────
// Até a Fase 4, só `scripts/backfill-evidence.ts` gravava `evidence`. Agora a
// própria aprovação/edição grava — 1 linha por alvo de `alvos[]`, no grão de
// alvo (`alvo_ordinal` = posição no array), reaproveitando o resolvedor
// compartilhado. Roda DENTRO da mesma transação da revisão (RLS de
// `evidence_insert` já libera terapeuta dono + coordenador da equipe — ver
// db/migrations/0016_fase4_session_snapshot_rls.sql).

type EvidenciaConteudo = {
  alvos?: Alvo[];
  [key: string]: unknown;
};

type ExtracaoAprovadaRow = {
  id: string;
  sessionId: string;
  subtipo: string;
  payload: unknown;
  payloadEditado: unknown;
};

// ─── Inserção de `reinforcer_profile` on-approve (Fase 4 · 4C.1) ───────────
// Perfil vivo de reforçadores (modelo-de-dados.md §1.4): 1 linha por
// OBSERVAÇÃO (append-per-observation), nunca upsert-por-item — preserva
// recência + valência como série, para que `saciado` possa demover um item
// visto antes como reforçador forte. O Briefing lê most-recent-per-item
// depois. Mesmo padrão de idempotência de `evidence` (chave estável,
// discriminador de re-aprovação), aqui `(extraction_id, item_atividade)`.
type ReinforcerValencia = "alta" | "baixa" | "saciado";
const REINFORCER_VALENCIAS: readonly ReinforcerValencia[] = ["alta", "baixa", "saciado"];
type PreferenciaReforcadorConteudo =
  | { item_atividade?: string; valencia?: string }
  | null
  | undefined;

async function inserirReforcadoresOnApprove(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  ctx: TenantContext,
  row: ExtracaoAprovadaRow,
  sess: { patientId: string; numero: number | null },
): Promise<void> {
  if (row.subtipo !== "preferencia_reforcador") return;
  if (sess.numero == null) return; // mesma trava de session ainda não consolidada (ver evidence acima)

  const conteudo = (row.payloadEditado ?? row.payload) as {
    preferencia_reforcador?: PreferenciaReforcadorConteudo;
  };
  const pref = conteudo?.preferencia_reforcador;
  const itemAtividade = pref?.item_atividade?.trim();
  const valenciaBruta = pref?.valencia;
  if (!itemAtividade || !valenciaBruta) return;
  if (!REINFORCER_VALENCIAS.includes(valenciaBruta as ReinforcerValencia)) return;
  const valencia = valenciaBruta as ReinforcerValencia;

  await tx
    .insert(reinforcerProfile)
    .values({
      extractionId: row.id,
      patientId: sess.patientId,
      sessionId: row.sessionId,
      sessionNumero: sess.numero,
      itemAtividade,
      valencia,
    })
    // idempotente: (extraction_id, item_atividade) é a chave — re-aprovar (ou
    // reprocessar) não duplica.
    .onConflictDoNothing({
      target: [reinforcerProfile.extractionId, reinforcerProfile.itemAtividade],
    });
}

async function inserirEvidenciasOnApprove(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  ctx: TenantContext,
  row: ExtracaoAprovadaRow,
): Promise<void> {
  const [sess] = await tx
    .select({ patientId: session.patientId, numero: session.numeroSequencialPaciente })
    .from(session)
    .where(eq(session.id, row.sessionId));
  if (!sess) return;

  // ⚠️ BLINDAGEM DE ADVISORY LOCK: Lock por paciente para serializar recomputações concorrentes de snapshot.
  // Nenhuma chamada externa lenta (como APIs de IA ou rede) pode ocorrer após a aquisição deste lock.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${sess.patientId}::text, 0))`);

  if (sess.numero == null) {
    // TODO(Fase 4): sessão ainda não consolidada (numero_sequencial_paciente
    // nulo) — `evidence.session_numero` é NOT NULL, não dá pra inserir agora.
    // A aprovação pode acontecer antes da consolidação da sessão (revisão
    // assíncrona); quando a sessão for consolidada depois, o backfill
    // (scripts/backfill-evidence.ts) cobre a lacuna retroativamente. Não
    // falha a aprovação por causa disso — só registra e segue.
    console.warn(
      `evidence: extração ${row.id} aprovada, mas sessão ${row.sessionId} ainda sem numero_sequencial_paciente — evidence/reinforcer_profile NÃO inseridos agora (backfill cobre evidence depois).`,
    );
    return;
  }

  await inserirReforcadoresOnApprove(tx, ctx, row, sess);

  if (row.subtipo !== "evidencia") return;

  const conteudo = (row.payloadEditado ?? row.payload) as { evidencia?: EvidenciaConteudo | null };
  const evidenciaObj = conteudo?.evidencia;
  const alvos = Array.isArray(evidenciaObj?.alvos) ? evidenciaObj!.alvos! : [];
  if (alvos.length === 0) return;

  const resolverQueries = drizzleResolverQueries(tx);
  const { alvos: _omit, ...evidenciaSemAlvos } = evidenciaObj ?? {};

  for (let ordinal = 0; ordinal < alvos.length; ordinal++) {
    const alvo = alvos[ordinal]!;
    const { protocolId, goalId, milestoneId, protocolSlug, dominioId, goalRef } =
      await resolverAlvoParaFks(
        resolverQueries,
        { clinicId: ctx.clinicId, patientId: sess.patientId },
        alvo,
      );
    // classificacao_original: cópia congelada do alvo aprovado, mesclada com o
    // conteúdo clínico de `evidencia` (sem o array `alvos` completo, que não é
    // escopo desta linha) — mesmo padrão do backfill.
    const classificacaoOriginal = { ...evidenciaSemAlvos, alvo };

    await tx
      .insert(evidence)
      .values({
        extractionId: row.id,
        patientId: sess.patientId,
        sessionId: row.sessionId,
        sessionNumero: sess.numero,
        alvoOrdinal: ordinal,
        protocolSlug,
        dominioId,
        goalRef,
        protocolId,
        goalId,
        milestoneId,
        classificacaoOriginal,
        aprovadoPor: ctx.userId,
      })
      // idempotente: (extraction_id, alvo_ordinal) é a chave — re-aprovar (ou
      // reprocessar) não duplica.
      .onConflictDoNothing({ target: [evidence.extractionId, evidence.alvoOrdinal] });
  }

  // Materialização real (4B — segmentação/repertório em TS puro, ver
  // src/lib/evidence/materializar.ts). Recompute a partir de `sess.numero`
  // (a sessão recém-aprovada) em diante, na mesma transação da inserção de
  // evidence acima.
  await materializarSnapshot(drizzleMaterializarQueries(tx), sess.patientId, sess.numero);
}

// Revisão humana das extrações sugeridas pela IA (Fase 3 Plano 2). Cada ação
// transiciona uma extração `sugerida` ou `erro_validacao` para um desfecho de revisão. RLS
// (extraction_update, 0006) restringe ao terapeuta dono da sessão; requireRole
// barra recepção/coordenação (quem revisa é o terapeuta que conduziu).
// A sugestão ORIGINAL da IA (payload) nunca é sobrescrita — edições vão em
// payload_editado (auditoria Camada 1). Contadores de candidatura (Fase 4)
// deliberadamente NÃO são tocados aqui (máquina dormente até a Fase 4).

const idSchema = z.object({ extractionId: z.string().uuid() });

export type ReviewResult = { error?: string; ok?: boolean };

async function transicionar(
  ctx: TenantContext,
  extractionId: string,
  versaoCliente: number,
  set: Record<string, unknown>,
): Promise<ReviewResult> {
  requireRole(ctx, "terapeuta", "coordenador");
  let success = false;
  let errorMsg = "";

  try {
    const rows = await withTenant(ctx, async (tx) => {
      // ⚠️ OCC: A query de mutação incrementa a versão de forma atômica e confere com a versão vista pelo cliente
      const updated = await tx
        .update(extraction)
        .set({
          ...set,
          revisadoPor: ctx.userId,
          revisadoEm: new Date(),
          versao: sql`${extraction.versao} + 1`,
        })
        .where(
          and(
            eq(extraction.id, extractionId),
            eq(extraction.versao, versaoCliente),
            sql`${extraction.estado} IN ('sugerida', 'erro_validacao')`,
          ),
        )
        .returning({
          id: extraction.id,
          sessionId: extraction.sessionId,
          subtipo: extraction.subtipo,
          payload: extraction.payload,
          payloadEditado: extraction.payloadEditado,
        });

      if (updated.length === 0) {
        return [];
      }

      const novoEstado = set.estado;
      if (novoEstado === "aprovada" || novoEstado === "editada") {
        await inserirEvidenciasOnApprove(tx, ctx, updated[0]!);
      }
      success = true;
      return updated;
    });

    if (!success) {
      return { ok: false, error: "CONCURRENCY_ERROR" };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("Erro na transição da extração:", err);
    errorMsg = err instanceof Error ? err.message : String(err);

    // DLQ / Dead-Letter State: Se o pipeline quebrar, movemos a extração para 'erro_validacao' de forma autônoma
    try {
      await withTenant(ctx, async (tx) => {
        await tx
          .update(extraction)
          .set({
            estado: "erro_validacao",
            payloadEditado: { error: errorMsg },
            versao: sql`${extraction.versao} + 1`,
          })
          .where(eq(extraction.id, extractionId));
      });
    } catch (dbErr) {
      console.error("Falha ao persistir erro de validação (DLQ):", dbErr);
    }

    return { error: `Erro de validação clínica: ${errorMsg}` };
  }
}

export async function aprovarExtracao(
  ctx: TenantContext,
  input: { extractionId: string; versao: number },
): Promise<ReviewResult> {
  const p = z.object({ extractionId: z.string().uuid(), versao: z.number() }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, p.data.versao, { estado: "aprovada" });
}

export async function descartarExtracao(
  ctx: TenantContext,
  input: { extractionId: string; versao: number },
): Promise<ReviewResult> {
  const p = z.object({ extractionId: z.string().uuid(), versao: z.number() }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, p.data.versao, { estado: "descartada" });
}

const editarSchema = z.object({
  extractionId: z.string().uuid(),
  payloadEditado: z.record(z.unknown()),
  versao: z.number(),
});

export async function editarExtracao(
  ctx: TenantContext,
  input: { extractionId: string; payloadEditado: Record<string, unknown>; versao: number },
): Promise<ReviewResult> {
  const p = editarSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]!.message };
  return transicionar(ctx, p.data.extractionId, p.data.versao, {
    estado: "editada",
    payloadEditado: p.data.payloadEditado,
  });
}
