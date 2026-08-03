/**
 * Job de Expurgo e Retenção de AuditLog — Marco Civil Art. 15 (#116).
 *
 * UMA varredura e SAI. Agendado via comando no Easypanel (ou cron).
 *
 * O QUE ELE FAZ:
 * 1. Chama `app_pseudonimizar_audit_log_orfao()`: pseudonimiza os logs de contas de usuário deletadas.
 * 2. Chama `app_expurgar_audit_log_expirado()`: exclui fisicamente os logs com mais de 180 dias de idade.
 *
 * Execução:
 *   node scripts/expurgo-audit-log.mjs
 */

import postgres from "postgres";
import { fileURLToPath } from "node:url";

/**
 * Função pura de verificação de elegibilidade (utilizada em testes unitários).
 */
export function verificarElegibilidadeExpurgoAuditLog(criadoEm, agora = new Date()) {
  const centoEOitoDiasMs = 180 * 24 * 60 * 60 * 1000;
  return agora.getTime() - criadoEm.getTime() >= centoEOitoDiasMs;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[expurgo-audit-log] ERRO: DATABASE_URL não informada.");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1 });

  try {
    const agora = new Date().toISOString();
    console.log(`[expurgo-audit-log] ${agora} Iniciando varredura de expurgo (Marco Civil #116)...`);

    const [{ count: pseudonimizados }] = await sql`SELECT app_pseudonimizar_audit_log_orfao() AS count`;
    console.log(`[expurgo-audit-log] Logs órfãos pseudonimizados: ${pseudonimizados}`);

    const [{ count: expurgados }] = await sql`SELECT app_expurgar_audit_log_expirado() AS count`;
    console.log(`[expurgo-audit-log] Logs expirados (180+ dias) expurgados: ${expurgados}`);

    console.log(`[expurgo-audit-log] Varredura concluída com sucesso.`);
  } catch (err) {
    console.error("[expurgo-audit-log] Erro durante a varredura:", err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
