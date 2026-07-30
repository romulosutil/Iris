/**
 * globalSetup da suíte de integração (`pnpm test:rls`) — #132.
 *
 * Roda UMA vez, ANTES de qualquer arquivo de teste, e responde a duas perguntas
 * que a suíte antiga respondia errado em silêncio:
 *
 *  1. "Tem banco?" — se faltar qualquer uma das três URLs, o default é FALHAR
 *     (exit != 0). O auto-skip silencioso saía verde e encerrava a investigação
 *     exatamente no comando que prova isolamento multi-tenant (RLS) e trilha
 *     append-only. Para pular de propósito existe `ALLOW_SKIP_INTEGRATION=1`,
 *     que troca a falha por um aviso alto — nunca por um verde limpo.
 *
 *  2. "É a role certa?" — `DATABASE_URL`/`AUTH_DATABASE_URL` apontando para a
 *     role dona (SUPERUSER/BYPASSRLS) fazem a suíte passar com RLS DESLIGADA:
 *     verde por vácuo. Isso é falha DURA e não tem opt-in — nem com
 *     `ALLOW_SKIP_INTEGRATION`.
 *
 * Nunca imprime senha nem URL inteira.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { REQUIRED_DB_ENV, allowSkip, missingDbEnv } from "./integration-env";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Tabela central esperada no schema (db/migrations, `clinic` existe desde a Fase 1). */
const SENTINEL_TABLE = "public.clinic";

/**
 * Quantos arquivos de integração são REALMENTE pulados quando falta banco.
 *
 * Contar todos os `*.int.test.ts` mente: parte deles não toca banco (renderer,
 * lógica pura) e roda de qualquer jeito. A contagem é DERIVADA — arquivo entra
 * na conta se importa o gate (`integration-env`), que é o que produz o
 * `describe.skipIf(!hasDb)`. Nada de número fixo: mexeu nos arquivos, o banner
 * acompanha sozinho.
 */
function countGatedIntegrationFiles(): number {
  let total = 0;
  for (const dir of ["src", path.join("db", "tests")]) {
    try {
      const base = path.join(ROOT, dir);
      const entries = readdirSync(base, {
        recursive: true,
        withFileTypes: true,
      });
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".int.test.ts")) continue;
        try {
          const src = readFileSync(path.join(e.parentPath, e.name), "utf8");
          if (src.includes("integration-env")) total += 1;
        } catch {
          // arquivo ilegível não deve derrubar o setup — o número é informativo.
        }
      }
    } catch {
      // diretório ausente não deve derrubar o setup — o número é informativo.
    }
  }
  return total;
}

const HOW_TO_FIX = [
  "Como corrigir (ambiente local):",
  "  1. cp .env.example .env",
  "  2. docker compose -f infra/docker-compose.yml up -d",
  "  3. pnpm db:migrate",
  "  4. confirme as TRÊS URLs no .env (host localhost:5433):",
  "       DATABASE_URL=postgres://iris_app:iris@localhost:5433/iris            # role de app, RLS APLICA",
  "       AUTH_DATABASE_URL=postgres://iris_auth_login:iris@localhost:5433/iris # role de auth, RLS APLICA",
  "       MIGRATION_DATABASE_URL=postgres://iris:iris@localhost:5433/iris       # role dona, migrações/fixtures",
].join("\n");

function envFailureMessage(missing: string[], total: number): string {
  return [
    "",
    "════════════════════════════════════════════════════════════════════════",
    "  SUÍTE DE INTEGRAÇÃO SEM BANCO — NENHUMA COBERTURA DE RLS FOI PRODUZIDA",
    "════════════════════════════════════════════════════════════════════════",
    "",
    `  Variáveis de ambiente ausentes/vazias (${missing.length} de ${REQUIRED_DB_ENV.length}):`,
    ...missing.map((name) => `    - ${name}`),
    "",
    `  Sem elas, os ${total} arquivos *.int.test.ts se auto-skipam. Este é o comando`,
    "  que prova isolamento multi-tenant (RLS) e trilha de auditoria append-only:",
    "  um verde aqui sem banco NÃO é cobertura — é ausência de teste.",
    "",
    HOW_TO_FIX,
    "",
    "  Para pular a integração de propósito (ciente de que não há cobertura):",
    "    ALLOW_SKIP_INTEGRATION=1 pnpm test:rls",
    "════════════════════════════════════════════════════════════════════════",
    "",
  ].join("\n");
}

