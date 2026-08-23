/**
 * Job agendado da Exportação Integral do Acervo (#374 ∪ #353).
 *
 * UMA varredura e SAI. Faz UM POST autenticado na rota interna do Next
 * (`EXPORT_JOB_URL`); é essa rota, em TypeScript dentro do app, que coleta o
 * acervo, monta o ZIP, calcula os SHA-256 e expira os bundles vencidos.
 *
 * ZERO dependência npm e ZERO lógica de negócio aqui — só o `fetch` nativo do
 * Node 22. A razão é o incidente #156: a imagem Docker de job NÃO herda o
 * `node_modules` do app (o Dockerfile lista os COPY e instala as dependências à
 * mão), então um import novo que não chegasse à imagem derrubaria o job em
 * produção com test/typecheck/lint todos verdes. O empacotamento depende de
 * `fflate`, que existe só no app.
 *
 * Env obrigatórias:
 *   EXPORT_JOB_URL    ex.: https://irisclinica.ia.br/api/internal/jobs/exportacao-integral
 *   EXPORT_JOB_TOKEN  segredo que autoriza o disparo. NUNCA é impresso.
 *
 * Execução:
 *   node scripts/exportacao-acervo.mjs
 */

import { fileURLToPath } from "node:url";

const PREFIXO = "[exportacao-acervo]";
const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Monta a requisição do disparo. Separada de `executarExportacao` para ser
 * verificável sem rede: é aqui que mora o contrato com a rota interna.
 */
export function montarRequisicao(url, token) {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  };
}

/**
 * Dispara a varredura e devolve o que REALMENTE aconteceu.
 *
 * Nunca lança. Os três modos de falha ficam separados de propósito
 * (`timeout` / `rede` / `status`): a mensagem deste job não pode afirmar UMA
 * causa quando a evidência não distingue — dizer "servidor fora do ar" para um
 * 500 do próprio app já custou um diagnóstico errado neste repo.
 */
export async function executarExportacao(url, token, deps = {}) {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const { url: alvo, init } = montarRequisicao(url, token);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeoutMs ?? TIMEOUT_MS,
  );

  try {
    const resposta = await doFetch(alvo, {
      ...init,
      signal: controller.signal,
    });
    const corpo = await resposta.text();
    if (!resposta.ok) {
      return {
        ok: false,
        falha: "status",
        erro: `HTTP ${resposta.status}`,
        corpo,
      };
    }
    return { ok: true, corpo };
  } catch (err) {
    const abortado = err?.name === "AbortError";
    return {
      ok: false,
      falha: abortado ? "timeout" : "rede",
      erro: err?.message ?? String(err),
      corpo: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const url = process.env.EXPORT_JOB_URL;
  const token = process.env.EXPORT_JOB_TOKEN;

  if (!url || !token) {
    console.error(
      `${PREFIXO} EXPORT_JOB_URL e EXPORT_JOB_TOKEN são obrigatórias.`,
    );
    process.exit(1);
  }

  const resultado = await executarExportacao(url, token);

  // O corpo da rota vai inteiro para o log: um 500 com a causa do lado do Next
  // chegaria ao operador como "falhou" e nada mais.
  console.log(
    `${PREFIXO} ${resultado.ok ? "ok" : "FALHOU"} ${resultado.corpo ?? ""}`,
  );

  if (!resultado.ok) {
    console.error(
      `${PREFIXO} disparo FALHOU (${resultado.falha}): ${resultado.erro}`,
    );
    // Reexecutar é seguro: a varredura é idempotente por status (um bundle já
    // `pronto` não é reservado de novo) e nada aqui fala com terceiro.
    process.exit(1);
  }

  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
