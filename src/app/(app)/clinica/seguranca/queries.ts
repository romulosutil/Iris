import { and, asc, eq, inArray } from "drizzle-orm";
import { requireRole } from "@/auth/require-role";
import { withTenant, type TenantContext } from "@/db/rls";
import { appUser, userRole } from "@/db/schema";
import {
  classificarPosturaSeguranca,
  type PosturaSeguranca,
  type VinculoMembro,
} from "./logic";

/**
 * Estado de ativação do segundo fator da equipe da clínica ativa.
 *
 * Lê `app_user.two_factor_enabled` pela policy `app_user_read`, que já entrega
 * ao `app_role` as linhas dos colegas da clínica — o mesmo caminho de
 * `listarTerapeutas`. A credencial `two_factor` continua fora do alcance do
 * `app_role` e não é tocada aqui: nenhuma leitura atravessa a fronteira de
 * tenant, logo não há `SECURITY DEFINER` nem migração nesta feature.
 *
 * `listarTerapeutas` não serve: ela filtra `["terapeuta","coordenador"]` e
 * deixa `admin_recepcao` de fora, que é justamente o papel de quem opera sem
 * MFA obrigatório — o único risco real que esta tela mostra.
 */
export async function carregarPosturaSeguranca(
  ctx: TenantContext,
): Promise<PosturaSeguranca> {
  // O layout de `/clinica` já é o dono da autorização, mas o teste de
  // isolamento não pode depender dele para provar que a leitura é restrita:
  // o guard vive junto da query.
  requireRole(ctx, "coordenador");

  const vinculos = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: appUser.id,
        nome: appUser.name,
        email: appUser.email,
        papel: userRole.papel,
        mfaAtivo: appUser.twoFactorEnabled,
      })
      .from(userRole)
      .innerJoin(appUser, eq(appUser.id, userRole.userId))
      .where(
        and(
          eq(userRole.clinicId, ctx.clinicId),
          inArray(userRole.papel, [
            "terapeuta",
            "coordenador",
            "admin_recepcao",
          ]),
        ),
      )
      .orderBy(asc(appUser.name)),
  );

  return classificarPosturaSeguranca(vinculos as VinculoMembro[]);
}
