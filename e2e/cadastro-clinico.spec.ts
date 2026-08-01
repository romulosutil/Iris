import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Pré-requisito (mesmo de login.spec.ts):
 *   1. `pnpm db:migrate`
 *   2. `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"`
 *   3. App servindo (webServer do playwright.config sobe via `pnpm start`).
 *
 * Definição de Pronto da Fase 1 (CLAUDE.md §6): um coordenador cadastra um
 * paciente de ponta a ponta (administrativo → clínico) e navega até a equipe.
 * O seed cria só o coordenador de clínica única, então o fluxo cai direto no
 * shell sem seleção de clínica/papel.
 */
test("coordenador completa cadastro administrativo, clínico e vê a equipe", async ({
  page,
}) => {
  // Login → shell protegido. Papel clínico exige segundo fator desde a Fase
  // 6.2b; o helper conclui o enrollment antes de chegar ao shell.
  await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  await expect(page).toHaveURL("/");

  // Cadastro administrativo (paciente + Consent LGPD).
  await page.goto("/pacientes/novo");
  await page.getByLabel("Nome do paciente").fill("Paciente E2E");

  // Desde a #100 a escolha de quem assina o consentimento é EXPLÍCITA (nunca
  // derivada da data de nascimento), e o campo do responsável só é renderizado
  // no ramo "responsável legal". Sem escolher primeiro, o campo não existe e o
  // spec expirava esperando um input que a tela não tem.
  await page
    .getByRole("button", { name: "Responsável legal (paciente menor de 18 anos)" })
    .click();
  await page
    .getByLabel("Responsável que assina o Consentimento LGPD")
    .fill("Mãe E2E");
  await page.getByRole("button", { name: /Salvar e continuar/ }).click();

  // Redireciona ao cadastro clínico do paciente recém-criado.
  await expect(page).toHaveURL(/\/pacientes\/.+\/cadastro-clinico/);
  const patientId = page.url().match(
    /\/pacientes\/([^/]+)\/cadastro-clinico/,
  )![1];

  // Ficha clínica (coordenador-only): grava o diagnóstico.
  await page.getByLabel("Diagnóstico").fill("TEA — hipótese diagnóstica");
  await page.getByRole("button", { name: "Salvar ficha clínica" }).click();

  // Recarrega e confirma persistência (o valor volta do banco via defaultValue).
  await page.reload();
  await expect(page.getByLabel("Diagnóstico")).toHaveValue(
    "TEA — hipótese diagnóstica",
  );

  // Equipe de cuidado do paciente é acessível ao coordenador.
  await page.goto(`/pacientes/${patientId}/equipe`);
  await expect(
    page.getByRole("heading", { name: "Equipe de cuidado" }),
  ).toBeVisible();
});
