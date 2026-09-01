// Colapso da aprovação por sessão (jornada-sessao-unificada.md §3.5, §7.5).
// R-07/R-08: o predicado deriva SÓ da sessão passada — nunca de contagem de
// membros da clínica, nunca de "é a única pessoa no papel de coordenação".
// Um helper que leia mais de uma sessão para decidir isso é rejeição em
// revisão de PR, não sugestão: ver spec.md R-08 e a nota de mutação em
// tasks.md T05. Assinatura recebe UMA sessão — nunca lista, nunca clínica.
import type { TenantContext } from "@/db/rls";

export type SessaoParaAprovacao = {
  terapeutaId: string;
};

export function podeAutoValidar(
  ctx: TenantContext,
  session: SessaoParaAprovacao,
): boolean {
  return ctx.role === "coordenador" && ctx.userId === session.terapeutaId;
}
