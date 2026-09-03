import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Regressão de #598: o helper de sessão precisa reexecutar o `verify-totp`
 * quando o servidor responde **429**, do mesmo jeito que já reexecutava o
 * `sign-in/email`.
 *
 * ## Por que este spec existe em vez de "rodei três vezes e passou"
 *
 * O defeito da #598 é um FLAKE. Reexecutar até ficar verde é exatamente o que
 * um flake faz; não prova nada. O que prova é forçar o 429 e afirmar que o
 * login termina mesmo assim.
 *
 * ## Como o 429 é forçado — de verdade, pelo servidor
 *
 * O 429 aqui NÃO é fabricado. Ele sai do rate limit em memória do próprio
 * Better-Auth, o mesmo que derrubou `revisao.spec.ts` em produção de CI: o
 * plugin de segundo fator declara `window: 10s, max: 3` para `/two-factor/*`,
 * e o balde do limitador é por (IP, rota). Três POSTs em `verify-totp` dentro
 * da janela esgotam a cota; o quarto — o do helper — volta 429 de verdade.
 *
 * ## Por que interceptar por `page.request.post` e não por `page.route`
 *
 * Medido nesta versão do Playwright (1.62.1): `page.route` NÃO intercepta
 * requisições feitas pelo `APIRequestContext` (`page.request`) — o handler não
 * dispara e a resposta chega intacta do servidor. Como o helper fala por
 * `page.request`, `route` não alcança essas chamadas.
 *
 * O embrulho abaixo é, então, um ESPIÃO, não um dublê: ele não inventa nenhuma
 * resposta. Só faz duas coisas — registra o status de cada POST do helper e,
 * no instante em que o `two-factor/enable` volta (isto é, imediatamente antes
 * do `verify-totp`), esgota a cota da rota para que o servidor responda 429
 * sozinho. Sem esse acoplamento de tempo, a janela de 10s poderia expirar entre
 * a preparação e a chamada, e o teste passaria sem exercitar nada.
 */
test("entrarComMfa reexecuta o verify-totp quando o servidor devolve 429 (#598)", async ({
  page,
}) => {
  // Cada 429 custa 6s de backoff, e a cota só libera 10s depois da última
  // chamada aceita: são duas esperas até o servidor voltar a aceitar.
  test.setTimeout(120_000);

  const origem = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ).origin;
  const cabecalhos = { Origin: origem, Referer: `${origem}/login` };

  const original = page.request.post.bind(page.request);
  const tentativas: { url: string; status: number }[] = [];

  page.request.post = async (url, opcoes) => {
    const resposta = await original(url, opcoes);
    tentativas.push({ url: String(url), status: resposta.status() });

    if (String(url).includes("/two-factor/enable")) {
      // Esgota a cota de `/two-factor/verify-totp` (janela 10s, máx. 3) no
      // instante anterior à chamada do helper. Corpo vazio: o limitador roda
      // antes do handler, então a requisição é contabilizada sem consumir
      // nenhum código TOTP nem mexer no enrollment.
      for (let i = 0; i < 3; i++) {
        await original("/api/auth/two-factor/verify-totp", {
          data: {},
          headers: cabecalhos,
        });
      }
    }

    return resposta;
  };

  try {
    await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
  } finally {
    page.request.post = original;
  }

  const verificacoes = tentativas.filter((t) =>
    t.url.includes("/two-factor/verify-totp"),
  );

  // 1. O arranjo realmente produziu o 429 — sem esta asserção o teste passaria
  //    verde mesmo que a cota tivesse expirado antes da chamada, provando nada.
  expect(
    verificacoes.map((t) => t.status),
    `esperava ao menos um 429 no verify-totp; tentativas: ${JSON.stringify(verificacoes)}`,
  ).toContain(429);

  // 2. O helper reexecutou: houve mais de uma tentativa...
  expect(verificacoes.length).toBeGreaterThan(1);

  // 3. ...e a última foi aceita pelo servidor (código TOTP novo, derivado a
  //    cada tentativa dentro da fábrica de `postarAteSair429`).
  expect(verificacoes.at(-1)?.status).toBe(200);

  // 4. E o login concluiu de fato: sessão emitida, shell carregado. `/`
  //    redireciona quem tem sessão para `/agenda`.
  await expect(page).toHaveURL("/agenda");
});
