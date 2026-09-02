/**
 * Guardrail de ambiente para scripts de seed (D52).
 *
 * Impede a execução acidental de scripts de seed destrutivos ou com credenciais
 * padrão contra bancos de dados remotos (staging / produção), exigindo que o host
 * seja local (localhost / 127.0.0.1 / ::1) ou que a flag explícita
 * ALLOW_SEED_REMOTE=true esteja configurada.
 *
 * A lógica de host mora em `guardrail-conexao.mjs` (#534) — o guard genérico
 * `assertScriptRemotoPermitido` cobre qualquer script com role privilegiada,
 * inclusive os `.mjs` que rodam com `node` puro. Este módulo mantém a API e
 * as mensagens do D52 por cima dela.
 */

import {
  extractDatabaseHost,
  isLocalDatabaseHost,
} from "./guardrail-conexao.mjs";

export {
  extractDatabaseHost,
  isLocalDatabase,
  isLocalDatabaseHost,
} from "./guardrail-conexao.mjs";

/**
 * Valida o guardrail de ambiente para scripts de seed.
 *
 * @param connectionString URL ou connection string do banco de dados alvo
 * @param allowRemoteEnv Valor da variável ALLOW_SEED_REMOTE (default: process.env.ALLOW_SEED_REMOTE)
 * @returns { isLocal: boolean, host: string }
 * @throws Error se o banco for remoto e ALLOW_SEED_REMOTE !== "true"
 */
export function assertSeedAllowed(
  connectionString?: string,
  allowRemoteEnv: string | undefined = process.env.ALLOW_SEED_REMOTE,
): { isLocal: boolean; host: string } {
  if (!connectionString) {
    throw new Error(
      "MIGRATION_DATABASE_URL / DATABASE_URL não informada para o seed.",
    );
  }

  const host = extractDatabaseHost(connectionString);
  const isLocal = isLocalDatabaseHost(host);

  if (isLocal) {
    return { isLocal: true, host };
  }

  const isRemoteAllowed = allowRemoteEnv?.trim().toLowerCase() === "true";

  if (!isRemoteAllowed) {
    throw new Error(
      `[GUARDRAIL SEED] Execução bloqueada: o banco de dados de destino ("${host}") não é um ambiente local (localhost / 127.0.0.1).\n` +
        `Scripts de seed populam dados sintéticos e redefinem credenciais com senhas padrão conhecidas.\n` +
        `Se você realmente tem certeza de que deseja executar este seed contra um banco remoto (ex: staging smoke test), defina a variável de ambiente:\n` +
        `  ALLOW_SEED_REMOTE=true`,
    );
  }

  console.warn(
    `⚠️ [GUARDRAIL SEED] ALLOW_SEED_REMOTE=true detectado. Executando seed contra banco remoto: "${host}"...`,
  );

  return { isLocal: false, host };
}
