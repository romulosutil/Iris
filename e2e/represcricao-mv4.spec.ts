import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Pré-requisito (mesmo de cadastro-clinico.spec.ts):
 *   1. `pnpm db:migrate`
 *   2. `pnpm seed:clinic "Clínica E2E" e2e@iris.test "Senha E2E 123"`
 *      ⚠️ o seed TRUNCA as tabelas de domínio do banco local.
 *   3. `pnpm test:e2e` — o `webServer` do playwright.config sobe o Next
 *      sozinho (invoca o binário direto, sem passar pelo pnpm) e o config
 *      carrega `.env.e2e`/`.env` por conta própria.
 *
 * O ambiente do processo de teste deixou de ser manual na #209: nada de
 * `set -a; . ./.env.local`, que apontava a suíte para produção. Veja o
 * cabeçalho do `playwright.config.ts` e o `.env.e2e.example`.
 *
 * §MV4 de ponta a ponta (#203, fatia 6) — o que este spec cobre e nenhum outro
 * teste do repo cobre:
 *
 *   O handoff só existe no navegador. Os testes de integração provam que a
 *   action devolve `disciplinaSobrealocada`, e os de componente provam que o
 *   diálogo abre, fecha e envia os campos certos. Entre um e outro fica o
 *   pedaço que só o browser executa: o `router.push` para OUTRA rota com
 *   `#âncora`, e a barra da disciplina certa aparecendo no destino. Um `id`
 *   que divergisse do link — acento, caixa, percent-encoding — passaria em
 *   todos os testes atuais e deixaria o coordenador no topo de uma tela com
 *   dez disciplinas, que é o "descobrir depois" que a fatia existe para matar.
 *
 * O coordenador semeado se aloca a si mesmo como terapeuta de referência: o
 * papel é do VÍNCULO, não da pessoa (D-C), então isso é fluxo legítimo e evita
 * depender de um segundo usuário no seed.
 */
test("represcrever para baixo confirma antes e leva à barra da disciplina afetada", async ({
  page,
}) => {
  await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");

  // --- Paciente novo, para o teste não depender de estado deixado por outro spec.
  await page.goto("/pacientes/novo");
  await page.getByLabel("Nome do paciente").fill("Paciente MV4");
  await page.getByRole("radio", { name: /Responsável legal/ }).click();
  await page
    .getByLabel("Responsável que assina o Consentimento LGPD")
    .fill("Mãe MV4");
  await page.getByRole("button", { name: /Salvar e prescrever/ }).click();

  await expect(page).toHaveURL(/\/pacientes\/.+\/cadastro-clinico/);
  const patientId = page
    .url()
    .match(/\/pacientes\/([^/]+)\/cadastro-clinico/)![1];

  // --- Prescreve 15h de Fonoaudiologia.
  await page.getByRole("combobox", { name: "Disciplina" }).click();
  await page.getByRole("option", { name: "Fonoaudiologia" }).click();
  await page.getByLabel("Carga horária semanal").fill("15");
  await page.getByRole("button", { name: "Salvar prescrição" }).click();
  await expect(page.getByText("15h / semana")).toBeVisible();

  // --- Aloca as 15h inteiras: a disciplina fica exatamente no teto.
  await page.goto(`/pacientes/${patientId}/equipe`);
  await page.getByRole("combobox", { name: "Profissional da clínica" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("combobox", { name: "Disciplina prescrita" }).click();
  await page.getByRole("option", { name: "Fonoaudiologia" }).click();
  await page.getByRole("combobox", { name: "Papel na equipe" }).click();
  await page
    .getByRole("option", {
      name: "Terapeuta de referência (titular da disciplina)",
    })
    .click();
  await page.getByLabel("Horas semanais").fill("15");
  await page.getByRole("button", { name: "Vincular à equipe" }).click();
  await expect(page.locator("#cobertura-fonoaudiologia")).toContainText(
    "cobertura completa",
  );

  // --- Reduz o teto para 10h: 15h alocadas passam a estourar o novo teto.
  await page.goto(`/pacientes/${patientId}/cadastro-clinico#prescricao`);
  await page.getByLabel("Alterar carga semanal").fill("10");
  await page.getByRole("button", { name: "Atualizar carga" }).click();

  // O produto PERGUNTA antes de salvar, e a frase que ele mostra é a mesma que
  // a barra de destino vai mostrar — é o ponto inteiro da fatia.
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText(
    "Esta redução deixa a disciplina sobrealocada.",
  );
  await expect(dialogo).toContainText("sobrealocação de 5h");
  await dialogo.getByRole("button", { name: "Salvar mesmo assim" }).click();

  // --- O handoff: outra rota, âncora da disciplina certa, barra no destino.
  await expect(page).toHaveURL(
    `/pacientes/${patientId}/equipe#cobertura-fonoaudiologia`,
  );
  const barra = page.locator("#cobertura-fonoaudiologia");
  await expect(barra).toContainText("15h de 10h alocadas (150%)");
  await expect(barra).toContainText("sobrealocação de 5h");
  // Não basta existir na página: o coordenador tem de CAIR nela. Sem o
  // `scroll-mt`/âncora funcionando, o bloco existe e fica fora da tela.
  await expect(barra).toBeInViewport();
});

/**
 * O mesmo diálogo no OUTRO formulário da seção.
 *
 * `prescreverDisciplinaAction` é a mesma action para a linha vigente e para o
 * bloco de prescrição nova. Enquanto o diálogo morava só na linha, este caminho
 * — encerrar a prescrição (que mantém os vínculos) e prescrever de novo com
 * carga menor — devolvia a confirmação para um formulário que não sabia lê-la:
 * nada salvava, nada aparecia, o submit era um clique sem efeito.
 */
test("prescrever disciplina nova sobre equipe já montada também pergunta antes", async ({
  page,
}) => {
  await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");

  await page.goto("/pacientes/novo");
  await page.getByLabel("Nome do paciente").fill("Paciente MV4 legado");
  await page.getByRole("radio", { name: /Responsável legal/ }).click();
  await page
    .getByLabel("Responsável que assina o Consentimento LGPD")
    .fill("Mãe MV4");
  await page.getByRole("button", { name: /Salvar e prescrever/ }).click();
  await expect(page).toHaveURL(/\/pacientes\/.+\/cadastro-clinico/);
  const patientId = page
    .url()
    .match(/\/pacientes\/([^/]+)\/cadastro-clinico/)![1];

  await page.getByRole("combobox", { name: "Disciplina" }).click();
  await page.getByRole("option", { name: "Fonoaudiologia" }).click();
  await page.getByLabel("Carga horária semanal").fill("15");
  await page.getByRole("button", { name: "Salvar prescrição" }).click();
  await expect(page.getByText("15h / semana")).toBeVisible();

  await page.goto(`/pacientes/${patientId}/equipe`);
  await page.getByRole("combobox", { name: "Profissional da clínica" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("combobox", { name: "Disciplina prescrita" }).click();
  await page.getByRole("option", { name: "Fonoaudiologia" }).click();
  await page.getByRole("combobox", { name: "Papel na equipe" }).click();
  await page
    .getByRole("option", {
      name: "Terapeuta de referência (titular da disciplina)",
    })
    .click();
  await page.getByLabel("Horas semanais").fill("15");
  await page.getByRole("button", { name: "Vincular à equipe" }).click();

  // Encerra a prescrição: os vínculos continuam montados — é o que o próprio
  // diálogo de encerramento promete, e é o que cria o cenário de §3.1.
  await page.goto(`/pacientes/${patientId}/cadastro-clinico#prescricao`);
  await page.getByRole("button", { name: "Encerrar prescrição" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Encerrar prescrição" })
    .click();
  await expect(page.getByText("15h / semana")).toBeHidden();

  // Prescreve Fonoaudiologia de novo, agora com 10h — abaixo das 15h que a
  // equipe continua entregando.
  await page.getByRole("combobox", { name: "Disciplina" }).click();
  await page.getByRole("option", { name: "Fonoaudiologia" }).click();
  await page.getByLabel("Carga horária semanal").fill("10");
  await page.getByRole("button", { name: "Salvar prescrição" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText(
    "Esta redução deixa a disciplina sobrealocada.",
  );
  // Sem prescrição vigente não há teto anterior: "passa de 0h" seria um número
  // inventado, do mesmo tipo que o encerramento de vínculo se recusa a citar.
  await expect(dialogo).toContainText("passa a ter 10h prescritas");
  await expect(dialogo).not.toContainText("passa de 0h");

  // E dá para sair: Esc fecha, sem recarregar a página e sem gravar nada.
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
});