function skipBanner(missing: string[], total: number): string {
  return [
    "",
    "████████████████████████████████████████████████████████████████████████",
    "██  AVISO ALTO: ALLOW_SKIP_INTEGRATION ativo — integração NÃO rodou    ██",
    "████████████████████████████████████████████████████████████████████████",
    "",
    "  Variáveis de ambiente ausentes/vazias:",
    ...missing.map((name) => `    - ${name}`),
    "",
    `  ${total} arquivos *.int.test.ts serão PULADOS.`,
    "  ISSO NÃO É COBERTURA. Nenhuma política RLS foi avaliada, nenhuma garantia",
    "  de isolamento multi-tenant ou de trilha append-only foi verificada nesta",
    "  execução. Um exit 0 aqui significa apenas 'não testei'.",
    "",
    HOW_TO_FIX,
    "████████████████████████████████████████████████████████████████████████",
    "",
  ].join("\n");
}

type RoleIdentity = {
  user: string;
  super_: boolean;
  bypassrls: boolean;
  /** Tabelas de `public` cujo DONO é a role conectada (RLS não se aplica ao dono sem FORCE). */
  ownedTables: number;
};

/** Host:porta para diagnóstico. NUNCA usuário, senha ou URL inteira. */
function endpointOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(endpoint ilegível — URL malformada)";
  }
}

/** Erro com banner autoral para falha de CONEXÃO (host morto, porta fechada, senha errada). */
function connectionFailure(varName: string, url: string, err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err);
  return new Error(
    [
      "",
      "════════════════════════════════════════════════════════════════════════",
      "  NÃO CONSEGUI CONECTAR AO BANCO",
      "════════════════════════════════════════════════════════════════════════",
      "",
      `  Variável: ${varName}`,
      `  Endpoint: ${endpointOf(url)}`,
      `  Driver:   ${detail}`,
      "",
      "  A env está preenchida, mas o banco não respondeu. Nenhuma política RLS",
      "  foi avaliada — não há cobertura nesta execução.",
      "",
      "  Suba o Postgres local:",
      "    docker compose -f infra/docker-compose.yml up -d",
      "",
      "  E confira host/porta da URL (local: localhost:5433).",
      "════════════════════════════════════════════════════════════════════════",
      "",
    ].join("\n"),
  );
}

