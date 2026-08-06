import { test, expect } from "@playwright/test";

/**
 * Issue #168 — Teste E2E do Reenvio de E-mail de Verificação
 *
 * Cobertura de Teste:
 *  1. Formulário de reenvio em `/cadastro/verifique-email`.
 *  2. Preenchimento de e-mail e exibição de feedback homogêneo.
 *  3. Verificação de não-vazamento de enumeração na interface.
 */
test.describe("Reenvio de E-mail de Verificação (Issue #168)", () => {
  test("profissional solicita reenvio de e-mail na tela pós-cadastro com resposta uniforme", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const email = `reenvio-${timestamp}@iris.test`;

    await test.step("1. Acessa a página /cadastro/verifique-email", async () => {
      await page.goto("/cadastro/verifique-email");
      await expect(
        page.getByRole("heading", { name: "Verifique seu e-mail" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Reenviar e-mail de verificação" }),
      ).toBeVisible();
    });

    await test.step("2. Preenche e submete o formulário de reenvio de e-mail", async () => {
      await page.getByLabel("E-mail profissional").fill(email);
      await page
        .getByRole("button", { name: "Reenviar e-mail de verificação" })
        .click();
    });

    await test.step("3. Valida alerta de confirmação e resposta uniforme anti-enumeração", async () => {
      // O resultado da action aparece DUAS vezes com role="status": no Alert
      // inline e no Toast (`reenvio-form.tsx` dispara os dois com a mesma
      // `estado.message`). Filtrar pelo texto da mensagem casava com ambos e
      // violava o strict mode (#209). O título só existe no Alert inline — que
      // é também o nó que recebe o foco — então é ele que desempata; a
      // uniformidade da mensagem vira asserção própria logo abaixo.
      const alert = page
        .getByRole("status")
        .filter({ hasText: "E-mail de confirmação enviado!" });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Se este e-mail estiver cadastrado");

      // Acessibilidade: o foco migra para o alerta (WCAG 2.4.7)
      await expect(alert).toBeFocused();
    });
  });
});
