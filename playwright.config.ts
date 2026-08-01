import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * E2E da Fase 1b. Pré-requisito para rodar: DB migrado + seed de clínica
 * (`pnpm seed:clinic ...`). O `webServer` sobe o app em produção local; o
 * seed e a migração NÃO são feitos aqui (dependem de DB e credenciais reais),
 * então documente-os no topo de cada spec.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Um worker: vários specs compartilham a MESMA conta semeada
  // (`terapeuta.demo@iris.test` em diario-demo e revisao, por exemplo) e o
  // helper `entrarComMfa` zera o enrollment de segundo fator antes de recriá-lo.
  // Em paralelo, um worker apaga o enrollment que o outro acabou de registrar e
  // o `verify-totp` do vizinho volta "Invalid code" — flake que aparece como
  // bug de MFA. A suíte inteira roda em menos de um minuto; determinismo vale
  // mais que os segundos. Dar conta própria a cada spec substituiria isto.
  workers: 1,
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
