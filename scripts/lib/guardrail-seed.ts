/**
 * Guardrail de ambiente para scripts de seed (D52).
 *
 * Impede a execução acidental de scripts de seed destrutivos ou com credenciais
 * padrão contra bancos de dados remotos (staging / produção), exigindo que o host
 * seja local (localhost / 127.0.0.1 / ::1) ou que a flag explícita
 * ALLOW_SEED_REMOTE=true esteja configurada.
 */

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "localhost.localdomain",
]);

/**
 * Extrai o hostname normalizado (em minúsculas, sem colchetes IPv6) de uma connection string Postgres.
 */
export function extractDatabaseHost(connectionString: string): string {
  if (!connectionString || typeof connectionString !== "string") {
    throw new Error(
      "Connection string de banco de dados não informada ou inválida.",
    );
  }

  const trimmed = connectionString.trim();

  // 1. Tentar parsear como URL padrão (postgres:// ou postgresql://)
  try {
    const parsed = new URL(trimmed);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.slice(1, -1);
    }
    if (host) return host;
  } catch {
    // 2. Fallback para formato libpq key-value (ex: "host=localhost port=5432 dbname=iris")
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
 */
export function isLocalDatabaseHost(host: string): boolean {
  if (!host || typeof host !== "string") return false;
  const normalized = host
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, "");
  return LOCAL_HOSTNAMES.has(normalized);
}

/**
 * Verifica se a connection string aponta para um banco de dados local.
 */
export function isLocalDatabase(connectionString: string): boolean {
  const host = extractDatabaseHost(connectionString);
  return isLocalDatabaseHost(host);
}

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
