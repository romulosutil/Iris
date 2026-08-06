import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Pré-requisito (executar antes deste teste):
 *   1. DB migrado: `pnpm db:migrate`
 *   2. Seed do coordenador de clínica única:
 *      `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"`
 *   3. App servindo (o `webServer` do playwright.config sobe o Next sozinho).
 *
 * Coordenador de clínica única → sem seleção de clínica/papel → cai direto no
 * shell protegido, que mostra o nome da clínica ativa no header. A raiz `/` é
 * pública (landing institucional) e redireciona quem já tem sessão para
 * `/agenda` (`src/app/page.tsx`) — asserir `/` aqui falhava sempre (#209).
 */
test("login de coordenador cai no shell protegido", async ({ page }) => {
  // Papel clínico é obrigado a ter segundo fator desde a Fase 6.2b: e-mail e
  // senha param em `/mfa/setup`, não no shell. O helper conclui o enrollment
  // pelo mesmo caminho HTTP que a UI usa.
  await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");

  await expect(page).toHaveURL("/agenda");
  await expect(page.getByText("Clínica E2E")).toBeVisible();
});
