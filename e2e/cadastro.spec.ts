import { test, expect } from "@playwright/test";
import { authDb, sql } from "@/db/client";
import { authVerification, appUser, professionalConsent } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Task 12 — E2E da jornada de Cadastro Self-Service (Revisão QA Sênior Adversarial)
 *
 * Coberta pela especificação em docs/superpowers/plans/2026-07-30-fatia-a-cadastro-self-service.md:
 * 1. Preenchimento do formulário em `/cadastro` com dados válidos e aceite dos termos.
 * 2. Redirecionamento para `/cadastro/verifique-email` com resposta uniforme anti-enumeração.
 * 3. Leitura resiliente (poll) do token de verificação no banco e navegação para `/verificar-email?token=...`.
 * 4. Confirmação do redirecionamento para `/mfa/setup` (enforcement de papel clínico).
 * 5. Garantia de idempotência: submissão duplicada com mesmo e-mail não duplica clínica no banco.
 * 6. Validação de integridade de dados no banco: conselho, número de registro, UF e consentimento LGPD.
 * 7. Resiliência de formulário: erro de validação preserva inputs, Select (Radix) e Checkbox sem form-wipe (React 19).
 * 8. Acessibilidade (a11y): confirma foco automático no alerta de erro (`role="alert"`).
 */
test.describe("Jornada de Cadastro Self-Service (Fatia A)", () => {
  test("profissional conclui cadastro, verifica e-mail e cai no enrollment de MFA", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const nomeClinica = `Clínica E2E Autônoma ${timestamp}`;
    const email = `selfservice-${timestamp}@iris.test`;
    const senha = "SenhaSeguraE2E123!";

    // Step 1: Acessa e preenche o formulário de cadastro self-service.
    await page.goto("/cadastro");
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();

    await page.getByLabel("Nome completo").fill("Dra. Helena E2E");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(senha);
    await page.getByLabel("Nome da sua clínica").fill(nomeClinica);

    // Seleção de conselho profissional
    await page.getByRole("combobox", { name: "Conselho profissional" }).click();
    await page.getByRole("option", { name: "CRP" }).click();

    await page.getByLabel("Número do registro").fill("998877");
    await page.getByLabel("UF do registro").fill("SP");

    // Aceita os termos de uso
    await page.getByRole("checkbox").check();

    // Submete o cadastro
    await page.getByRole("button", { name: "Criar conta" }).click();

    // Step 2: Deve redirecionar para a tela de instrução de e-mail enviado.
    await expect(page).toHaveURL("/cadastro/verifique-email");
    await expect(
      page.getByText(/Se este e-mail puder criar uma conta/i)
    ).toBeVisible();

    // Asserção anti-enumeração: A tela é estritamente uniforme e não revela criação/existência.
    await expect(page.getByText(/E-mail já cadastrado/i)).not.toBeVisible();

    // Step 3: Resiliência contra latência de CI — poll até o token de verificação existir no banco.
    let token = "";
    await expect
      .poll(
        async () => {
          const rec = await authDb.query.authVerification.findFirst({
            where: eq(authVerification.identifier, email),
          });
          token = rec?.value ?? "";
          return token;
        },
        { message: "Aguardando token de verificação na tabela auth_verification", timeout: 10_000 }
      )
      .toBeTruthy();

    // Step 4: Acessa a rota de verificação com o token real.
    await page.goto(`/verificar-email?token=${token}`);

    // Redireciona para o setup de MFA (enforcement de papel clínico no Iris).
    await expect(page).toHaveURL(/\/mfa\/setup/);
    await expect(
      page.getByRole("heading", { name: /Configurar segundo fator/i })
    ).toBeVisible();

    // Step 5: Validação de integridade de dados gravados em app_user e professional_consent
    const userRecord = await authDb.query.appUser.findFirst({
      where: eq(appUser.email, email),
    });
    expect(userRecord).toBeDefined();
    expect(userRecord?.conselho).toBe("crp");
    expect(userRecord?.registroNumero).toBe("998877");
    expect(userRecord?.registroUf).toBe("SP");

    const consentRecord = await authDb.query.professionalConsent.findFirst({
      where: eq(professionalConsent.userId, userRecord!.id),
    });
    expect(consentRecord).toBeDefined();

    // Step 6: Idempotência — submissão duplicada com mesmo e-mail não cria segunda clínica no banco.
    await page.goto("/cadastro");
    await page.getByLabel("Nome completo").fill("Dra. Helena E2E");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(senha);
    await page.getByLabel("Nome da sua clínica").fill(nomeClinica);
    await page.getByRole("combobox", { name: "Conselho profissional" }).click();
    await page.getByRole("option", { name: "CRP" }).click();
    await page.getByLabel("Número do registro").fill("998877");
    await page.getByLabel("UF do registro").fill("SP");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Criar conta" }).click();

    // Redireciona para a mesma tela uniforme
    await expect(page).toHaveURL("/cadastro/verifique-email");

    // Consulta ao banco confirma exatamente 1 clínica com esse nome.
    const result = await sql<{ count: string }[]>`
      SELECT count(*) as count FROM clinic WHERE nome = ${nomeClinica}
    `;
    expect(Number(result[0]?.count ?? 0)).toBe(1);
  });

  test("preserva campos preenchidos e o estado do formulário quando ocorre erro de validação", async ({
    page,
  }) => {
    await page.goto("/cadastro");

    await page.getByLabel("Nome completo").fill("Dr. Roberto Teste");
    await page.getByLabel("E-mail").fill("roberto-resiliente@iris.test");
    await page.getByLabel("Senha").fill("SenhaCurta");
    await page.getByLabel("Nome da sua clínica").fill("Clínica Resiliente E2E");

    // Seleção do Select (Radix UI)
    await page.getByRole("combobox", { name: "Conselho profissional" }).click();
    await page.getByRole("option", { name: "CRM" }).click();

    await page.getByLabel("Número do registro").fill("123456");
    await page.getByLabel("UF do registro").fill("RJ");

    // Marcar Checkbox
    await page.getByRole("checkbox").check();

    // Tenta submeter formulário com senha fraca
    await page.getByRole("button", { name: "Criar conta" }).click();

    // 1. Deve exibir alerta de erro
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();

    // 2. Acessibilidade (WCAG 2.4.7): O foco deve se mover automaticamente para o alerta de erro
    await expect(alert).toBeFocused();

    // 3. Resiliência de campos nativos (React 19): Valores preservados sem form-wipe
    await expect(page.getByLabel("Nome completo")).toHaveValue("Dr. Roberto Teste");
    await expect(page.getByLabel("Nome da sua clínica")).toHaveValue("Clínica Resiliente E2E");
    await expect(page.getByLabel("E-mail")).toHaveValue("roberto-resiliente@iris.test");
    await expect(page.getByLabel("Número do registro")).toHaveValue("123456");
    await expect(page.getByLabel("UF do registro")).toHaveValue("RJ");

    // 4. Resiliência de componentes Radix (Select e Checkbox): Estado mantido pós-erro
    await expect(page.getByRole("combobox", { name: "Conselho profissional" })).toHaveText(/CRM/);
    await expect(page.getByRole("checkbox")).toBeChecked();
  });
});
