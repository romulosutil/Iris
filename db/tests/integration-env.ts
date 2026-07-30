/**
 * Gate ÚNICO da suíte de integração (`pnpm test:rls`).
 *
 * Por que existe: até a #132, cada um dos 65 arquivos `*.int.test.ts` declarava
 * o seu próprio `const hasDb = ...` a partir de `process.env`, em três variantes
 * divergentes — e a mais fraca exigia só `MIGRATION_DATABASE_URL`, a role DONA
 * (superuser/BYPASSRLS). Resultado: esses arquivos "passavam" sem RLS aplicada,
 * e a suíte inteira saía VERDE quando faltava env de banco (auto-skip silencioso).
 * Verde por omissão em cima do comando que prova isolamento multi-tenant e
 * trilha append-only é pior que vermelho: encerra a investigação.
 *
 * Regra agora: gate uniforme nas TRÊS conexões. Quem só precisa da role dona
 * continua usando só ela no corpo do teste — mas não roda num ambiente meia-boca
 * onde a role de app nem foi configurada.
 *
 * A falha alta (env faltando → exit != 0) e a checagem de identidade das roles
 * ficam em `db/tests/global-setup.ts`, que roda ANTES de qualquer arquivo de
 * teste. Este módulo é só o predicado que os `describe.skipIf(!hasDb)` leem no
 * caminho de opt-in (`ALLOW_SKIP_INTEGRATION`).
 */

/** As três conexões que a suíte de integração exige, sem exceção. */
export const REQUIRED_DB_ENV = [
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
] as const;

/** Nomes das vars ausentes (ou presentes-mas-vazias), na ordem canônica. */
export function missingDbEnv(): string[] {
  return REQUIRED_DB_ENV.filter((name) => !process.env[name]?.trim());
}

/** Só é verdadeiro com as TRÊS URLs presentes e não-vazias. */
export const hasDb: boolean = missingDbEnv().length === 0;

/**
 * Escape hatch NOMEADO e consciente: com `ALLOW_SKIP_INTEGRATION=1 pnpm test:rls`
 * a suíte imprime um aviso alto e segue sem banco em vez de falhar. Mesmo
 * espírito do `SKIP_GLOBALS` de `infra/backup/restore.sh`.
 *
 * É flag de INVOCAÇÃO: `vitest.integration.config.ts` recusa honrá-la quando ela
 * vem do `.env` (arquivo gitignored → opt-in permanente e invisível no review) e
 * publica aqui, via `__INT_ALLOW_SKIP_FROM_SHELL`, o que estava de fato no
 * ambiente da invocação.
 *
 * NUNCA suprime a falha de identidade/propriedade de role: `global-setup.ts`
 * valida toda URL PRESENTE antes de considerar o skip. Só a env AUSENTE é
 * dispensável.
 */
const shellFlag = process.env.__INT_ALLOW_SKIP_FROM_SHELL;
export const allowSkip: boolean =
  shellFlag !== undefined
    ? shellFlag === "1"
    : // fallback: rodando fora do config de integração (sem o carregador de .env)
      !!process.env.ALLOW_SKIP_INTEGRATION?.trim();
