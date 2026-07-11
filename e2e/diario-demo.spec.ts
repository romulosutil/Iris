import { test, expect } from "@playwright/test";

/**
 * E2E do fluxo demo do Diário (Plano 2, Fase 2): login terapeuta → abrir
 * sessão → captura rápida (texto) → consolidar → conferir que a Fila de
 * Pendências (`/pendencias`) mostra as sugestões da IA aguardando revisão.
 *
 * Pré-requisitos (quando o seed demo existir — ver nota abaixo):
 *   1. DB migrado: `pnpm db:migrate`
 *   2. Seed de uma clínica demo (`is_demo = true`) com paciente, protocolo,
 *      sessão do dia e terapeuta — script ainda não existe neste repo.
 *   3. App servindo (o `webServer` do playwright.config sobe via `pnpm start`).
 *
 * Por que este teste está `skip`: o seed demo completo (clínica `is_demo`,
 * paciente, sessão do dia, terapeuta com credenciais fixas, e o stub do
 * `ExtractionProvider` de fato produzindo sugestões visíveis na Fila) é
 * escopo do Plano 4 — ver `docs/` do Plano 2 e o commit
 * "feat(fase-2): costura ExtractionProvider (stub demo + null produção)"
 * (`5af1334`), que só acopla o provider, sem seed de dados demo. Sem esse
 * seed não há como logar como terapeuta demo nem afirmar que a Fila mostra
 * "N sugestões / Revisar" de forma determinística. Reabilitar removendo o
 * `test.skip` assim que o seed demo (Plano 4) existir e expuser as
 * credenciais/rota esperadas.
 */
test.skip(
  true,
  "requer seed demo do Plano 4 (clínica is_demo + paciente + sessão + terapeuta semeados)",
);

test("terapeuta demo: captura rápida → consolida → Fila mostra sugestões a revisar", async ({
  page,
}) => {
  // Login do terapeuta da clínica demo. Credenciais e rota exatas dependem
  // do script de seed demo do Plano 4 — ajustar ao habilitar este teste.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("terapeuta.demo@iris.test");
  await page.getByLabel("Senha").fill("Senha Demo 123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  // Abre a sessão do dia semeada pelo seed demo e faz uma captura rápida em
  // texto (sem áudio — mais simples e determinístico para o E2E).
  await page.goto("/agenda");
  await page.getByRole("link", { name: /Abrir sessão/i }).first().click();
  await expect(page).toHaveURL(/\/diario\/.+/);

  await page
    .getByLabel(/Captura rápida/i)
    .fill("Pediu água sozinho e apontou para o brinquedo preferido.");
  await page.getByRole("button", { name: /Salvar captura/i }).click();

  // Consolida a sessão (costura da extração via ExtractionProvider stub demo).
  await page.getByRole("button", { name: /Consolidar sessão/i }).click();
  await expect(page.getByText(/Sessão consolidada/i)).toBeVisible();

  // A Fila de Pendências mostra a(s) sugestão(ões) da IA aguardando revisão.
  await page.goto("/pendencias");
  await expect(
    page.getByRole("heading", { name: "Sugestões da IA (candidatas)" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Revisar →/ }).first()).toBeVisible();
});
