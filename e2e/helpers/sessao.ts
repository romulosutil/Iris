import type { APIResponse, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { TOTP, URI } from "otpauth";
import { authDb } from "@/db/client";
import { appUser, authThrottle, twoFactor } from "@/db/schema";

/**
 * Reexecuta um POST enquanto o servidor responder **429**.
 *
 * Por que existe (e por que é UM só): o Better-Auth tem rate limit PRÓPRIO, em
 * memória no processo do servidor — independente do `auth_throttle` da
 * aplicação e por isso não zerável pelo banco. Com vários specs autenticando a
 * mesma conta em sequência, uma chamada legítima leva 429 e a suíte falha por
 * ORDEM de execução, não por regressão. Esperar e repetir é a concessão certa:
 * a proteção continua ligada e exercitada pelo spec de brute-force; aqui ela só
 * não pode reprovar um login válido.
 *
 * Os dois pontos que sofrem disso têm baldes SEPARADOS (a chave do limitador é
 * IP + rota) e o mesmo limite apertado: `/sign-in/*` — janela 10s, máx. 3 — e
 * `/two-factor/*`, janela 10s, máx. 3 pela regra do próprio plugin de segundo
 * fator. Até #598 só o `sign-in/email` reexecutava; um 429 no `verify-totp`
 * derrubava o teste com `verify-totp falhou`, por motivo que não era o do
 * teste. Uma política só, usada nos dois, porque duas divergem no primeiro
 * ajuste.
 *
 * `executar` é uma FÁBRICA, não uma resposta pronta: o corpo é remontado a cada
 * tentativa. É isso que torna o retry utilizável no `verify-totp`, cujo código
 * TOTP tem janela de tempo — repetir o código da tentativa anterior é retry que
 * envelhece junto com a espera.
 */
async function postarAteSair429(
  page: Page,
  executar: () => Promise<APIResponse>,
): Promise<APIResponse> {
  let resposta = await executar();
  for (
    let tentativa = 0;
    tentativa < 3 && resposta.status() === 429;
    tentativa++
  ) {
    await page.waitForTimeout(6000);
    resposta = await executar();
  }
  return resposta;
}

/**
 * Login de papel CLÍNICO nos testes E2E.
 *
 * Por que existe: desde a Fase 6.2b todo papel clínico é obrigado a cadastrar
 * segundo fator — `getTenantContext` redireciona para `/mfa/setup` enquanto
 * `twoFactorEnabled` for falso, e depois do enrollment o próprio login passa a
 * exigir o código (a sessão só existe pós-2º fator). Os specs de Fase 1b/1c/2
 * foram escritos antes disso e assumiam que autenticar bastava para cair no
 * shell; ficaram vermelhos desde então.
 *
 * Por que NÃO usamos `BYPASS_MFA_FOR_DEV`: `assertMfaBypassSafe` derruba o boot
 * com `NODE_ENV=production`, que é exatamente como o `webServer` do Playwright
 * sobe o app (`next start`). Ligar o bypass exigiria rodar o E2E fora do modo
 * de produção — ou seja, deixar de exercitar o binário que vai para produção,
 * justamente na trava de segurança mais cara de errar.
 *
 * Por que via API e não pela UI: o enrollment é um fluxo de 3 etapas com QR
 * Code; reproduzi-lo por spec acopla todos eles ao layout da tela de MFA. O
 * caminho HTTP é o mesmo que a UI usa, e o fluxo de MFA pela interface continua
 * coberto pelo spec dedicado.
 *
 * `generateTOTP` do Better-Auth é `serverOnly` (não exposto em HTTP), então o
 * código é derivado aqui a partir do `totpURI` — o mesmo segredo que o app
 * mostraria no QR.
 */
export async function entrarComMfa(
  page: Page,
  email: string,
  senha: string,
): Promise<void> {
  const api = page.request;

  // O Better-Auth exige `Origin` nas rotas de mutação (proteção CSRF); o
  // APIRequestContext do Playwright não manda um por conta própria e a resposta
  // é 403 MISSING_OR_NULL_ORIGIN.
  const origem = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ).origin;
  const headers = { Origin: origem, Referer: `${origem}/login` };

  // Zera o enrollment antes de tudo. Sem isto o helper só funciona na PRIMEIRA
  // execução: depois que a conta tem segundo fator, `sign-in/email` devolve
  // `twoFactorRedirect` em vez de sessão, e sem sessão não dá para chamar
  // `enable`/`disable` — o segredo do enrollment anterior não existe mais em
  // lugar nenhum do lado do teste. Suíte que só passa em banco virgem é
  // armadilha; esta é a única forma de deixar o estado determinístico.
  await zerarSegundoFator(email);

  // Zera também o throttle persistente (`auth_throttle`, migrações 0061/0062).
  // Vários specs autenticam a MESMA conta semeada, e o spec de brute-force
  // dispara rajadas de propósito: a partir de certo ponto o sign-in legítimo
  // volta "Too many requests" e a suíte falha por ORDEM de execução, não por
  // regressão. A proteção continua coberta pelo spec que a exercita.
  await authDb.delete(authThrottle);

  // Rate limit em memória do Better-Auth: ver `postarAteSair429`.
  const login = await postarAteSair429(page, () =>
    api.post("/api/auth/sign-in/email", {
      data: { email, password: senha },
      headers,
    }),
  );
  expect(
    login.ok(),
    `sign-in falhou para ${email}: ${await login.text()}`,
  ).toBe(true);

  // `enable` é idempotente do ponto de vista do teste: se a conta já tem
  // segundo fator, o Better-Auth responde com erro e seguimos para o desafio.
  const enable = await api.post("/api/auth/two-factor/enable", {
    data: { password: senha },
    headers,
  });
  expect(enable.ok(), `two-factor/enable falhou: ${await enable.text()}`).toBe(
    true,
  );

  const { totpURI } = (await enable.json()) as { totpURI: string };
  // Mesma política de 429 do sign-in (#598). `totpDe` fica DENTRO da fábrica de
  // propósito: cada tentativa deriva um código novo do mesmo segredo.
  const verificado = await postarAteSair429(page, () =>
    api.post("/api/auth/two-factor/verify-totp", {
      data: { code: totpDe(totpURI) },
      headers,
    }),
  );
  expect(
    verificado.ok(),
    `verify-totp falhou: ${await verificado.text()}`,
  ).toBe(true);

  // Depois do enrollment a sessão já vale; a navegação seguinte carrega o shell
  // com o cookie que o contexto do Playwright acabou de receber.
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/(login|mfa)/);
}

