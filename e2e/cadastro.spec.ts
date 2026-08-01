import { test, expect } from "@playwright/test";
import { authDb, sql } from "@/db/client";
import { authVerification, appUser, professionalConsent } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * ============================================================================
 * IRIS HEALTHCARE PLATFORM — SUÍTE E2E DE CADASTRO SELF-SERVICE (FATIA A)
 * ----------------------------------------------------------------------------
 * Persona: QA Lead Specialist (Playwright / E2E Engineering)
 *
 * Cobertura de Testes:
 *  1. Jornada Principal (Happy Path + MFA Enforcement + Integridade DB)
 *  2. Anti-Enumeração Estrita & Idempotência de Banco
 *  3. Resiliência de Formulário (React 19 / Radix UI Form-Wipe Prevention)
 *  4. Acessibilidade (WCAG 2.4.7 — Foco Automático em Erros)
 *  5. Contrato de Links Legais (Termos & Privacidade)
 * ============================================================================
 */

test.describe("Jornada de Cadastro Self-Service (Fatia A)", () => {
  test("Jornada Completa: Cadastro, Verificação de E-mail, Integridade DB e Enrollment de MFA", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const nomeClinica = `Clínica E2E Autônoma ${timestamp}`;
    const email = `selfservice-${timestamp}@iris.test`;
    const senha = "SenhaSeguraE2E123!";

    await test.step("1. Acessa e preenche o formulário de cadastro com dados válidos", async () => {
      await page.goto("/cadastro");
      await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();

      await page.getByLabel("Nome completo").fill("Dra. Helena E2E");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha").fill(senha);
      await page.getByLabel("Nome da clínica").fill(nomeClinica);

      // Seleção de Conselho Profissional via componente Radix UI Select
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRP" }).click();

      await page.getByLabel("Número do registro").fill("998877");
      await page.getByLabel("UF do registro").fill("SP");

      // Aceite dos Termos de Uso
      await page.getByRole("checkbox").check();
      await expect(page.getByRole("checkbox")).toBeChecked();

      // Envio do formulário
      await page.getByRole("button", { name: "Criar conta" }).click();
    });

    await test.step("2. Valida resposta uniforme e proteção anti-enumeração", async () => {
      await expect(page).toHaveURL("/cadastro/verifique-email");
      await expect(
        page.getByText(/Se este e-mail puder criar uma conta/i)
      ).toBeVisible();

      // Garantia que não vazamos mensagens como "E-mail já existe" ou "Conta criada"
      await expect(page.getByText(/E-mail já cadastrado/i)).not.toBeVisible();
      await expect(page.getByText(/Conta criada com sucesso/i)).not.toBeVisible();
    });

    let token = "";
    await test.step("3. Consulta token de verificação diretamente no banco com retry resiliente", async () => {
      await expect
        .poll(
          async () => {
            const record = await authDb.query.authVerification.findFirst({
              where: eq(authVerification.identifier, email),
            });
            token = record?.value ?? "";
            return token;
          },
          {
            message: "Aguardando geração do token em auth_verification no banco",
            timeout: 10_000,
            intervals: [500, 1000, 2000],
          }
        )
        .toBeTruthy();
    });

    await test.step("4. Consome o token de verificação e valida o redirection para MFA", async () => {
      await page.goto(`/verificar-email?token=${token}`);

      // O Iris força enrollment de MFA para profissionais de saúde
      await expect(page).toHaveURL(/\/mfa\/setup/);
      await expect(
        page.getByRole("heading", { name: /Configurar segundo fator/i })
      ).toBeVisible();
    });

    await test.step("5. Verifica a integridade dos dados gravados no banco (app_user e professional_consent)", async () => {
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
      expect(consentRecord?.versaoTermo).toBeTruthy();

    });
  });

  test("Anti-Enumeração & Idempotência: Tentativa de re-cadastro com e-mail existente", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const nomeClinica = `Clínica Idempotência ${timestamp}`;
    const email = `idempotente-${timestamp}@iris.test`;
    const senha = "SenhaSeguraE2E123!";

    await test.step("1. Realiza o primeiro cadastro normalmente", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome completo").fill("Dr. Idempotente Primeiro");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha").fill(senha);
      await page.getByLabel("Nome da clínica").fill(nomeClinica);
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRM" }).click();
      await page.getByLabel("Número do registro").fill("112233");
      await page.getByLabel("UF do registro").fill("MG");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar conta" }).click();

      await expect(page).toHaveURL("/cadastro/verifique-email");
    });

    await test.step("2. Tenta re-cadastrar com o MESMO e-mail e nova clínica", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome completo").fill("Dr. Idempotente Segundo");
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Senha").fill("OutraSenha123!");
      await page.getByLabel("Nome da clínica").fill(`Tentativa Duplicada ${timestamp}`);
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRM" }).click();
      await page.getByLabel("Número do registro").fill("112233");
      await page.getByLabel("UF do registro").fill("MG");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar conta" }).click();

      // Redireciona para a mesma página uniforme sem revelar que o e-mail já existe
      await expect(page).toHaveURL("/cadastro/verifique-email");
      await expect(
        page.getByText(/Se este e-mail puder criar uma conta/i)
      ).toBeVisible();
    });

    await test.step("3. Valida no banco que a clínica duplicada NÃO foi criada", async () => {
      const resultOriginal = await sql<{ count: string }[]>`
        SELECT count(*) as count FROM clinic WHERE nome = ${nomeClinica}
      `;
      expect(Number(resultOriginal[0]?.count ?? 0)).toBe(1);

      const resultDuplicada = await sql<{ count: string }[]>`
        SELECT count(*) as count FROM clinic WHERE nome = ${`Tentativa Duplicada ${timestamp}`}
      `;
      expect(Number(resultDuplicada[0]?.count ?? 0)).toBe(0);
    });
  });

  test("Resiliência de Formulário & Acessibilidade em Erros de Validação", async ({
    page,
  }) => {
    await page.goto("/cadastro");

    await test.step("1. Preenche o formulário com dados e senha inválida (curta)", async () => {
      await page.getByLabel("Nome completo").fill("Dra. Beatriz Resiliente");
      await page.getByLabel("E-mail").fill("beatriz@iris.test");
      await page.getByLabel("Senha").fill("123"); // Senha inválida (< 12 caracteres)
      await page.getByLabel("Nome da clínica").fill("Clínica Resiliente E2E");

      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CREFITO" }).click();

      await page.getByLabel("Número do registro").fill("456789");
      await page.getByLabel("UF do registro").fill("PR");
      await page.getByRole("checkbox").check();

      await page.getByRole("button", { name: "Criar conta" }).click();
    });

    await test.step("2. Valida acessibilidade (foco automático em role='alert')", async () => {
      const alert = page.getByRole("alert");
      await expect(alert).toBeVisible();
      await expect(alert).toBeFocused();
    });

    await test.step("3. Valida preservação de estado contra form-wipe (React 19 / Radix UI)", async () => {
      await expect(page.getByLabel("Nome completo")).toHaveValue("Dra. Beatriz Resiliente");
      await expect(page.getByLabel("E-mail")).toHaveValue("beatriz@iris.test");
      await expect(page.getByLabel("Nome da clínica")).toHaveValue("Clínica Resiliente E2E");
      await expect(page.getByLabel("Número do registro")).toHaveValue("456789");
      await expect(page.getByLabel("UF do registro")).toHaveValue("PR");

      // Componentes Radix UI continuam com os valores selecionados
      await expect(
        page.getByRole("combobox", { name: "Conselho profissional" })
      ).toHaveText(/CREFITO/);
      await expect(page.getByRole("checkbox")).toBeChecked();
    });
  });

  test("Links Legais: Termos de Uso e Política de Privacidade abrem em nova aba", async ({
    page,
  }) => {
    await page.goto("/cadastro");

    await test.step("Valida presença e atributos dos links de Termos e Privacidade", async () => {
      const linkTermos = page.getByRole("link", { name: "Termos de Uso" });
      await expect(linkTermos).toBeVisible();
      await expect(linkTermos).toHaveAttribute("href", "/termos");
      await expect(linkTermos).toHaveAttribute("target", "_blank");

      const linkPrivacidade = page.getByRole("link", { name: "Política de Privacidade" });
      await expect(linkPrivacidade).toBeVisible();
      await expect(linkPrivacidade).toHaveAttribute("href", "/privacidade");
      await expect(linkPrivacidade).toHaveAttribute("target", "_blank");
    });
  });
});
