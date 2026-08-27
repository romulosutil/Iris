import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * PWA de ponta a ponta (#185, Etapa 2). Roda no projeto `mobile-360`.
 *
 * ⚠️ O `webServer` do Playwright sobe `next start` — produção. É condição
 * necessária: `RegistrarServiceWorker` não registra nada fora de produção.
 */
test("serve o manifesto e o navegador o enxerga", async ({ page }) => {
  await page.goto("/");

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();

  const resposta = await page.request.get(href!);
  expect(resposta.status()).toBe(200);

  const manifesto = await resposta.json();
  expect(manifesto.display).toBe("standalone");
  expect(manifesto.start_url).toBe("/");
  expect(manifesto.icons).toHaveLength(4);
});

test("todos os ícones do manifesto respondem 200", async ({ page }) => {
  const resposta = await page.request.get("/manifest.webmanifest");
  const manifesto = await resposta.json();

  for (const icone of manifesto.icons) {
    const r = await page.request.get(icone.src);
    expect(r.status(), `${icone.src} não respondeu 200`).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("registra o service worker", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15_000 },
  );
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toContain("/sw.js");
});

test("cacheia asset estático e NÃO cacheia rota de app", async ({ page }) => {
  await entrarComMfa(page, "e2e@iris.test", "Senha E2E 123");
  // `entrarComMfa` já deixa a página em "/" — esperar o SW assumir controle
  // AQUI, antes de navegar para /pacientes. Um `waitForFunction` só depois da
  // navegação corre risco real: o registro dispara na primeira carga, mas o
  // `clients.claim()` pode não terminar a tempo do documento seguinte, e
  // então o controller nunca aparece (timeout) — a corrida é entre navegação
  // e ativação, não algo que "esperar mais" na tela errada resolve.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15_000 },
  );
  await page.goto("/pacientes");
  await page.waitForLoadState("networkidle");
  // Segunda visita: dá ao SW a chance de gravar o que ele fosse gravar.
  await page.reload();
  await page.waitForLoadState("networkidle");

  const chaves = await page.evaluate(async () => {
    const nomes = await caches.keys();
    const todas: string[] = [];
    for (const nome of nomes) {
      const cache = await caches.open(nome);
      for (const req of await cache.keys())
        todas.push(new URL(req.url).pathname);
    }
    return todas;
  });

  // Prova positiva: o cache não está vazio (senão o teste abaixo passaria por
  // vacuidade — SW que não cacheia nada também nunca cacheia paciente).
  expect(
    chaves.some(
      (c) => c.startsWith("/_next/static/") || c.startsWith("/icons/"),
    ),
    `cache não recebeu nenhum asset estático: ${JSON.stringify(chaves)}`,
  ).toBe(true);

  // Prova negativa: nenhuma rota de app nem de API entrou.
  const proibidos = chaves.filter(
    (c) =>
      c.startsWith("/api/") ||
      c.startsWith("/_next/data/") ||
      ["/pacientes", "/agenda", "/diario", "/validacao", "/relatorios"].some(
        (r) => c === r || c.startsWith(`${r}/`),
      ),
  );
  expect(
    proibidos,
    `rota de dado clínico entrou no cache do navegador: ${JSON.stringify(proibidos)}`,
  ).toEqual([]);
});

test("mostra a página offline quando a rede cai", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.goto("/agenda").catch(() => {
    // Navegação offline pode rejeitar; o que importa é o que ficou na tela.
  });

  await expect(
    page.getByRole("heading", { name: "Sem conexão" }),
  ).toBeVisible();
  await context.setOffline(false);
});