async function roleIdentity(
  varName: string,
  url: string,
): Promise<RoleIdentity> {
  const sql = postgres(url, { max: 1, idle_timeout: 1, connect_timeout: 10 });
  try {
    const rows = await sql<
      { current_user: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`select current_user, rolsuper, rolbypassrls
        from pg_roles where rolname = current_user`;
    const row = rows[0];
    if (!row) throw new Error("pg_roles não retornou linha para current_user");
    const owned = await sql<{ owned: number }[]>`
      select count(*)::int as owned
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relowner = current_user::regrole`;
    return {
      user: row.current_user,
      super_: row.rolsuper,
      bypassrls: row.rolbypassrls,
      ownedTables: owned[0]?.owned ?? 0,
    };
  } catch (err) {
    throw connectionFailure(varName, url, err);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function sentinelTableExists(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, idle_timeout: 1, connect_timeout: 10 });
  try {
    const rows = await sql<
      { exists: boolean }[]
    >`select to_regclass(${SENTINEL_TABLE}) is not null as exists`;
    return rows[0]?.exists === true;
  } catch (err) {
    throw connectionFailure("MIGRATION_DATABASE_URL", url, err);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const tag = (id: RoleIdentity) =>
  `${id.user}(${id.super_ || id.bypassrls ? "BYPASSRLS" : "norls"})`;

export async function setup(): Promise<void> {
  const missing = missingDbEnv();
  const missingSet = new Set<string>(missing);

  // ── identidade das roles ───────────────────────────────────────────────────
  // ANTES de qualquer early return: role errada produz verde por vácuo (RLS
  // desativada), e isso NÃO tem opt-in. Vale para toda URL PRESENTE, mesmo que
  // outra esteja faltando — senão o ramo de skip engoliria a checagem e o texto
  // "ALLOW_SKIP_INTEGRATION não suprime" seria mentira.
  const identities = new Map<string, RoleIdentity>();
  for (const varName of REQUIRED_DB_ENV) {
    if (missingSet.has(varName)) continue;
    identities.set(varName, await roleIdentity(varName, process.env[varName]!));
  }

  for (const varName of ["DATABASE_URL", "AUTH_DATABASE_URL"] as const) {
    const id = identities.get(varName);
    if (!id) continue;
    if (id.ownedTables > 0) {
      throw new Error(
        [
          "",
          "════════════════════════════════════════════════════════════════════════",
          "  ROLE DE APLICAÇÃO É DONA DAS TABELAS — RLS NÃO SE APLICA",
          "════════════════════════════════════════════════════════════════════════",
          "",
          `  ${varName} conecta como '${id.user}', que é DONA de ${id.ownedTables} tabela(s)`,
          "  do schema public.",
          "",
          "  Postgres NÃO aplica row level security ao DONO da tabela, a menos que a",
          "  tabela tenha FORCE ROW LEVEL SECURITY. Sem rolsuper e sem rolbypassrls,",
          "  a role ainda assim enxergaria tudo em qualquer tabela sem FORCE — o mesmo",
          "  verde por vácuo, só que mais difícil de ver.",
          "",
          `  ${varName} tem que ser uma role de aplicação que NÃO é dona de tabela`,
          "  (local: iris_app / iris_auth_login). A role dona vai só em",
          "  MIGRATION_DATABASE_URL, onde ser dona é o requisito.",
          "",
          "  Esta falha NÃO tem opt-in: ALLOW_SKIP_INTEGRATION não a suprime.",
          "════════════════════════════════════════════════════════════════════════",
          "",
        ].join("\n"),
      );
    }
    if (id.super_ || id.bypassrls) {
      throw new Error(
        [
          "",
          "════════════════════════════════════════════════════════════════════════",
          "  ROLE ERRADA — A SUÍTE RODARIA COM RLS DESATIVADA",
          "════════════════════════════════════════════════════════════════════════",
          "",
          `  ${varName} conecta como '${id.user}'`,
          `    rolsuper=${id.super_}  rolbypassrls=${id.bypassrls}`,
          "",
          "  Postgres NÃO aplica row level security a role SUPERUSER ou BYPASSRLS.",
          "  Todo teste de isolamento multi-tenant passaria por VÁCUO: a query veria",
          "  tudo, nenhuma policy seria exercida, e a suíte sairia verde afirmando",
          "  exatamente o contrário do que teria provado.",
          "",
          `  ${varName} tem que ser uma role de aplicação sem esses atributos`,
          "  (local: iris_app para DATABASE_URL, iris_auth_login para AUTH_DATABASE_URL).",
          "  A role dona vai só em MIGRATION_DATABASE_URL.",
          "",
          "  Esta falha NÃO tem opt-in: ALLOW_SKIP_INTEGRATION não a suprime.",
          "════════════════════════════════════════════════════════════════════════",
          "",
        ].join("\n"),
      );
    }
  }

  // ── env ausente ────────────────────────────────────────────────────────────
  // Só AGORA, com toda URL presente já validada: faltar env é o único caso que
  // ALLOW_SKIP_INTEGRATION dispensa.
  if (missing.length > 0) {
    const total = countGatedIntegrationFiles();
    if (allowSkip) {
      // stdout: tem que aparecer no log de quem rodou, não sumir em stderr filtrado.
      console.log(skipBanner(missing, total));
      return;
    }
    throw new Error(envFailureMessage(missing, total));
  }

  const owner = identities.get("MIGRATION_DATABASE_URL");
  if (owner && !owner.super_ && !owner.bypassrls) {
    throw new Error(
      [
        "",
        "════════════════════════════════════════════════════════════════════════",
        "  MIGRATION_DATABASE_URL NÃO É A ROLE DONA",
        "════════════════════════════════════════════════════════════════════════",
        "",
        `  Conecta como '${owner.user}' (rolsuper=false, rolbypassrls=false).`,
        "",
        "  Os testes usam essa conexão para montar fixture (INSERT em clinic,",
        "  patient, session...) justamente porque ela bypassa RLS. Sem os atributos,",
        "  os INSERTs vão morrer em 'new row violates row-level security policy' ou",
        "  'permission denied', N arquivos abaixo, com stack que não aponta pra cá.",
        "",
        "  Local: MIGRATION_DATABASE_URL=postgres://iris:iris@localhost:5433/iris",
        "════════════════════════════════════════════════════════════════════════",
        "",
      ].join("\n"),
    );
  }

  // ── sanidade de schema ─────────────────────────────────────────────────────
  if (!(await sentinelTableExists(process.env.MIGRATION_DATABASE_URL!))) {
    throw new Error(
      [
        "",
        "════════════════════════════════════════════════════════════════════════",
        "  SCHEMA NÃO MIGRADO",
        "════════════════════════════════════════════════════════════════════════",
        "",
        `  A tabela ${SENTINEL_TABLE} não existe no banco de MIGRATION_DATABASE_URL.`,
        "  Sem o schema aplicado, cada arquivo falha isolado em 'relation does not",
        "  exist' e a causa real (migrações pendentes) fica soterrada.",
        "",
        "  Rode:  pnpm db:migrate",
        "════════════════════════════════════════════════════════════════════════",
        "",
      ].join("\n"),
    );
  }

  const app = identities.get("DATABASE_URL");
  const auth = identities.get("AUTH_DATABASE_URL");
  console.log(
    `[int] app=${app ? tag(app) : "-"} auth=${auth ? tag(auth) : "-"} owner=${owner ? `${owner.user}(owner)` : "-"} schema=ok`,
  );
}
