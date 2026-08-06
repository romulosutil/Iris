import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

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
  // Terapeuta é papel clínico: segundo fator obrigatório desde a Fase 6.2b.
  await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
  // `/` é a landing pública e redireciona quem tem sessão para `/agenda` (#209).
  await expect(page).toHaveURL("/agenda");

  // Abre a sessão do dia e consolida (gera as sugestões via DemoStubProvider).
  await page.goto("/agenda");
  // O nome acessível do botão vem do `aria-label` ("Abrir agendamento de <nome>
  // às <hora>"), não do texto visível ("Abrir"). O spec procurava um link
  // chamado "Abrir sessão" — outra visão da agenda, inexistente aqui.
  // `visible=true` descarta a variante responsiva de 0x0 que fica no DOM e que
  // faria o `.first()` esperar para sempre por algo que nunca aparece.
  await page
    .getByRole("button", { name: /^Abrir agendamento de / })
    .locator("visible=true")
    .first()
    .click();
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
  await page
    .getByRole("link", { name: /Revisar →/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/revisao\/.+/);
  await expect(
    page.getByRole("heading", { name: "Revisão de extrações" }),
  ).toBeVisible();

  // Cartão de alta confiança nasce COMPACTO: tem um botão "Revisar →" e NÃO
  // expõe "Aprovar" ainda (o botão de aprovar só existe no estado expandido).
  // Referência POSICIONAL ao cartão, não por filtro. Um locator filtrado por
  // "tem o botão Revisar →" é reavaliado a cada uso: no instante em que o
  // cartão abre, o botão some, o filtro deixa de casar e a asserção seguinte
  // falha com "element(s) not found" mesmo com o lastro funcionando. Filtrar
  // pelo texto também não serve — os cartões começam com o mesmo cabeçalho
  // ("SUGERIDA Evidência Alta confiança…") e `.first()` cairia no cartão errado.
  const cartoes = page.locator("article");
  const totalCartoes = await cartoes.count();
  let indiceCompacto = -1;
  for (let i = 0; i < totalCartoes; i++) {
    if (
      (await cartoes
        .nth(i)
        .getByRole("button", { name: "Revisar →" })
        .count()) > 0
    ) {
      indiceCompacto = i;
      break;
    }
  }
  expect(
    indiceCompacto,
    "nenhum cartão compacto na fila",
  ).toBeGreaterThanOrEqual(0);

  const compacto = cartoes.nth(indiceCompacto);
  await expect(compacto).toBeVisible();
  await expect(compacto.getByRole("button", { name: "Aprovar" })).toHaveCount(
    0,
  );

  // Abrir o cartão (o lastro de exibição) revela o botão de aprovar.
  await compacto.getByRole("button", { name: "Revisar →" }).click();
  await expect(compacto.getByRole("button", { name: "Aprovar" })).toBeVisible();

  // Aprovar remove a sugestão da lista (vira `aprovada`, sai do filtro).
  await compacto.getByRole("button", { name: "Aprovar" }).click();
  await expect(
    page.getByText(/Nenhuma sugestão pendente|sua revisão/i).first(),
  ).toBeVisible();
});
