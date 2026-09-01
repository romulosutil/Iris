import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * E2E do fluxo demo do Diário (Fase 2): login terapeuta → abrir sessão do dia
 * pela agenda → captura rápida (texto) → consolidar → conferir que a fila de
 * Sessões (`/pendencias` → `/sessoes`, redirect permanente #512 · T14) mostra
 * a sessão aguardando revisão das sugestões da IA.
 *
 * Pré-requisitos (semeados pelo Plano 4):
 *   1. DB migrado: `pnpm db:migrate`
 *   2. Seed demo: `pnpm seed:demo` — clínica `is_demo = true`, terapeuta
 *      `terapeuta.demo@iris.test` / `Senha Demo 123`, 4 pacientes, protocolo
 *      ativo e uma sessão de hoje do terapeuta demo.
 *   3. App servindo (o `webServer` do playwright.config sobe o Next sozinho).
 *
 * O `is_demo = true` faz `resolveProvider` usar o `DemoStubProvider`, que gera
 * sugestões determinísticas a partir das frases da nota consolidada (sem LLM).
 */
test("terapeuta demo: captura rápida → consolida → Fila mostra sugestões a revisar", async ({
  page,
}) => {
  // Login do terapeuta da clínica demo (credenciais fixas do seed do Plano 4).
  // Terapeuta é papel clínico: segundo fator obrigatório desde a Fase 6.2b.
  await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
  // `/` é a landing pública e redireciona quem tem sessão para `/agenda` (#209).
  await expect(page).toHaveURL("/agenda");

  // Abre a sessão do dia semeada pelo seed demo, pela agenda.
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
  // #512 · T14 (R-34): `/diario/[id]` virou redirect permanente para
  // `/sessoes/[id]` — o clique acima ainda usa o href antigo (débito de
  // fiação interna fora do escopo de T14), então o navegador segue o
  // redirect e a URL final já é a nova.
  await expect(page).toHaveURL(/\/sessoes\/.+/);

  // Captura rápida em texto (aba "Texto" já é a padrão — mais determinístico
  // que áudio para o E2E). O rótulo do campo é "Anotação rápida".
  await page
    .getByLabel(/Anotação rápida/i)
    .fill("Pediu água sozinho e apontou para o brinquedo preferido.");
  await page.getByRole("button", { name: /Salvar captura/i }).click();
  await expect(page.getByText(/Captura salva/i)).toBeVisible();

  // Consolida a sessão. A "Nota consolidada" é obrigatória e é o texto que o
  // DemoStubProvider fatia em frases (≥ 8 caracteres) para gerar as sugestões.
  await page
    .getByLabel(/Nota consolidada/i)
    .fill(
      "Pediu água sozinho durante o lanche. Apontou para o brinquedo preferido quando questionado.",
    );
  await page.getByRole("button", { name: /Consolidar sessão/i }).click();
  await expect(page.getByText(/Sessão consolidada/i)).toBeVisible();

  // A fila de Sessões (`/pendencias` → `/sessoes`, redirect permanente T14)
  // mostra a sessão travada aguardando revisão da(s) sugestão(ões) da IA.
  await page.goto("/pendencias");
  await expect(page).toHaveURL(/\/sessoes(\?.*)?$/);
  await expect(
    page.getByRole("link", { name: /Revisar/ }).first(),
  ).toBeVisible();
});
