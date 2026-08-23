import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Pré-requisito (mesmo de login.spec.ts):
 *   1. `pnpm db:migrate`
 *   2. `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"`
 *      ⚠️ o seed TRUNCA as tabelas de domínio do banco local.
 *   3. App servindo (o `webServer` do playwright.config sobe o Next sozinho).
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
  // `/` é a landing pública e redireciona quem tem sessão para `/agenda`.
  await expect(page).toHaveURL("/agenda");

  // Cadastro administrativo (paciente + Consent LGPD).
  await page.goto("/pacientes/novo");
  await page.getByLabel("Nome do paciente").fill("Paciente E2E");
  // Modalidade clínica é obrigatória desde a expansão TCC/convencional (#98/#99).
  await page.getByRole("radio", { name: /Protocolo estruturado/ }).click();

  // Desde a #100 a escolha de quem assina o consentimento é EXPLÍCITA (nunca
  // derivada da data de nascimento), e o campo do responsável só é renderizado
  // no ramo "responsável legal". Sem escolher primeiro, o campo não existe e o
  // spec expirava esperando um input que a tela não tem.
  //
  // A escolha é `RadioCards` (`role="radio"`), não botão, e o rótulo perdeu o
  // parêntese — a descrição "menor de 18 anos" virou linha separada do card.
  await page.getByRole("radio", { name: /Responsável legal/ }).click();
  await page
    .getByLabel("Responsável que assina o Consentimento LGPD")
    .fill("Mãe E2E");
  // #191 — CPF do responsável passou a ser obrigatório no ramo do menor.
  // Cada spec usa um CPF DIFERENTE: `uq_patient_clinic_cpf` impede repetir o
  // mesmo CPF na mesma clínica, e os specs compartilham a clínica do seed.
  await page.getByLabel("CPF do responsável").fill("111.444.777-35");
  // Desde a fatia 2 da #203 o cadastro não prescreve mais carga horária: a
  // copy do submit anuncia o próximo passo ("Salvar e prescrever a carga
  // horária") e o destino é a ficha clínica, na âncora #prescricao.
  await page.getByRole("button", { name: /Salvar e prescrever/ }).click();

  // Redireciona ao cadastro clínico do paciente recém-criado.
  await expect(page).toHaveURL(/\/pacientes\/.+\/cadastro-clinico/);
  const patientId = page
    .url()
    .match(/\/pacientes\/([^/]+)\/cadastro-clinico/)![1];

  // Ficha clínica (coordenador-only): grava o diagnóstico.
  await page.getByLabel("Diagnóstico").fill("TEA — hipótese diagnóstica");
  await page.getByRole("button", { name: "Salvar ficha clínica" }).click();

  // Espera a confirmação ANTES de recarregar. Sem isto o `reload()` sai logo
  // depois do clique e pode abortar a server action em voo: o campo volta
  // vazio e o teste acusa "não persistiu" numa gravação que só não teve tempo
  // de acontecer — flake que aparece como bug de produto (#209).
  await expect(
    page.getByText("Ficha clínica salva com sucesso."),
  ).toBeVisible();

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
