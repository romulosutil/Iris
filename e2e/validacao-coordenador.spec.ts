import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * E2E do coordenador na fila de validação por evidência (#533 · auditoria
 * 360, `PR-01`/`Q-04`). A #512 tinha deixado `ValidacaoFila` sem página que a
 * montasse, com CI verde — este spec é o que teria acusado.
 *
 * Jornada em dois papéis, no mesmo banco semeado (`pnpm seed:e2e`):
 *
 *  1. Terapeuta demo consolida a sessão das 12:00 (paciente próprio deste
 *     spec) e DECIDE as 6 sugestões do `DemoStubProvider` (alta/média/baixa,
 *     alternadas): aprova as 2 de confiança baixa — com a confirmação de
 *     fricção — e descarta as outras 4. Só as baixas viram `evidence` com
 *     fricção, e por isso só elas entram na fila do coordenador; a sessão
 *     fica `revisada` ("falta só a coordenação encerrar").
 *  2. Coordenador demo, num contexto próprio: vê `Validação` no menu de
 *     administração (PR-02), abre a sessão e chega à fila pelo gesto novo
 *     "Abrir na fila de validação" (`?sessao=<id>` recorta os 2 itens),
 *     confirma um e reclassifica o outro com justificativa — os dois gestos
 *     gravam `evidence_revision`, a 3ª camada de governança.
 *
 * Pré-requisitos: DB migrado + `pnpm seed:e2e` (o seed demo semeia o marco
 * `mando` que é o alvo da reclassificação) + app servindo.
 */

const PACIENTE = "Paciente Validação E2E";

// 6 frases (>= 8 chars cada) → o stub alterna alta, média, baixa, alta,
// média, baixa. Trocar o número de frases muda quantos itens sobem à fila.
const NOTA_CONSOLIDADA = [
  "Pediu água sozinho durante o lanche.",
  "Apontou para o brinquedo preferido quando questionado.",
  "Montou a torre de blocos com dica gestual.",
  "Nomeou três figuras do livro sem ajuda.",
  "Respondeu ao próprio nome na segunda chamada.",
  "Guardou os brinquedos após o pedido verbal.",
].join(" ");

test("coordenador: abre /validacao pela sessão revisada, confirma uma evidência e reclassifica outra com justificativa", async ({
  page,
  browser,
}) => {
  // ── 1. Terapeuta: consolidar e decidir as 6 sugestões ─────────────────
  await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
  await page.goto("/agenda");
  // Mesmo corte por HORÁRIO de `diario-demo`/`revisao`: 12:00 é a sessão
  // deste spec (o nome pode vir mascarado no card).
  await page
    .getByRole("button", { name: /^Abrir agendamento de .* às 12:00$/ })
    .locator("visible=true")
    .first()
    .click();
  await expect(page).toHaveURL(/\/sessoes\/.+/);
  const caminhoSessao = new URL(page.url()).pathname;

  await page
    .getByLabel(/Anotação rápida/i)
    .fill("Pediu água sozinho e apontou para o brinquedo preferido.");
  await page.getByRole("button", { name: /Salvar captura/i }).click();
  await expect(page.getByText(/Captura salva/i)).toBeVisible();
  await page.getByLabel(/Nota consolidada/i).fill(NOTA_CONSOLIDADA);
  await page.getByRole("button", { name: /Consolidar sessão/i }).click();
  await expect(
    page.getByRole("heading", { name: "Revisar evidências" }),
  ).toBeVisible();

  const cartoes = page.locator("article");
  await expect(cartoes).toHaveCount(6);

  // Sempre o PRIMEIRO cartão: cada decisão tira o cartão da lista (sai do
  // filtro `sugerida`), então o próximo passa a ser o primeiro. Alta
  // confiança nasce compacto (lastro: "Revisar →" antes de qualquer gesto);
  // média/baixa nascem expandidos e pedem a confirmação de fricção.
  for (let restantes = 6; restantes > 0; restantes--) {
    const cartao = cartoes.first();
    const revisar = cartao.getByRole("button", { name: "Revisar →" });
    if ((await revisar.count()) > 0) await revisar.click();

    if ((await cartao.getByText("Confiança baixa").count()) > 0) {
      await cartao.getByLabel(/Confirmo que revisei/).check();
      await cartao.getByRole("button", { name: "Aprovar" }).click();
    } else {
      await cartao.getByRole("button", { name: "Descartar" }).click();
    }
    await expect(cartoes).toHaveCount(restantes - 1);
  }

  // Toda extração decidida + 2 itens na fila do coordenador ⇒ `revisada`.
  // Para o terapeuta é só informação: o gesto de encerrar não é dele.
  await expect(
    page.getByText(/falta só a coordenação encerrar o item na fila/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir na fila de validação" }),
  ).toHaveCount(0);

  // ── 2. Coordenador: nav → sessão → fila → confirmar + reclassificar ───
  const contextoCoordenador = await browser.newContext();
  const coord = await contextoCoordenador.newPage();
  await entrarComMfa(coord, "coordenador.demo@iris.test", "Senha Demo 123");

  // PR-02 — `Validação` tem porta no menu de administração do rail (com o
  // badge dos 2 itens), não só um link condicional em outra tela.
  await coord.goto("/agenda");
  await coord
    .getByRole("button", { name: "Menu do usuário — Administração" })
    .locator("visible=true")
    .first()
    .click();
  const linkValidacao = coord
    .getByRole("link", { name: "Validação" })
    .locator("visible=true")
    .first();
  await expect(linkValidacao).toBeVisible();
  await expect(linkValidacao).toContainText("2");

  // PR-01 — a sessão `revisada` dá ao coordenador o gesto que faltava.
  await coord.goto(caminhoSessao);
  await coord.getByRole("link", { name: "Abrir na fila de validação" }).click();
  await expect(coord).toHaveURL(/\/validacao\?sessao=/);
  await expect(coord.getByText(/Mostrando só os 2 itens/)).toBeVisible();

  const itens = coord
    .locator("li[id^='validacao-card-']")
    .filter({ hasText: PACIENTE });
  await expect(itens).toHaveCount(2);

  // Confirmar: `confirmarEvidenciaAction` → evidence_revision(confirmar).
  await itens
    .first()
    .getByRole("button", { name: "Aprovar Evidência" })
    .click();
  await expect(itens).toHaveCount(1);

  // Reclassificar com justificativa: alvo = marco `mando` semeado.
  await itens.first().getByRole("button", { name: "Editar" }).click();
  const dialogo = coord.getByRole("dialog", {
    name: "Reclassificar evidência",
  });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("combobox").click();
  await coord.getByRole("option", { name: /domínio mando/ }).click();
  await dialogo
    .getByLabel("Justificativa")
    .fill("O trecho descreve um mando: pediu o item desejado sem dica.");
  await dialogo
    .getByRole("button", { name: "Confirmar reclassificação" })
    .click();
  await expect(itens).toHaveCount(0);

  // Com a fila da sessão zerada, a sessão sai de `revisada` para `no_acervo`.
  await coord.goto(caminhoSessao);
  await expect(coord.getByText(/já está no acervo do paciente/)).toBeVisible();

  await contextoCoordenador.close();
});
