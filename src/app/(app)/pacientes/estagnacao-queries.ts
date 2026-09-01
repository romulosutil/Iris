import "server-only";
import type { TenantContext } from "@/db/rls";

export interface PacienteEstagnado {
  id: string;
  nome: string;
}

/**
 * T11 (#512) — ponto de montagem do bloco de estagnação em `/pacientes` (C2).
 *
 * Predicado de "estagnou" é issue separada (brief §7.3,
 * `docs/ux/jornada-sessao-unificada.md:459`) — NÃO implementar aqui. Esta
 * função é um stub deliberado: devolve sempre vazio até a issue do predicado
 * decidir o que conta como estagnação (última sessão há N dias? sem sessão
 * registrada? outra régua?) e escrever a query real.
 */
export async function listarPacientesEstagnados(
  _ctx: TenantContext,
): Promise<PacienteEstagnado[]> {
  return [];
}
