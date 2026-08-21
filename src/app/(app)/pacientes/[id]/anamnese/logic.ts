import "server-only";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { anamnese, anamneseAlvo } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { salvarRascunhoSchema } from "./schemas";

/**
 * #407 T09 — persistência de rascunho de anamnese (ANAM-02/ANAM-10).
 *
 * Propositalmente NÃO toca a linha do tempo clínica: nenhuma `goal`, nenhum
 * `session_snapshot`. Um rascunho é material de trabalho do avaliador — só
 * vira meta/marco quando validado (T10/T14). Por isso este core não chama
 * `criarMeta` nem `desarquivarPacienteSeArquivado` (aquele é o efeito colateral
 * que `criarMetaCore`, em `../metas/logic.ts`, dispara — e que aqui não pode
 * acontecer).
 */
type AnamneseState = { error?: string; bloqueioConta?: BloqueioConta };

async function salvarRascunhoAnamneseCore(
  ctx: TenantContext,
  input: z.input<typeof salvarRascunhoSchema>,
): Promise<AnamneseState & { id?: string }> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = salvarRascunhoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const d = parsed.data;
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(anamnese)
        .values({
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          estado: "rascunho",
          criadoPor: ctx.userId,
        })
        .returning({ id: anamnese.id });
      await tx.insert(anamneseAlvo).values(
        d.alvos.map((alvo) => ({
          anamneseId: row!.id,
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          eixo: alvo.eixo,
          descricao: alvo.descricao,
          disciplina: alvo.disciplina ?? null,
          milestoneId: alvo.milestone_id ?? null,
          nivelAjudaInicial: alvo.nivel_ajuda_inicial,
          procedencia: alvo.procedencia,
          criterioN: alvo.criterio_n,
          criterioM: alvo.criterio_m,
          cicloRevisaoSemanas: alvo.ciclo_revisao_semanas,
        })),
      );
      return { id: row!.id };
    });
  } catch (err) {
    console.error("salvarRascunhoAnamnese:", err);
    return { error: "Não foi possível salvar o rascunho de anamnese." };
  }
}

export const salvarRascunhoAnamnese = comEscrita(salvarRascunhoAnamneseCore);
