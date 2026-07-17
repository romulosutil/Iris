"use server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError, requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, janelaTrabalho, userRole } from "@/db/schema";
import { type FaixaDia, fundirFaixasPorDia } from "@/lib/agenda/janela";

export type SalvarJanelasState = { error?: string; ok?: boolean };

export async function listarTerapeutas(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx
      .select({ id: appUser.id, name: appUser.name, email: appUser.email })
      .from(userRole)
      .innerJoin(appUser, eq(appUser.id, userRole.userId))
      .where(and(eq(userRole.clinicId, ctx.clinicId), eq(userRole.papel, "terapeuta")))
      .orderBy(asc(appUser.name)),
  );
}

export async function carregarDisponibilidade(ctx: TenantContext, terapeutaId: string): Promise<FaixaDia[]> {
  const linhas = await withTenant(ctx, (tx) =>
    tx
      .select({ diaSemana: janelaTrabalho.diaSemana, horaInicio: janelaTrabalho.horaInicio, horaFim: janelaTrabalho.horaFim })
      .from(janelaTrabalho)
      .where(and(eq(janelaTrabalho.clinicId, ctx.clinicId), eq(janelaTrabalho.terapeutaId, terapeutaId)))
      .orderBy(asc(janelaTrabalho.diaSemana), asc(janelaTrabalho.horaInicio)),
  );
  return linhas.map((l) => ({ diaSemana: l.diaSemana, horaInicio: l.horaInicio.slice(0, 5), horaFim: l.horaFim.slice(0, 5) }));
}

export async function salvarJanelas(ctx: TenantContext, terapeutaId: string, faixas: FaixaDia[]): Promise<void> {
  requireRole(ctx, "coordenador"); // defesa-em-profundidade; RLS é a fronteira
  const fundidas = fundirFaixasPorDia(faixas);
  await withTenant(ctx, async (tx) => {
    await tx.delete(janelaTrabalho).where(and(eq(janelaTrabalho.clinicId, ctx.clinicId), eq(janelaTrabalho.terapeutaId, terapeutaId)));
    if (fundidas.length > 0) {
      await tx.insert(janelaTrabalho).values(
        fundidas.map((f) => ({ clinicId: ctx.clinicId, terapeutaId, diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFim: f.horaFim })),
      );
    }
  });
}

export async function salvarJanelasAction(_prev: SalvarJanelasState, formData: FormData): Promise<SalvarJanelasState> {
  const ctx = await getTenantContext();
  const terapeutaId = String(formData.get("terapeutaId") ?? "");
  let faixas: FaixaDia[];
  try {
    faixas = JSON.parse(String(formData.get("faixas") ?? "[]"));
  } catch {
    return { error: "Dados de disponibilidade inválidos." };
  }
  try {
    await salvarJanelas(ctx, terapeutaId, faixas);
    revalidatePath(`/equipe/${terapeutaId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError) return { error: "Você não tem permissão para editar disponibilidade." };
    console.error("salvarJanelasAction:", err);
    return { error: "Não foi possível salvar. Tente novamente." };
  }
}