/**
 * Autentica SEM completar o enrollment de segundo fator — deixa a sessão
 * exatamente onde `getTenantContext` redireciona para `/mfa/setup` (#185).
 * Existe separado de `entrarComMfa` porque aquele helper completa o
 * enrollment de propósito; este é só para exercitar a própria tela de setup.
 */
export async function entrarSemMfa(
  page: Page,
  email: string,
  senha: string,
): Promise<void> {
  const api = page.request;
  const origem = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ).origin;
  const headers = { Origin: origem, Referer: `${origem}/login` };

  await zerarSegundoFator(email);
  await authDb.delete(authThrottle);

  const login = await postarAteSair429(page, () =>
    api.post("/api/auth/sign-in/email", {
      data: { email, password: senha },
      headers,
    }),
  );
  expect(
    login.ok(),
    `sign-in falhou para ${email}: ${await login.text()}`,
  ).toBe(true);

  await page.goto("/mfa/setup");
  await expect(page).toHaveURL(/\/mfa\/setup/);
}

/**
 * Devolve a conta ao estado "nunca cadastrou segundo fator". Escreve por
 * `authDb` (role iris_auth), o mesmo caminho de identidade que o produto usa —
 * `two_factor` é credencial, não dado clínico, e não passa por `withTenant`.
 */
async function zerarSegundoFator(email: string): Promise<void> {
  const [usuario] = await authDb
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (!usuario) return;

  await authDb.delete(twoFactor).where(eq(twoFactor.userId, usuario.id));
  await authDb
    .update(appUser)
    .set({ twoFactorEnabled: false })
    .where(eq(appUser.id, usuario.id));
}

function totpDe(totpURI: string): string {
  const parsed = URI.parse(totpURI);
  if (!(parsed instanceof TOTP)) {
    throw new Error(`totpURI não é TOTP: ${totpURI}`);
  }
  return parsed.generate();
}
