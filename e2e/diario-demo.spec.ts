import { test, expect } from "@playwright/test";

/**
 * E2E do fluxo demo do Diário (Fase 2): login terapeuta → abrir sessão do dia
 * pela agenda → captura rápida (texto) → consolidar → conferir que a Fila de
 * Pendências (`/pendencias`) mostra as sugestões da IA aguardando revisão.
 *
 * Pré-requisitos (semeados pelo Plano 4):
 *   1. DB migrado: `pnpm db:migrate`
 *   2. Seed demo: `pnpm seed:demo` — clínica `is_demo = true`, terapeuta
 *      `terapeuta.demo@iris.test` / `Senha Demo 123`, 4 pacientes, protocolo
 *      ativo e uma sessão de hoje do terapeuta demo.
 *   3. App servindo (o `webServer` do playwright.config sobe via `pnpm start`).
 *
 * O `is_demo = true` faz `resolveProvider` usar o `DemoStubProvider`, que gera
 * sugestões determinísticas a partir das frases da nota consolidada (sem LLM).
 */
test("terapeuta demo: captura rápida → consolida → Fila mostra sugestões a revisar", async ({
  page,
}) => {
  // Login do terapeuta da clínica demo (credenciais fixas do seed do Plano 4).
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("terapeuta.demo@iris.test");
  await page.getByLabel("Senha").fill("Senha Demo 123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  // Abre a sessão do dia semeada pelo seed demo, pela agenda.
  await page.goto("/agenda");
  await page.getByRole("link", { name: /Abrir sessão/i }).first().click();
  await expect(page).toHaveURL(/\/diario\/.+/);

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

  // A Fila de Pendências mostra a(s) sugestão(ões) da IA aguardando revisão.
  await page.goto("/pendencias");
  await expect(
    page.getByRole("heading", { name: "Sugestões da IA (candidatas)" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Revisar →/ }).first()).toBeVisible();
});
