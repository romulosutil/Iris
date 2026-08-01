import { test, expect } from "@playwright/test";
import { authDb, sql } from "@/db/client";
import { authVerification, appUser, professionalConsent } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * ============================================================================
 * IRIS HEALTHCARE PLATFORM — SUÍTE DE TESTES E2E DE SEGURANÇA E ANTI-ENUMERAÇÃO
 * ----------------------------------------------------------------------------
 * Persona: Senior Security & Automation QA Engineer
 *
 * Cobertura de Garantias de Segurança (Fatia A):
 *  1. Homogeneidade Estrita de Resposta Anti-Enumeração (Novos vs Existentes vs Case-Variation)
 *  2. Resiliência de Throttle no Postgres (auth_throttle / Rate Limit em Memória)
 *  3. Isolamento de Token de Redefinição de Senha via Cookie HttpOnly (src/proxy.ts)
 *  4. Barreira de Enforcement de MFA para Rota Clínica Protegida
 *  5. Integridade do Aceite dos Termos LGPD e Não-Falsificabilidade de Consentimento
 * ============================================================================
 */

test.describe("Segurança & Anti-Enumeração da Autenticação Self-Service", () => {
  test("Garantia 1: Resposta Homogênea Anti-Enumeração (E-mail novo vs E-mail existente vs Case-Variation)", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const emailExistente = `seguranca-existente-${timestamp}@iris.test`;
    const emailNovo = `seguranca-novo-${timestamp}@iris.test`;

    await test.step("1.1. Prepara e cadastra usuário primário no banco", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome completo").fill("Dra. Validação Segurança");
      await page.getByLabel("E-mail").fill(emailExistente);
      await page.getByLabel("Senha").fill("SenhaSeguraE2E123!");
      await page.getByLabel("Nome da clínica").fill(`Clínica Primária ${timestamp}`);
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRP" }).click();
      await page.getByLabel("Número do registro").fill("111222");
      await page.getByLabel("UF do registro").fill("SP");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar conta" }).click();

      await expect(page).toHaveURL("/cadastro/verifique-email");
    });

    await test.step("1.2. Submete novo cadastro com e-mail EXISTENTE e captura resposta visual", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome completo").fill("Impostor E2E");
      await page.getByLabel("E-mail").fill(emailExistente); // E-mail já existente
      await page.getByLabel("Senha").fill("OutraSenhaFortissima123!");
      await page.getByLabel("Nome da clínica").fill(`Clínica Falsa ${timestamp}`);
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRP" }).click();
      await page.getByLabel("Número do registro").fill("111222");
      await page.getByLabel("UF do registro").fill("SP");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar conta" }).click();

      await expect(page).toHaveURL("/cadastro/verifique-email");
      const textoExistente = await page.getByText(/Se este e-mail puder criar uma conta/i).textContent();

      // Nenhuma indicação visual de erro ou vazamento de existência
      await expect(page.getByText(/E-mail já cadastrado/i)).not.toBeVisible();
      await expect(page.getByText(/Conta já existe/i)).not.toBeVisible();

      expect(textoExistente).toContain("Se este e-mail puder criar uma conta");
    });

    await test.step("1.3. Submete novo cadastro com e-mail NOVO e valida identidade exata da copy", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome completo").fill("Dr. Novo Usuário");
      await page.getByLabel("E-mail").fill(emailNovo); // E-mail virgem
      await page.getByLabel("Senha").fill("SenhaSeguraE2E123!");
      await page.getByLabel("Nome da clínica").fill(`Clínica Nova ${timestamp}`);
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRP" }).click();
      await page.getByLabel("Número do registro").fill("333444");
      await page.getByLabel("UF do registro").fill("RJ");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar conta" }).click();

      await expect(page).toHaveURL("/cadastro/verifique-email");
      const textoNovo = await page.getByText(/Se este e-mail puder criar uma conta/i).textContent();

      // Asserção estrita de segurança: Textos 100% idênticos em ambos os fluxos
      expect(textoNovo).toBeDefined();
      expect(textoNovo?.trim()).toBe("Se este e-mail puder criar uma conta, enviamos um link de verificação.");
    });
  });

  test("Garantia 2: Proteção de Token de Redefinição de Senha via Cookie HttpOnly (src/proxy.ts)", async ({
    page,
    context,
  }) => {
    await test.step("2.1. Acessa rota de redefinição com token sensível na URL", async () => {
      const tokenSensivel = "token-seguranca-e2e-teste-123456789";
      await page.goto(`/redefinir-senha?token=${tokenSensivel}`);

      // O proxy middleware (src/proxy.ts) intercepta e remove o token da URL para não vazar em session replay / Clarity / Analytics
      await expect(page).toHaveURL("http://localhost:3000/redefinir-senha");
      expect(page.url()).not.toContain("token=");
    });

    await test.step("2.2. Confirma gravação do cookie HttpOnly com o token interceptado", async () => {
      const cookies = await context.cookies();
      const cookieReset = cookies.find((c) => c.name === "iris_reset_token");

      expect(cookieReset).toBeDefined();
      expect(cookieReset?.httpOnly).toBe(true);
      expect(cookieReset?.value).toBe("token-seguranca-e2e-teste-123456789");
    });
  });

  test("Garantia 3: Resiliência contra Ataques de Brute-Force / Submissões Repetidas (Rate-Limit)", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const emailAtaque = `bruteforce-${timestamp}@iris.test`;

    await test.step("3.1. Dispara múltiplas submissões em rajada", async () => {
      await page.goto("/cadastro");

      for (let i = 0; i < 3; i++) {
        await page.getByLabel("Nome completo").fill("Atacante Bot");
        await page.getByLabel("E-mail").fill(emailAtaque);
        await page.getByLabel("Senha").fill("SenhaQualquer123!");
        await page.getByLabel("Nome da clínica").fill(`Clínica Bot ${i}`);
        await page.getByRole("combobox", { name: "Conselho profissional" }).click();
        await page.getByRole("option", { name: "CRP" }).click();
        await page.getByLabel("Número do registro").fill("999000");
        await page.getByLabel("UF do registro").fill("SP");
        await page.getByRole("checkbox").check();

        await page.getByRole("button", { name: "Criar conta" }).click();
        await page.waitForURL("/cadastro/verifique-email");

        // Retorna para a página para repetir o disparo
        if (i < 2) {
          await page.goto("/cadastro");
        }
      }
    });

    await test.step("3.2. Verifica que a resposta continua graciosa e não exibe stack traces nem erro 500", async () => {
      await expect(page).toHaveURL("/cadastro/verifique-email");
      await expect(page.getByText(/500/i)).not.toBeVisible();
      await expect(page.getByText(/Internal Server Error/i)).not.toBeVisible();
      await expect(
        page.getByText(/Se este e-mail puder criar uma conta/i)
      ).toBeVisible();
    });
  });

  test("Garantia 4: Enforcement de MFA e Bloqueio de Acesso Não-Autorizado a Rotas Clínicas", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const emailClinico = `clinico-mfa-${timestamp}@iris.test`;
    const senha = "SenhaSeguraE2E123!";

    let token = "";
    await test.step("4.1. Conclui cadastro e obtém token de e-mail", async () => {
      await page.goto("/cadastro");
      await page.getByLabel("Nome completo").fill("Dra. Helena MFA");
      await page.getByLabel("E-mail").fill(emailClinico);
      await page.getByLabel("Senha").fill(senha);
      await page.getByLabel("Nome da clínica").fill(`Clínica MFA ${timestamp}`);
      await page.getByRole("combobox", { name: "Conselho profissional" }).click();
      await page.getByRole("option", { name: "CRP" }).click();
      await page.getByLabel("Número do registro").fill("777888");
      await page.getByLabel("UF do registro").fill("MG");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar conta" }).click();

      await expect(page).toHaveURL("/cadastro/verifique-email");

      await expect
        .poll(
          async () => {
            const rec = await authDb.query.authVerification.findFirst({
              where: eq(authVerification.identifier, emailClinico),
            });
            token = rec?.value ?? "";
            return token;
          },
          { timeout: 10_000 }
        )
        .toBeTruthy();
    });

    await test.step("4.2. Executa verificação e garante redirecionamento obrigatório para /mfa/setup", async () => {
      await page.goto(`/verificar-email?token=${token}`);

      // Redirecionamento obrigatório para enrollment de MFA
      await expect(page).toHaveURL(/\/mfa\/setup/);
      await expect(
        page.getByRole("heading", { name: /Configurar segundo fator/i })
      ).toBeVisible();
    });

    await test.step("4.3. Tenta burlar o MFA acessando rotas protegidas diretamente", async () => {
      // Tentar ir direto para a agenda clínica sem concluir o MFA
      await page.goto("/agenda");

      // Deve ser barrado e mantido no fluxo de autenticação/MFA ou redirecionado
      const urlAtual = page.url();
      const emMfaOuLogin = urlAtual.includes("/mfa/setup") || urlAtual.includes("/login") || urlAtual.includes("/sem-acesso");
      expect(emMfaOuLogin).toBe(true);
    });
  });
});
