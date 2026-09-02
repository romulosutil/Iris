/**
 * Guardrail de ambiente para QUALQUER script que abre conexão Postgres com
 * role privilegiada (auditoria 360 · S-04, #534).
 *
 * Generaliza o guard de seed (D52, `guardrail-seed.ts`): a régua não é "é um
 * seed?", é "abre conexão com a role dona e escreve?". Um script de
 * diagnóstico (`unlock-user.ts`), um backfill (`backfill-evidence.ts`) e um
 * smoke (`smoke-alerta-risco.mjs`) apontados para produção por descuido fazem
 * o mesmo estrago que um seed — e nenhum era coberto.
 *
 * É `.mjs` (não `.ts`) de propósito: `smoke-alerta-risco.mjs` roda com `node`
 * puro, sem `tsx`, e precisa importar o guard. `guardrail-seed.ts` reexporta
 * daqui para que a lógica de host exista num lugar só.
 *
 * A flag de liberação é a MESMA do seed (`ALLOW_SEED_REMOTE=true`): uma única
 * porta documentada em `.env.example`, em vez de uma flag por script.
 */

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "localhost.localdomain",
]);

/** Nome da variável de ambiente que libera execução contra banco remoto. */
export const FLAG_REMOTO = "ALLOW_SEED_REMOTE";

/**
 * Extrai o hostname normalizado (minúsculas, sem colchetes IPv6) de uma
 * connection string Postgres (URL `postgres://` ou key-value libpq).
 *
 * @param {string} connectionString
 * @returns {string}
 */
export function extractDatabaseHost(connectionString) {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error(
      "Connection string de banco de dados não informada ou inválida.",
    );
  }

  const trimmed = connectionString.trim();

  // 1. URL padrão (postgres:// ou postgresql://)
  try {
    const parsed = new URL(trimmed);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.slice(1, -1);
    }
    if (host) return host;
  } catch {
    // 2. Fallback libpq key-value (ex.: "host=localhost port=5432 dbname=iris")
    const match = /(?:^|\s)host=([^\s]+)/i.exec(trimmed);
    if (match && match[1]) {
      let host = match[1].toLowerCase();
      if (host.startsWith("[") && host.endsWith("]")) {
        host = host.slice(1, -1);
      }
      return host;
    }
  }

  throw new Error(
    `Não foi possível determinar o host a partir da connection string: "${connectionString}"`,
  );
}

/**
 * Verifica se um hostname corresponde a uma interface local / loopback.
 *
 * @param {string} host
 * @returns {boolean}
 */
export function isLocalDatabaseHost(host) {
  if (!host || typeof host !== "string") return false;
  const normalized = host
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, "");
  return LOCAL_HOSTNAMES.has(normalized);
}

/**
 * Verifica se a connection string aponta para um banco de dados local.
 *
 * @param {string} connectionString
 * @returns {boolean}
 */
export function isLocalDatabase(connectionString) {
  return isLocalDatabaseHost(extractDatabaseHost(connectionString));
}

/**
 * Bloqueia (fail-closed) a execução de um script privilegiado contra banco
 * remoto, salvo liberação explícita por `ALLOW_SEED_REMOTE=true`.
 *
 * @param {string | undefined} connectionString URL do banco alvo
 * @param {{ rotulo?: string, allowRemoteEnv?: string | undefined }} [opcoes]
 *   `rotulo` nomeia o script na mensagem (ex.: "unlock-user");
 *   `allowRemoteEnv` sobrescreve `process.env.ALLOW_SEED_REMOTE` (testes).
 * @returns {{ isLocal: boolean, host: string }}
 * @throws {Error} se a URL estiver ausente, ou for remota sem liberação
 */
export function assertScriptRemotoPermitido(connectionString, opcoes = {}) {
  const rotulo = opcoes.rotulo ?? "script";
  const allowRemoteEnv =
    "allowRemoteEnv" in opcoes
      ? opcoes.allowRemoteEnv
      : process.env[FLAG_REMOTO];

  if (!connectionString) {
    throw new Error(
      `[GUARDRAIL ${rotulo}] URL do banco não informada — o script precisa de MIGRATION_DATABASE_URL (ou equivalente).`,
    );
  }

  const host = extractDatabaseHost(connectionString);
  const isLocal = isLocalDatabaseHost(host);

  if (isLocal) {
    return { isLocal: true, host };
  }

  const liberado = allowRemoteEnv?.trim().toLowerCase() === "true";

  if (!liberado) {
    throw new Error(
      `[GUARDRAIL ${rotulo}] Execução bloqueada: o banco de destino ("${host}") não é local (localhost / 127.0.0.1).\n` +
        `Este script abre conexão com role privilegiada e ESCREVE no banco. Apontado para produção por descuido, ` +
        `altera dado real sem trilha nem tenant.\n` +
        `Se você realmente quer executar contra um banco remoto, defina explicitamente:\n` +
        `  ${FLAG_REMOTO}=true`,
    );
  }

  console.warn(
    `⚠️ [GUARDRAIL ${rotulo}] ${FLAG_REMOTO}=true detectado. Executando contra banco remoto: "${host}"...`,
  );

  return { isLocal: false, host };
}
