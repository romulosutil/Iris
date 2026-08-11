import "server-only";
import { sql } from "drizzle-orm";
import type { TenantContext, Tx } from "@/db/rls";
import { auditLog } from "@/db/schema";

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
 * Princípios do design (D7 + D8):
 * 1. O UPDATE em `patient` é mediado por `app_desarquivar_paciente` (SECURITY DEFINER)
 *    porque terapeutas não possuem privilégio de UPDATE em `patient` (RLS 0001).
 * 2. A procedure executa a verificação completa de autorização (coordenador, equipe
 *    ou cobertura de sessão) e isolamento multi-tenant diretamente no banco.
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
