import { test, expect } from "@playwright/test";

/**
 * Pré-requisito (executar antes deste teste):
 *   1. DB migrado: `pnpm db:migrate`
 *   2. Seed do coordenador de clínica única:
 *      `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"`
 *   3. App servindo (o `webServer` do playwright.config sobe via `pnpm start`).
 *
 * Coordenador de clínica única → sem seleção de clínica/papel → cai direto no
 * shell protegido em `/`, que mostra o nome da clínica ativa no header.
 */
test("login de coordenador cai no shell protegido", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("e2e@iris.test");
  await page.getByLabel("Senha").fill("Senha E2E 123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Clínica E2E")).toBeVisible();
});
