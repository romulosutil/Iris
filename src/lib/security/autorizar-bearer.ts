import { timingSafeEqual } from "node:crypto";

/**
 * Autorização por bearer fixo das rotas internas de job (A-05, #530).
 *
 * ÚNICA implementação. Antes havia quatro cópias idênticas em
 * `billing/fechar-ciclos`, `billing/conciliar`, `jobs/asr-transcrever` e
 * `jobs/exportacao-integral` — e a revisão T22 do ASR achou um defeito numa
 * delas. Cada cópia é um lugar para o mesmo bug; este é o lugar que sobrou.
 *
 * Contrato:
 * - `esperado` ausente/vazio → `false`. Deploy sem o segredo RECUSA tudo,
 *   nunca "passa porque não há token configurado" (fail-closed).
 * - Só o esquema exato `Bearer ` (caixa incluída): quem chama são os nossos
 *   scripts de job, não clientes genéricos — não há razão para leniência.
 * - Comprimento em BYTES verificado antes da comparação (`timingSafeEqual`
 *   lança em buffers de tamanhos distintos) e comparação em tempo constante.
 *
 * Cada rota passa o SEU segredo (`<SUPERFICIE>_JOB_TOKEN`). Não há fallback
 * entre segredos de superfícies diferentes: vazar o token do billing não pode
 * dar poder sobre a exportação do acervo, e vice-versa.
 */
const PREFIXO = "Bearer ";

export function autorizarBearer(
  header: string | null | undefined,
  esperado: string | undefined,
): boolean {
  if (!esperado || !header) return false;
  if (!header.startsWith(PREFIXO)) return false;
  const recebido = Buffer.from(header.slice(PREFIXO.length), "utf8");
  const segredo = Buffer.from(esperado, "utf8");
  if (recebido.length !== segredo.length) return false;
  return timingSafeEqual(recebido, segredo);
}
