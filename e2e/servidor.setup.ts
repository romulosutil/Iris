import { test as setup, expect } from "@playwright/test";

/**
 * Confirma que quem atende na `baseURL` é o Iris, antes de qualquer spec (#209).
 *
 * Por que existe: `reuseExistingServer` reaproveita *qualquer* processo servindo
 * na porta. Na sessão da PR #208 havia outro projeto na 3000 e a suíte rodou
 * contra ele — `/api/auth` respondia `{"error":"Not found"}`, que parece bug do
 * Iris e custa meia hora de diagnóstico. Falhar aqui, com mensagem que diz o
 * que está do outro lado, é mais barato que falhar no meio de um spec de fluxo.
 *
 * As duas asserções se complementam: `/api/auth/ok` prova que existe um
 * Better-Auth montado (mata o "outro app qualquer na porta"), e o título prova
 * que o app é o Iris (mata o "outro app com Better-Auth").
 */
setup("a baseURL está servindo o Iris", async ({ request, baseURL }) => {
  const auth = await request.get("/api/auth/ok");
  expect(
    auth.ok(),
    `Quem atende em ${baseURL} não expõe /api/auth/ok (HTTP ${auth.status()}). ` +
      `Provavelmente é outro projeto na mesma porta — pare-o ou use outra porta.`,
  ).toBe(true);

  const home = await request.get("/");
  const html = await home.text();
  expect(
    html,
    `A página em ${baseURL} não parece ser do Iris. Confira que porta o app subiu.`,
  ).toContain("<title>Iris");
});
