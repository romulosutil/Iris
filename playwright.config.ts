import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E da Fase 1b em diante. Pré-requisito para rodar: DB migrado
 * (`pnpm db:migrate`) + seed (⚠️ todo seed abaixo TRUNCA as tabelas de
 * domínio do banco local). O `webServer` sobe o app em modo produção;
 * migração e seed NÃO são feitos aqui (dependem de DB e credenciais reais).
 *
 * Suíte inteira (`pnpm test:e2e`, os 9 specs, também o que CI roda):
 * `pnpm seed:e2e` — semeia clínica E2E + clínica demo no mesmo banco (#424).
 *
 * Um spec isolado (`pnpm exec playwright test e2e/diario-demo.spec.ts`):
 * `pnpm seed:clinic ...` (specs de cadastro/login/represcrição) ou
 * `pnpm seed:demo` (`diario-demo`, `revisao`) — cada um trunca sozinho.
 *
 * ## Ambiente (#209)
 *
 * O config carrega o env por conta própria, em ordem de precedência:
 *
 *   shell exportado  >  .env.e2e  >  .env
 *
 * `process.loadEnvFile` NÃO sobrescreve o que já está em `process.env`, então
 * carregar `.env.e2e` antes de `.env` faz o arquivo dedicado vencer, e o shell
 * vence os dois. Isso resolve dois problemas de uma vez:
 *
 *  - `entrarComMfa` fala com o banco direto e morria com `AUTH_DATABASE_URL
 *    não definida` quando ninguém exportava o `.env` à mão;
 *  - `.env.local` deste projeto aponta `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL`
 *    para **produção**. Ele nunca é carregado aqui, e o guard abaixo recusa
 *    iniciar se a `baseURL` não for local — antes, exportá-lo para pegar o
 *    `BETTER_AUTH_SECRET` jogava a suíte inteira contra o ambiente real, com
 *    o único sinal sendo `INVALID_EMAIL_OR_PASSWORD` (que parece falha de seed).
 */
const raiz = process.cwd();
for (const arquivo of [".env.e2e", ".env"]) {
  const caminho = path.join(raiz, arquivo);
  if (existsSync(caminho)) process.loadEnvFile(caminho);
}

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Guard de ambiente. Documentação não é trava: enquanto rodar contra produção
// for possível por esquecimento, uma hora acontece — e um spec que ESCREVE
// antes de autenticar teria consequência bem pior que os sign-in recusados de
// #209. Quem realmente precisa apontar para um host remoto assume por escrito.
const anfitriao = new URL(baseURL).hostname;
const ehLocal = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(
  anfitriao,
);
if (!ehLocal && process.env.E2E_ALLOW_REMOTE !== "1") {
  throw new Error(
    `[e2e] baseURL aponta para host não-local (${baseURL}).\n` +
      `A suíte semeia, escreve e apaga dados — rodá-la fora da máquina local ` +
      `mexe em dados reais.\n` +
      `Corrija NEXT_PUBLIC_APP_URL (use um .env.e2e — veja .env.e2e.example) ` +
      `ou, se for mesmo intencional, exporte E2E_ALLOW_REMOTE=1.`,
  );
}

const porta = new URL(baseURL).port || "3000";

/**
 * O spec do ditado de voz (`ditado-voz.spec.ts`, #494/T13) é OPT-IN por
 * ambiente. Ele é o único da suíte que precisa de storage S3 (MinIO), da flag
 * `FEATURE_FLAG_ASR_ENABLED` e do token do worker — o job `test-e2e` do CI hoje
 * sobe só Postgres.
 *
 * Por que projeto condicional e não `test.skip(...)` dentro do spec:
 * `scripts/ci/verificar-cobertura-e2e.mjs` REPROVA com `stats.skipped > 0`
 * ("ambiente de CI nunca deveria disparar skip"). Um skip condicional
 * derrubaria o job para todo mundo; um projeto que só existe quando o ambiente
 * existe mantém a contagem de CI inalterada e, quando o ambiente ESTÁ de pé,
 * roda o spec de verdade — sem terceira opção de "verde sem exercitar nada".
 *
 * Para tornar isto obrigatório (fechando de fato o ponto cego que deixou a #72
 * chegar ao fim com a feature inutilizável) falta: subir um service MinIO no
 * job `test-e2e`, criar o bucket `iris-asr-efemero`, exportar as 5 variáveis
 * abaixo e subir os pisos do gate (`--min-tests`/`--min-files`).
 */
const asrE2ePronto =
  process.env.FEATURE_FLAG_ASR_ENABLED === "true" &&
  Boolean(process.env.ASR_S3_ENDPOINT) &&
  Boolean(process.env.ASR_S3_ACCESS_KEY) &&
  Boolean(process.env.ASR_S3_SECRET_KEY) &&
  Boolean(process.env.ASR_JOB_TOKEN);

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
  projects: [
    // Roda antes de tudo e confirma que quem atende na `baseURL` é o Iris.
    // `reuseExistingServer` reaproveita *qualquer coisa* servindo na porta: em
    // #209 o Playwright rodou contra outro projeto na 3000 e o
    // `{"error":"Not found"}` do `/api/auth` parecia bug do Iris.
    { name: "servidor", testMatch: /servidor\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Os specs `mobile-*` só fazem sentido no viewport de 360px. Sem este
      // ignore eles rodariam DUAS vezes — uma delas em 1280px de largura, onde
      // passariam sempre e dariam a impressão de cobertura mobile.
      // `ditado-voz` sai daqui porque tem projeto próprio (ver `asrE2ePronto`):
      // sem este ignore ele rodaria no chromium padrão mesmo com o ambiente ASR
      // ausente, e falharia por infraestrutura, não por regressão.
      testIgnore: [/mobile-.*\.spec\.ts/, /ditado-voz\.spec\.ts/],
      dependencies: ["servidor"],
    },
    {
      // Gate mobile de #185. `isMobile` liga a emulação de meta viewport do
      // Chromium (sem ela, `viewport-fit=cover` e `env(safe-area-inset-*)` não
      // são exercitados) e `hasTouch` faz o layout responder como celular.
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
      testMatch: /mobile-.*\.spec\.ts/,
      dependencies: ["servidor"],
    },
    ...(asrE2ePronto
      ? [
          {
            name: "ditado-voz",
            use: { ...devices["Desktop Chrome"] },
            testMatch: /ditado-voz\.spec\.ts/,
            dependencies: ["servidor"],
          },
        ]
      : []),
  ],
  webServer: {
    // Invoca o binário do Next direto, sem passar pelo pnpm. `pnpm start`
    // aborta quando o pnpm do PATH diverge do campo `packageManager`
    // ("This project is configured to use 11.11.0 of pnpm") e o Playwright só
    // reporta `Process from config.webServer was not able to start. Exit code: 1`.
    command: `node ./node_modules/next/dist/bin/next start --port ${porta}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
