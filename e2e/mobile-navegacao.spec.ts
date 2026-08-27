import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Navegação mobile do app logado (#185, Etapa 1).
 *
 * Roda só no projeto `mobile-360`. Pré-requisito: `pnpm seed:e2e`.
 */
test.describe("BottomNav do coordenador", () => {
  test.beforeEach(async ({ page }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
    await page.goto("/agenda");
  });

  test("mostra a barra inferior com 4 destinos e o menu", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(barra).toBeVisible();
    await expect(barra.getByRole("link")).toHaveCount(4);
    await expect(
      barra.getByRole("button", { name: "Abrir menu de navegação" }),
    ).toBeVisible();
  });

  test("marca a rota atual na barra", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(barra.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("o menu abre o Drawer com a lista completa", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await barra
      .getByRole("button", { name: "Abrir menu de navegação" })
      .click();

    await expect(page.getByText("Menu Principal")).toBeVisible();
    const drawerNav = page.getByRole("navigation", {
      name: "Navegação mobile",
    });
    // Coordenador: 8 destinos do if/else + `/perfil` acrescentado fora dele.
    await expect(drawerNav.getByRole("link")).toHaveCount(9);
  });

  test("navega pelo 2º slot da barra", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await barra.getByRole("link", { name: "Pacientes" }).click();
    await expect(page).toHaveURL(/\/pacientes$/);
  });

  test("todo slot da barra cumpre 44px de alvo de toque", async ({ page }) => {
    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    const slots = await barra.getByRole("link").all();
    slots.push(barra.getByRole("button", { name: "Abrir menu de navegação" }));

    for (const slot of slots) {
      const caixa = await slot.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
      expect(caixa!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test("o rodapé da página não fica coberto pela barra", async ({ page }) => {
    await page.goto("/perfil");
    await page.waitForLoadState("networkidle");
    // Rola até o fim e confere que o último elemento do <main> termina acima
    // do topo da barra fixa.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const fundoDoMain = await page.evaluate(() => {
      // `document.querySelector("main")` pegaria o <main> do Container, que é
      // `flex-1` dentro de um `min-h-dvh` — sua caixa SEMPRE preenche até o
      // fim do viewport, com ou sem `padding-bottom`. Quem reflete o
      // `padding-bottom` reservado para a BottomNav é o conteúdo real da
      // página, dentro do <main> mais interno (o da própria rota).
      const mains = document.querySelectorAll("main");
      const conteudo = mains[mains.length - 1];
      const ultimoFilho = conteudo?.lastElementChild ?? conteudo;
      return ultimoFilho ? ultimoFilho.getBoundingClientRect().bottom : 0;
    });
    const topoDaBarra = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação rápida"]');
      return nav ? nav.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    });

    expect(fundoDoMain).toBeLessThanOrEqual(topoDaBarra);
  });
});

test.describe("BottomNav do terapeuta", () => {
  test("mostra os 4 destinos do papel, com rótulo curto", async ({ page }) => {
    await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
    await page.goto("/agenda");

    const barra = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(barra.getByRole("link")).toHaveCount(4);
    // `label` = "Agenda do Dia" (nome acessível), `labelCurto` = "Agenda".
    const primeiro = barra.getByRole("link", { name: "Agenda do Dia" });
    await expect(primeiro).toBeVisible();
    await expect(primeiro).toHaveText("Agenda");
  });
});

test.describe("barras de ação x BottomNav", () => {
  test("a barra de lote da validação não fica sob a BottomNav", async ({
    page,
  }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
    await page.goto("/validacao");
    await page.waitForLoadState("networkidle");

    const barraLote = page.locator(".sticky").first();
    const visivel = await barraLote.isVisible().catch(() => false);
    // A fila pode estar vazia no seed; nesse caso não há barra de lote e não há
    // o que medir. Registrar em vez de passar em silêncio.
    test.skip(!visivel, "fila de validação sem itens — barra de lote ausente");

    const caixaBarra = await barraLote.boundingBox();
    const caixaNav = await page
      .getByRole("navigation", { name: "Navegação rápida" })
      .boundingBox();

    expect(caixaBarra).not.toBeNull();
    expect(caixaNav).not.toBeNull();
    expect(
      caixaBarra!.y + caixaBarra!.height,
      "a barra de ação termina abaixo do topo da BottomNav — o botão fica inalcançável",
    ).toBeLessThanOrEqual(caixaNav!.y);
  });

  test("a BottomNav some quando um campo de texto recebe o teclado", async ({
    page,
  }) => {
    await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
    await page.goto("/perfil");
    await page.waitForLoadState("networkidle");

    // O Playwright não abre teclado virtual de verdade. Encolhemos o
    // `visualViewport` do mesmo jeito que o teclado encolheria e conferimos a
    // reação — é o sinal que o hook realmente observa em produção.
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, "height", { value: 380, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    await expect(
      page.getByRole("navigation", { name: "Navegação rápida" }),
    ).toBeHidden();
  });
});
