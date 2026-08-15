import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { tccRpdEntry } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";

import {
  DISTORCOES_COGNITIVAS_OPCOES,
  salvarRpdSchema,
  type SalvarRpdInput,
} from "./constants";

export { DISTORCOES_COGNITIVAS_OPCOES, salvarRpdSchema, type SalvarRpdInput };

type RpdState = { error?: string; bloqueioConta?: BloqueioConta; id?: string };

async function salvarRPDCore(
  ctx: TenantContext,
  input: SalvarRpdInput,
): Promise<RpdState> {
  requireRole(ctx, "coordenador", "terapeuta");
  const parsed = salvarRpdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }
  const d = parsed.data;

  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(tccRpdEntry)
        .values({
          clinicId: ctx.clinicId,
          patientId: d.patientId,
          sessionId: d.sessionId ?? null,
          situacao: d.situacao,
          pensamentoAutomatico: d.pensamentoAutomatico,
          emocao: d.emocao,
          intensidade: d.intensidade,
          distorcaoCognitiva: d.distorcaoCognitiva,
          respostaRacional: d.respostaRacional,
          intensidadePos: d.intensidadePos ?? null,
          criadoPor: ctx.userId,
        })
        .returning({ id: tccRpdEntry.id });

      await desarquivarPacienteSeArquivado(tx, ctx, d.patientId, "registro_clinico");

      return { id: row!.id };
    });
  } catch (err) {
    console.error("salvarRPD:", err);
    return { error: "Não foi possível salvar o RPD." };
  }
}

export const salvarRPD = comEscrita(salvarRPDCore);

export async function obterRPDEntries(ctx: TenantContext, patientId: string) {
  // admin_recepcao não vê dado clínico (RLS já barra a leitura; aqui evitamos
  // vazar o dado no retorno da função antes mesmo da policy ser avaliada).
  requireRole(ctx, "coordenador", "terapeuta");
  return await withTenant(ctx, async (tx) => {
    return await tx
      .select()
      .from(tccRpdEntry)
      .where(eq(tccRpdEntry.patientId, patientId))
      .orderBy(desc(tccRpdEntry.criadoEm));
  });
}
