import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { TenantContext, Tx } from "@/db/rls";
import { auditLog, patient } from "@/db/schema";

export type OrigemDesarquivamento =
  | "registro_clinico"
  | "audio_local"
  | "escopo_protocolo"
  | "aprovacao_evidencia"
  | "validacao_evidencia"
  | "ativacao_protocolo"
  | "criacao_meta"
  | "prescricao_disciplina"
  | "ficha_clinica";

export const ACAO_DESARQUIVADO_AUTOMATICAMENTE =
  "paciente_desarquivado_automaticamente";

/**
 * #174 — regra 6: gravar registro clínico ou ato terapêutico para paciente
 * ARQUIVADO desarquiva automaticamente e deixa rastro na trilha de auditoria.
 *
 * Princípios do design:
 * 1. O UPDATE em `patient` é mediado por `app_desarquivar_paciente` (SECURITY DEFINER)
 *    porque terapeutas não possuem privilégio de UPDATE em `patient` (RLS 0001).
 * 2. O gate `SELECT ... WHERE arquivado_em IS NOT NULL` antes da chamada atua sob o RLS
 *    do chamador. Para quem não vê o paciente ou para pacientes já ativos, a função
 *    retorna `false` imediatamente sem custo de lock ou chamadas ao DEFINER.
 * 3. Atomicidade: Executa dentro da mesma transação `tx` da ação clínica.
 * 4. Idempotência: `app_desarquivar_paciente` só retorna `true` quando houve mutação real
 *    de `arquivado_em` (NOT NULL -> NULL), emitindo exatamente 1 linha de `audit_log`.
 */
export async function desarquivarPacienteSeArquivado(
  tx: Tx,
  ctx: TenantContext,
  patientId: string,
  origem: OrigemDesarquivamento = "registro_clinico",
): Promise<boolean> {
  const alvo = await tx
    .select({ id: patient.id })
    .from(patient)
    .where(and(eq(patient.id, patientId), isNotNull(patient.arquivadoEm)));

  if (alvo.length === 0) return false;

  const linhas = (await tx.execute(
    sql`SELECT app_desarquivar_paciente(${patientId}::uuid) AS desarquivou`,
  )) as unknown as Array<{ desarquivou: boolean }>;

  if (!linhas[0]?.desarquivou) return false;

  await tx.insert(auditLog).values({
    clinicId: ctx.clinicId,
    atorId: ctx.userId,
    acao: ACAO_DESARQUIVADO_AUTOMATICAMENTE,
    entidade: "patient",
    entidadeId: patientId,
    patientId,
    detalhe: { origem },
  });

  return true;
}
