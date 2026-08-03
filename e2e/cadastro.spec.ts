import { test, expect } from "@playwright/test";
import { signJWT } from "better-auth/crypto";
import { authDb } from "@/db/client";
import { appUser, clinic, professionalConsent } from "@/db/schema";
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

    await test.step("3. Reconstrói o token de verificação e consome o endpoint real", async () => {
      // O token de verificação de e-mail do Better-Auth NÃO é uma linha em
      // `auth_verification`: `createEmailVerificationToken` é `signJWT(...)`
      // (node_modules/better-auth/dist/api/routes/email-verification.mjs:12),
      // ou seja, um JWT HS256 assinado com o `secret`, sem persistência. A
      // versão anterior deste passo esperava a linha aparecer no banco e
      // expirava sempre — o cadastro funcionava, o teste é que media a coisa
      // errada. Aqui o teste assina o MESMO token que o e-mail carregaria e
      // consome o endpoint de verdade, sem rota de atalho no produto.
      const token = await signJWT({ email }, process.env.BETTER_AUTH_SECRET!, 3600);

      // `${baseURL}/verify-email` do Better-Auth = /api/auth/verify-email.
      // `callbackURL` relativo passa no originCheck da lib.
      await page.goto(
        `/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent("/")}`,
      );

      // `autoSignInAfterVerification` cria a sessão; o Iris força enrollment
      // de MFA para papel clínico antes de qualquer dado de paciente.
      await expect(page).toHaveURL(/\/mfa\/setup/);
      await expect(
        page.getByRole("heading", { name: /Verificação em Duas Etapas/i })
      ).toBeVisible();

      // A verificação precisa ter marcado a conta — senão o redirect para
      // /mfa/setup poderia vir de qualquer outro caminho de enforcement.
      const verificado = await authDb.query.appUser.findFirst({
        where: eq(appUser.email, email),
      });
      expect(verificado?.emailVerified).toBe(true);
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
      // Consulta pela conexão de IDENTIDADE (`authDb`, role iris_auth), não
      // pela `sql` de runtime (role app_role). A policy de `clinic` compara
      // com `current_setting('app.clinic_id')` e, sem o GUC de tenant setado
      // por `withTenant`, a app_role estoura
      // `unrecognized configuration parameter "app.clinic_id"` — o teste
      // morria no erro de conexão, não na regra que queria provar. `authDb` é
      // exatamente a conexão que `criarContaEClinica` usa para criar a clínica.
      const original = await authDb
        .select({ id: clinic.id })
        .from(clinic)
        .where(eq(clinic.nome, nomeClinica));
      expect(original).toHaveLength(1);

      const duplicada = await authDb
        .select({ id: clinic.id })
        .from(clinic)
        .where(eq(clinic.nome, `Tentativa Duplicada ${timestamp}`));
      expect(duplicada).toHaveLength(0);
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

      // O campo de senha tem `minLength={12}`: com a validação NATIVA ligada, o
      // browser barra o submit, o servidor nunca responde e nenhum
      // `role="alert"` chega a existir (medido: 0 alertas no DOM). Este teste
      // ficava verde na etapa 3 e vermelho na 2 pelo motivo errado — nada do
      // caminho de erro do servidor era exercitado.
      //
      // Desligar `novalidate` é justamente o que um cliente scriptado faz: a
      // validação de aplicação em `validarCadastro` (servidor) tem que
      // responder do mesmo jeito. É o caminho que precisa ser coberto.
      await page.evaluate(() => {
        document.querySelector("form")?.setAttribute("novalidate", "");
      });

      await page.getByRole("button", { name: "Criar conta" }).click();
    });

    await test.step("2. Valida acessibilidade (foco automático em role='alert')", async () => {
      // Dois nós ganham role="alert" no erro: o Alert do <Form> (acima do
      // formulário) e a mensagem do <Field> da senha. O foco vai para o
      // primeiro do DOM — é o que o efeito de acessibilidade em
      // `cadastro-form.tsx` seleciona com querySelector.
      const alert = page.getByRole("alert").first();
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("A senha precisa ter ao menos 12 caracteres.");
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
