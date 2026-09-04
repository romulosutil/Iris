"use server";

// Server actions de bloqueio de agenda (#559, fatia F3 · achado A-02).
//
// Moradia em `src/lib/agenda/` e não na rota `agenda/`: os únicos chamadores
// são formulários de OUTRAS rotas (`clinica/feriados`,
// `equipe/[id]`, `pacientes/[id]/ausencias`) — a própria agenda não usa nada
// daqui. Rota importando rota era o padrão que a auditoria 360 apontou.
//
// `"use server"` continua NECESSÁRIO e fica só aqui: a diretiva é do MÓDULO e
// propaga por importação, e é ela que transforma estas funções em endpoint
// para o `useActionState` dos formulários cliente. Nenhum módulo puro de
// `src/lib/agenda/` importa este arquivo, então a diretiva não vaza.
//
// Nenhuma função exportada aceita `ctx`/`TenantContext` do chamador (achado
// #55): o tenant é resolvido AQUI dentro, por `getTenantContext()`. O núcleo
// ctx-accepting mora em `bloqueio-queries.ts`, que NÃO tem a diretiva.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import { RoleError, requireRole } from "@/auth/require-role";
import { withTenant } from "@/db/rls";
import { bloqueio } from "@/db/schema";
import { validarBloqueio } from "@/lib/agenda/bloqueio";
import { logarErroSemPII } from "@/lib/observabilidade/logar-erro";

export type BloqueioState = { error?: string; ok?: boolean };

export async function criarBloqueioAction(
  _prev: BloqueioState,
  formData: FormData,
): Promise<BloqueioState> {
  const ctx = await getTenantContext();
  const validado = validarBloqueio({
    escopo: formData.get("escopo")?.toString(),
    terapeutaId: formData.get("terapeutaId")?.toString(),
    patientId: formData.get("patientId")?.toString(),
    dataInicio: formData.get("dataInicio")?.toString(),
    dataFim: formData.get("dataFim")?.toString(),
    motivo: formData.get("motivo")?.toString(),
  });
  if (!validado.ok) return { error: validado.error };
  try {
    requireRole(ctx, "coordenador");
    await withTenant(ctx, (tx) =>
      tx.insert(bloqueio).values({ clinicId: ctx.clinicId, ...validado.valor }),
    );
    const caminho = formData.get("caminho")?.toString();
    if (caminho) revalidatePath(caminho);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Você não tem permissão para registrar bloqueios." };
    logarErroSemPII("criarBloqueioAction:", err);
    return { error: "Não foi possível registrar o bloqueio. Tente novamente." };
  }
}

export async function removerBloqueioAction(
  _prev: BloqueioState,
  formData: FormData,
): Promise<BloqueioState> {
  const ctx = await getTenantContext();
  const id = formData.get("id")?.toString() ?? "";
  try {
    requireRole(ctx, "coordenador");
    await withTenant(ctx, (tx) =>
      tx
        .delete(bloqueio)
        .where(and(eq(bloqueio.clinicId, ctx.clinicId), eq(bloqueio.id, id))),
    );
    const caminho = formData.get("caminho")?.toString();
    if (caminho) revalidatePath(caminho);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoleError)
      return { error: "Você não tem permissão para remover bloqueios." };
    logarErroSemPII("removerBloqueioAction:", err);
    return { error: "Não foi possível remover. Tente novamente." };
  }
}
