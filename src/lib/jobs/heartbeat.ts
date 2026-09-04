/**
 * #536 (DA-03) — heartbeat, no banco, dos jobs cujo trabalho acontece numa
 * ROTA do app e não no `.mjs` agendado.
 *
 * billing (fechar-ciclos, conciliar), exportacao-integral e asr-transcrever
 * têm trilho `.mjs` fetch-only por desenho (`infra/billing/Dockerfile`: zero
 * `npm install`, zero banco — lição da #156). O script não consegue gravar
 * heartbeat; a rota, que é onde o trabalho de fato acontece, consegue. E é o
 * sinal mais honesto: um agendador que dispara contra um app caído não
 * "rodou" nada.
 *
 * Espelho de `scripts/lib/heartbeat.mjs`, com as mesmas regras:
 *  - `detalhe` só carrega números/booleanos (`detalheSemPii`) ou `name`+`code`
 *    de erro — nunca `message` (a de `DrizzleQueryError` traz SQL + params);
 *  - NUNCA lança: um heartbeat que falha não pode transformar uma passada
 *    bem-sucedida em 500 nem mascarar o erro real. O canal para essa falha é
 *    o detector (ausência de heartbeat = alarme).
 *
 * Roda como `app_role` (cliente `sql` cru, fora de tenant — a função definer
 * `app_job_heartbeat_gravar` não toca tabela de tenant). Sem `withTenant`:
 * não há clínica num tick de job.
 */
import { sql } from "@/db/client";
import { codigoPg } from "@/db/pg-error";
import { logarAvisoSemPII } from "@/lib/observabilidade/logar-erro";

/** Nomes válidos — casam com `LIMITES_HEARTBEAT` em scripts/alarme-jobs.mjs. */
export type JobComHeartbeatNaRota =
  "billing" | "conciliacao" | "exportacao" | "asr";

export function detalheSemPii(
  contagens: Record<string, unknown> | null | undefined,
): string {
  return Object.entries(contagens ?? {})
    .filter(
      ([, v]) =>
        typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)),
    )
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
}

export function detalheDoErro(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const code = codigoPg(err) ?? "";
  return `erro=${name || "desconhecido"}${code ? ` code=${code}` : ""}`;
}

export async function registrarHeartbeat(
  job: JobComHeartbeatNaRota,
  ok: boolean,
  detalhe = "",
): Promise<boolean> {
  try {
    await sql`SELECT app_job_heartbeat_gravar(${job}, ${ok}, ${detalhe})`;
    return true;
  } catch (err) {
    // `logarAvisoSemPII`, e não `logger.warn`: o que se loga aqui É um erro do
    // banco, e a `message` do driver é o SQL + os params — que num `UPDATE` do
    // diário é a nota clínica. O helper reduz ao conjunto fechado (classe do
    // erro, SQLSTATE, constraint, hash) antes de chegar ao registro.
    //
    // A frase inteira virou campo: `job` é o que se filtra, e a consequência
    // ("o detector de alarme vai acusar") é documentação, não dado de log.
    logarAvisoSemPII("heartbeat.gravacao-falhou", err, { job });
    return false;
  }
}
