import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * E2E do fluxo demo do Diário (Fase 2): login terapeuta → abrir sessão do dia
 * pela agenda → captura rápida (texto) → consolidar → conferir que a jornada
 * unificada (#512) avança sozinha para o passo "Revisar evidências" e que a
 * rota legada `/pendencias` cai na fila nova `/sessoes` (redirect permanente,
 * T14).
 *
 * Pré-requisitos (semeados pelo Plano 4):
 *   1. DB migrado: `pnpm db:migrate`
 *   2. Seed demo: `pnpm seed:demo` — clínica `is_demo = true`, terapeuta
 *      `terapeuta.demo@iris.test` / `Senha Demo 123`, pacientes/protocolo
 *      ativos e UMA sessão de hoje por spec (09:00 aqui).
 *   3. App servindo (o `webServer` do playwright.config sobe o Next sozinho).
 *
 * O `is_demo = true` faz `resolveProvider` usar o `DemoStubProvider`, que gera
 * sugestões determinísticas a partir das frases da nota consolidada (sem LLM).
 */
test("terapeuta demo: captura rápida → consolida → passo Revisar evidências em foco", async ({
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
  // Cada spec tem SUA sessão no seed demo: consolidar tira a sessão do passo
  // "documentar" (R-05), então dois specs na mesma sessão fazem o segundo
  // esperar por um formulário que a página já não renderiza. `.first()` daria
  // exatamente essa colisão.
  //
  // O corte é pelo HORÁRIO, não pelo nome do paciente: o card mascara o nome
  // ("Abrir agendamento de Paciente (acesso restrito) às 09:00") quando quem
  // olha não tem vínculo/consentimento para ver a identificação. A hora está
  // sempre no rótulo — 09:00 é a sessão deste spec.
  await page
    .getByRole("button", { name: /^Abrir agendamento de .* às 09:00$/ })
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
  // #512: a `consolidarSessaoAction` revalida `/sessoes/[id]`, o gesto vira
  // `revisar_evidencias` e o passo em foco TROCA — o `ConsolidarForm`
  // desmonta junto com seu alerta "Sessão consolidada". O sinal de sucesso na
  // página unificada é o passo seguinte aparecer, não o alerta do formulário.
  await expect(
    page.getByRole("heading", { name: "Revisar evidências" }),
  ).toBeVisible();

  // Rota legada cai na fila nova (redirect permanente T14).
  //
  // A asserção aqui é sobre a FILA EXISTIR, não sobre esta sessão aparecer
  // nela: `/sessoes` lista só o que está travado (`src/lib/sessao/fila.ts` —
  // `extracao_travada`, `sem_nota_apos_24h`, `na_fila_validacao`), e sugestão
  // recém-gerada aguardando o terapeuta não é nenhum dos três. O passo
  // "Revisar evidências" já foi conferido acima, na própria sessão.
  await page.goto("/pendencias");
  await expect(page).toHaveURL(/\/sessoes(\?.*)?$/);
  await expect(page.getByRole("heading", { name: "Sessões" })).toBeVisible();
});
