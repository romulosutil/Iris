/**
 * Job de Expurgo e Retenção do AuditLog — Marco Civil Art. 15 (#116, #536).
 *
 * UMA varredura e SAI. Agendado via comando no Easypanel (ou cron).
 *
 * O QUE ELE FAZ:
 * 1. `app_pseudonimizar_audit_log_orfao()` (0070): pseudonimiza os logs de
 *    contas de usuário deletadas.
 * 2. `app_expurgar_audit_log_expirado_por_acao()` (0142): apaga SÓ LOG DE
 *    ACESSO com mais de 180 dias — allowlist por `acao`, fail-closed (D-AUD-4).
 *    Trilha clínica/governança (reclassificação, aprovação, exportação, alerta,
 *    expurgo de paciente…) acompanha o prontuário e NUNCA é apagada por idade.
 *    A função devolve a contagem por `acao`, e é isso que vai para o log — só
 *    nomes de ação e números, nunca id, ator ou detalhe.
 * 3. Grava o heartbeat em `job_heartbeat` (0143) — é o que o detector
 *    `scripts/alarme-jobs.mjs` lê para saber se este job existe e roda.
 *
 * Env:
 *   EXPURGO_DATABASE_URL  role de login que herda `iris_expurgo_audit_log`
 *                         (0142). Obrigatória e SEM fallback para DATABASE_URL:
 *                         `app_role` não tem EXECUTE nas funções do expurgo
 *                         (nunca teve — a 0070 revogou de PUBLIC e não concedeu
 *                         a ninguém), então o fallback só trocaria "não roda"
 *                         por "roda e estoura 42501 a cada tick".
 *
 * Exit code: 0 = varredura completa. 1 = qualquer falha (env ausente, função
 * levantou, banco fora do ar) — o heartbeat de erro é gravado antes de sair,
 * quando a conexão permite.
 *
 * Execução:
 *   node scripts/expurgo-audit-log.mjs
 */

import postgres from "postgres";
import { pathToFileURL } from "node:url";
import {
  detalheDoErro,
  detalheSemPii,
  gravarHeartbeat,
} from "./lib/heartbeat.mjs";

// Nome deste job em `job_heartbeat` — casa com `LIMITES_HEARTBEAT` em
// scripts/alarme-jobs.mjs. Mudar um sem o outro cega o detector.
export const JOB = "expurgo-audit-log";

const PREFIXO = "[expurgo-audit-log]";

/**
 * Função pura de verificação de elegibilidade (utilizada em utilitários de data).
 */
export function verificarElegibilidadeExpurgoAuditLog(
  criadoEm,
  agora = new Date(),
) {
  const centoEOitentaDiasMs = 180 * 24 * 60 * 60 * 1000;
  return agora.getTime() - criadoEm.getTime() >= centoEOitentaDiasMs;
}

/**
 * Executa as rotinas SQL de pseudonimização e expurgo no banco.
 *
 * Devolve as contagens e a quebra por `acao` do expurgo. Propaga qualquer
 * erro: o chamador decide o exit code e o heartbeat.
 */
export async function executarExpurgoAuditLog(sql) {
  const [{ count: pseudonimizados }] =
    await sql`SELECT app_pseudonimizar_audit_log_orfao() AS count`;
  const linhas =
    await sql`SELECT acao, apagadas FROM app_expurgar_audit_log_expirado_por_acao()`;

  const porAcao = {};
  let expurgados = 0;
  for (const l of linhas) {
    porAcao[l.acao] = Number(l.apagadas);
    expurgados += Number(l.apagadas);
  }

  return {
    pseudonimizados: Number(pseudonimizados),
    expurgados,
    porAcao,
  };
}

/**
 * Varredura + heartbeat. Exportada para o teste: é aqui que mora a regra
 * "heartbeat ok só em varredura completa; heartbeat de erro antes de propagar".
 */
export async function executar(sql) {
  let resultado;
  try {
    resultado = await executarExpurgoAuditLog(sql);
  } catch (err) {
    await gravarHeartbeat(sql, JOB, {
      ok: false,
      detalhe: detalheDoErro(err),
    });
    throw err;
  }

  console.log(
    `${PREFIXO} Logs órfãos pseudonimizados: ${resultado.pseudonimizados}`,
  );
  console.log(
    `${PREFIXO} Logs de acesso expirados (180+ dias) expurgados: ${resultado.expurgados}`,
  );
  // Só nome de ação e contagem — a função não devolve outra coisa.
  for (const [acao, n] of Object.entries(resultado.porAcao)) {
    console.log(`${PREFIXO}   ${acao}: ${n}`);
  }

  await gravarHeartbeat(sql, JOB, {
    ok: true,
    detalhe: detalheSemPii({
      pseudonimizados: resultado.pseudonimizados,
      expurgados: resultado.expurgados,
    }),
  });
  return resultado;
}

export async function main() {
  const dbUrl = process.env.EXPURGO_DATABASE_URL;
  if (!dbUrl) {
    console.error(
      `${PREFIXO} ERRO: EXPURGO_DATABASE_URL não definida — o job precisa da role de login que herda \`iris_expurgo_audit_log\` (0142). Ver §Job de Expurgo do AuditLog em infra/README.md.`,
    );
    return 1;
  }

  const sql = postgres(dbUrl, { max: 1 });
  try {
    console.log(
      `${PREFIXO} ${new Date().toISOString()} Iniciando varredura de expurgo (Marco Civil #116 / #536)...`,
    );
    await executar(sql);
    console.log(`${PREFIXO} Varredura concluída com sucesso.`);
    return 0;
  } catch (err) {
    // Erro COMPLETO em stderr (regra do repo: não engolir stderr). Ele vai
    // para o log do container, não para e-mail — o heartbeat de erro, esse
    // sim externo, só carrega name+code.
    console.error(`${PREFIXO} FALHA na varredura:`);
    console.error(err);
    return 1;
  } finally {
    await sql.end();
  }
}

// Guarda de execução (mesma nota de retencao-aviso-previo.mjs): só roda
// `main()` quando invocado diretamente, e por `pathToFileURL` para caminho
// relativo/Windows não fazerem o processo sair 0 sem varrer nada.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then((codigo) => process.exit(codigo))
    .catch((err) => {
      console.error(`${PREFIXO} ERRO fatal:`, err);
      process.exit(1);
    });
}
