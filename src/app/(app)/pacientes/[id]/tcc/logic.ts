import "server-only";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { clinic, tccRpdEntry } from "@/db/schema";
import { comEscrita, type BloqueioConta } from "@/lib/billing/guard-escrita";
import { desarquivarPacienteSeArquivado } from "@/lib/patient/desarquivamento";

import {
  DISTORCOES_COGNITIVAS_OPCOES,
  DISTORCOES_COGNITIVAS_SLUGS,
  salvarRpdSchema,
  type SalvarRpdInput,
} from "./constants";

export {
  DISTORCOES_COGNITIVAS_OPCOES,
  DISTORCOES_COGNITIVAS_SLUGS,
  salvarRpdSchema,
  type SalvarRpdInput,
};

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
  const distorcoes =
    d.distorcoesCognitivas && d.distorcoesCognitivas.length > 0
      ? d.distorcoesCognitivas
      : null;

  try {
    return await withTenant(ctx, async (tx) => {
      // #389 — taxonomia de distorções é config por clínica (R19, não
      // enum/CHECK fixo). Rejeita slug fora da lista da clínica ANTES do
      // insert: um erro de validação não pode gravar linha parcial.
      if (distorcoes) {
        const [clinicRow] = await tx
          .select({ taxonomiaDistorcoes: clinic.taxonomiaDistorcoes })
          .from(clinic)
          .where(eq(clinic.id, ctx.clinicId));
        const taxonomia = (clinicRow?.taxonomiaDistorcoes as string[]) ?? [];
        const slugInvalido = distorcoes.find(
          (slug) => !taxonomia.includes(slug),
        );
        if (slugInvalido) {
          return {
            error: `Distorção "${slugInvalido}" não pertence à taxonomia da clínica.`,
          };
        }
      }

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
          credibilidadeInicial: d.credibilidadeInicial ?? null,
          evidenciasFavor: d.evidenciasFavor ?? null,
          evidenciasContra: d.evidenciasContra ?? null,
          respostaRacional: d.respostaRacional ?? null,
          credibilidadeAlternativa: d.credibilidadeAlternativa ?? null,
          distorcoesCognitivas: distorcoes,
          comportamentoResultante: d.comportamentoResultante ?? null,
          intensidadePos: d.intensidadePos ?? null,
          criadoPor: ctx.userId,
        })
        .returning({ id: tccRpdEntry.id });

      await desarquivarPacienteSeArquivado(
        tx,
        ctx,
        d.patientId,
        "registro_clinico",
      );

      return { id: row!.id };
    });
  } catch (err) {
    console.error("salvarRPD:", err);
    return { error: "Não foi possível salvar o RPD." };
  }
}

export const salvarRPD = comEscrita(salvarRPDCore);

export async function obterRPDEntries(ctx: TenantContext, patientId: string) {
  requireRole(ctx, "coordenador", "terapeuta", "admin_recepcao");
  return await withTenant(ctx, async (tx) => {
    return await tx
      .select()
      .from(tccRpdEntry)
      .where(eq(tccRpdEntry.patientId, patientId))
      .orderBy(desc(tccRpdEntry.criadoEm));
  });
}
