import { test, expect } from "@playwright/test";

/**
 * E2E da Tela de Revisão (Fase 3 Plano 2): terapeuta demo consolida uma sessão,
 * abre a revisão pela Fila de Pendências e exercita o INVARIANTE DE LASTRO —
 * aprovar exige abrir o cartão. Num cartão de alta confiança (compacto), o botão
 * "Aprovar" não existe até clicar em "Revisar →"; só então a aprovação é
 * possível. Isso substitui a regra estatística anti-rubber-stamp (§3): não há
 * lote a carimbar, cada aprovação passa pela exibição do conteúdo.
 *
 * Pré-requisitos (idênticos ao diario-demo.spec.ts): DB migrado + `seed:demo` +
 * app servindo. O `DemoStubProvider` gera sugestões determinísticas alternando
 * confiança (alta/média/baixa) a partir das frases da nota consolidada.
 */
test("terapeuta demo: revisão exige abrir o cartão antes de aprovar (lastro)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("terapeuta.demo@iris.test");
  await page.getByLabel("Senha").fill("Senha Demo 123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  // Abre a sessão do dia e consolida (gera as sugestões via DemoStubProvider).
  await page.goto("/agenda");
  await page.getByRole("link", { name: /Abrir sessão/i }).first().click();
  await expect(page).toHaveURL(/\/diario\/.+/);
  await page
    .getByLabel(/Nota consolidada/i)
    .fill(
      "Pediu água sozinho durante o lanche. Apontou para o brinquedo preferido quando questionado. Montou a torre de blocos com dica gestual.",
    );
  await page.getByRole("button", { name: /Consolidar sessão/i }).click();
  await expect(page.getByText(/Sessão consolidada/i)).toBeVisible();

  // Entra na revisão pela Fila de Pendências (o link agora aponta /revisao).
  await page.goto("/pendencias");
  await page.getByRole("link", { name: /Revisar →/ }).first().click();
  await expect(page).toHaveURL(/\/revisao\/.+/);
  await expect(
    page.getByRole("heading", { name: "Revisão de extrações" }),
  ).toBeVisible();

  // Cartão de alta confiança nasce COMPACTO: tem um botão "Revisar →" e NÃO
  // expõe "Aprovar" ainda (o botão de aprovar só existe no estado expandido).
  const compacto = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "Revisar →" }) })
    .first();
  await expect(compacto).toBeVisible();
  await expect(compacto.getByRole("button", { name: "Aprovar" })).toHaveCount(0);

  // Abrir o cartão (o lastro de exibição) revela o botão de aprovar.
  await compacto.getByRole("button", { name: "Revisar →" }).click();
  await expect(compacto.getByRole("button", { name: "Aprovar" })).toBeVisible();

  // Aprovar remove a sugestão da lista (vira `aprovada`, sai do filtro).
  await compacto.getByRole("button", { name: "Aprovar" }).click();
  await expect(
    page.getByText(/Nenhuma sugestão pendente|sua revisão/i).first(),
  ).toBeVisible();
});
