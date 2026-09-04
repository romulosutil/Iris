import { test, expect } from "@playwright/test";
import { entrarComMfa } from "./helpers/sessao";

/**
 * Regressão: o helper de sessão precisa reexecutar o POST quando a CONEXÃO cai
 * (`ECONNRESET`), não só quando o servidor responde 429.
 *
 * ## O defeito
 *
 * `postarAteSair429` decidia o retry por `resposta.status() === 429`. Um
 * `ECONNRESET` nunca chega a ser resposta: o `APIRequestContext` LANÇA
 * (`apiRequestContext.post: read ECONNRESET`), então a exceção escapava da
 * função antes do laço e derrubava o login inteiro. Medido em CI:
 * `represcricao-mv4.spec.ts:129` falhou na 1ª tentativa por isso e passou
 * limpo no retry do próprio Playwright — flake por infra, não regressão.
 *
 * ## Por que este spec e não "rodei de novo e passou"
 *
 * Reexecutar até ficar verde é o que um flake faz; não prova nada. O que prova
 * é FORÇAR a queda de conexão e afirmar que o login termina mesmo assim.
 *
 * ## Por que o erro é injetado, diferente do spec do 429
 *
 * O 429 do `sessao-retry-429.spec.ts` sai do servidor de verdade, porque dá
 * para esgotar a cota do rate limit de propósito. `ECONNRESET` não tem
 * gatilho determinístico — depende de o `webServer` derrubar o socket sob
 * carga. Injetar é a única forma de exercitar o caminho toda vez.
 *
 * A injeção é fiel ao que o CI produziu: um `Error` cuja `message` é a mesma
 * que o Playwright emite, que é exatamente o que o helper inspeciona. E é
 * pontual — cai só o PRIMEIRO `sign-in/email`; todo o resto do fluxo fala com
 * o servidor real.
 *
 * ## Por que DUAS mensagens
 *
 * A mesma queda chega com dois textos, e cobrir só um deixa o flake vivo: com o
 * retry já tratando `read ECONNRESET`, a execução seguinte reprovou três casos
 * de `mobile-app.spec.ts` com `socket hang up` — socket fechado ANTES do
 * primeiro byte de resposta. Cada mensagem é um caso, para que um predicado que
 * volte a reconhecer só uma delas fique vermelho nomeando qual.
 */
const QUEDAS_DE_CONEXAO = [
  "apiRequestContext.post: read ECONNRESET",
  "apiRequestContext.post: socket hang up",
] as const;
for (const mensagem of QUEDAS_DE_CONEXAO) {
  test(`entrarComMfa reexecuta o sign-in quando a conexão cai com "${mensagem}"`, async ({
    page,
  }) => {
    // Uma queda custa 6s de backoff, e o fluxo ainda faz enable + verify-totp.
    test.setTimeout(120_000);

    const original = page.request.post.bind(page.request);
    const tentativas: { url: string; resultado: string }[] = [];
    let jaDerrubou = false;

    page.request.post = async (url, opcoes) => {
      const alvo = String(url);

      // Derruba SÓ o primeiro sign-in. O erro é lançado, não respondido — é
      // esse o formato que escapava do laço antes da correção.
      if (alvo.includes("/sign-in/email") && !jaDerrubou) {
        jaDerrubou = true;
        tentativas.push({ url: alvo, resultado: mensagem });
        throw new Error(mensagem);
      }

      const resposta = await original(url, opcoes);
      tentativas.push({ url: alvo, resultado: String(resposta.status()) });
      return resposta;
    };

    try {
      await entrarComMfa(page, "terapeuta.demo@iris.test", "Senha Demo 123");
    } finally {
      page.request.post = original;
    }

    const logins = tentativas.filter((t) => t.url.includes("/sign-in/email"));

    // 1. O arranjo realmente derrubou a conexão — sem isto o teste passaria
    //    verde sem exercitar nada.
    expect(
      jaDerrubou,
      "o espião nunca chegou a derrubar o sign-in; o helper mudou de rota?",
    ).toBe(true);
    expect(logins[0]?.resultado).toBe(mensagem);

    // 2. O helper reexecutou em vez de propagar a exceção...
    expect(
      logins.length,
      `esperava uma nova tentativa após a queda de conexão; tentativas: ${JSON.stringify(logins)}`,
    ).toBeGreaterThan(1);

    // 3. ...e a última foi aceita pelo servidor de verdade.
    expect(logins.at(-1)?.resultado).toBe("200");

    // 4. E o login concluiu de fato: sessão emitida, shell carregado. `/`
    //    redireciona quem tem sessão para `/agenda`.
    await expect(page).toHaveURL("/agenda");
  });
}
