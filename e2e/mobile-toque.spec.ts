import { test, expect } from "@playwright/test";
import { entrarComMfa, entrarSemMfa } from "./helpers/sessao";
import { medirAlvosDeToque } from "./helpers/viewport";

/**
 * Gate de alvo de toque (WCAG 2.2 SC 2.5.8) em 360px — #185, Etapa 1.
 *
 * Pré-requisito das rotas autenticadas: `pnpm seed:e2e`.
 */
const ROTAS_PUBLICAS = ["/", "/login", "/cadastro"];
const ROTAS_APP = ["/agenda", "/pacientes", "/validacao", "/perfil"];

for (const caminho of ROTAS_PUBLICAS) {
  test(`alvos de toque ≥ 44px — público ${caminho}`, async ({ page }) => {
    await page.goto(caminho);
    await page.waitForLoadState("networkidle");

    const pequenos = await medirAlvosDeToque(page);

    expect(
      pequenos,
      `${caminho} tem controles abaixo de 44px:\n` +
        JSON.stringify(pequenos, null, 2),
    ).toEqual([]);
  });
}

test(`alvos de toque ≥ 44px — /mfa/setup`, async ({ page }) => {
  // Rota separada de ROTAS_PUBLICAS: exige sessão pré-2FA, não sessão
  // nenhuma. É onde o Accordion do produto vive — sem ela a mutação do
  // catálogo de correção (Step 5) não tem onde falhar.
  await entrarSemMfa(page, "e2e@iris.test", "Senha E2E 123");
  await page.waitForLoadState("networkidle");

  // A tela pede a senha atual antes de gerar o QR — o Accordion "Primeira
  // vez usando um app autenticador?" só existe depois desse gate.
  await page.getByLabel("Sua senha atual").fill("Senha E2E 123");
  await page.getByRole("button", { name: "Confirmar e Gerar Chave" }).click();
  await page.waitForLoadState("networkidle");

  const pequenos = await medirAlvosDeToque(page);

  expect(
    pequenos,
    `/mfa/setup tem controles abaixo de 44px:\n` +
      JSON.stringify(pequenos, null, 2),
  ).toEqual([]);
});

test.describe("app logado", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  });

  for (const caminho of ROTAS_APP) {
    test(`alvos de toque ≥ 44px — ${caminho}`, async ({ page }) => {
      await page.goto(caminho);
      await page.waitForLoadState("networkidle");

      const pequenos = await medirAlvosDeToque(page);

      expect(
        pequenos,
        `${caminho} tem controles abaixo de 44px:\n` +
          JSON.stringify(pequenos, null, 2),
      ).toEqual([]);
    });
  }
});
