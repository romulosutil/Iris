import { and, asc, eq, inArray } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, janelaTrabalho, userRole } from "@/db/schema";
import { type FaixaDia, fundirFaixasPorDia } from "@/lib/agenda/janela";
import { requireEscritaPermitida } from "@/lib/billing/guard-escrita";

export async function listarTerapeutas(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx
      .selectDistinct({
        id: appUser.id,
        name: appUser.name,
        email: appUser.email,
      })
      .from(userRole)
      .innerJoin(appUser, eq(appUser.id, userRole.userId))
      .where(
        and(
          eq(userRole.clinicId, ctx.clinicId),
          inArray(userRole.papel, ["terapeuta", "coordenador"]),
        ),
      )
      .orderBy(asc(appUser.name)),
  );
}

export async function carregarDisponibilidade(
  ctx: TenantContext,
  terapeutaId: string,
): Promise<FaixaDia[]> {
  const linhas = await withTenant(ctx, (tx) =>
    tx
      .select({
        diaSemana: janelaTrabalho.diaSemana,
        horaInicio: janelaTrabalho.horaInicio,
        horaFim: janelaTrabalho.horaFim,
      })
      .from(janelaTrabalho)
      .where(
        and(
          eq(janelaTrabalho.clinicId, ctx.clinicId),
          eq(janelaTrabalho.terapeutaId, terapeutaId),
        ),
      )
      .orderBy(asc(janelaTrabalho.diaSemana), asc(janelaTrabalho.horaInicio)),
  );
  return linhas.map((l) => ({
    diaSemana: l.diaSemana,
    horaInicio: l.horaInicio.slice(0, 5),
    horaFim: l.horaFim.slice(0, 5),
  }));
}

export async function salvarJanelas(
  ctx: TenantContext,
  terapeutaId: string,
  faixas: FaixaDia[],
): Promise<void> {
  requireRole(ctx, "coordenador");
  const fundidas = fundirFaixasPorDia(faixas);
  await withTenant(ctx, async (tx) => {
    // Retorno é `void`, então não há campo `error` onde devolver o bloqueio —
    // por isso guarda por exceção (`ContaSomenteLeituraError` propaga) em vez
    // de `comEscrita`. Primeira operação da transação: o delete abaixo é
    // destrutivo e não pode acontecer nem parcialmente numa conta bloqueada.
    await requireEscritaPermitida(tx, ctx.clinicId);
    await tx
      .delete(janelaTrabalho)
      .where(
        and(
          eq(janelaTrabalho.clinicId, ctx.clinicId),
          eq(janelaTrabalho.terapeutaId, terapeutaId),
        ),
      );
    if (fundidas.length > 0) {
      await tx
        .insert(janelaTrabalho)
        .values(
          fundidas.map((f) => ({
            clinicId: ctx.clinicId,
            terapeutaId,
            diaSemana: f.diaSemana,
            horaInicio: f.horaInicio,
            horaFim: f.horaFim,
          })),
        );
    }
  });
}
