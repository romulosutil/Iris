import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { patientProtocol } from "@/db/schema";

/**
 * Ativa um protocolo de referência para o paciente. Só coordenador. Vínculo é
 * append-only: desativar nunca deleta, só marca `desativadoEm` (histórico).
 */
export async function ativarProtocolo(
  ctx: TenantContext,
  patientId: string,
  protocolId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  if (!protocolId) return { error: "Selecione um protocolo." };
  await withTenant(ctx, (tx) =>
    tx
      .insert(patientProtocol)
      .values({ patientId, protocolId, ativadoPor: ctx.userId }),
  );
  return {};
}

export async function desativarProtocolo(
  ctx: TenantContext,
  patientProtocolId: string,
): Promise<{ error?: string }> {
  requireRole(ctx, "coordenador");
  await withTenant(ctx, (tx) =>
    tx
      .update(patientProtocol)
      // Data no fuso do Brasil, resolvida pelo Postgres — evita que uma ação à
      // noite (UTC-3) grave o dia seguinte por causa do UTC (Jules WARN).
      .set({ desativadoEm: sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date` })
      .where(eq(patientProtocol.id, patientProtocolId)),
  );
  return {};
}
