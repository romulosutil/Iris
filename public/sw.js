/*
 * Service Worker do Iris — #185, Etapa 2.
 *
 * POLÍTICA, em uma frase: só asset estático entra em cache; tudo mais vai
 * direto à rede e o SW nem intercepta.
 *
 * Por que allowlist e não denylist: dado clínico de paciente em cache
 * não-cifrado do navegador é incidente LGPD. Uma denylist ("não cacheie
 * /pacientes") erra em silêncio toda vez que uma rota nova nasce — e rota nova
 * nasce a cada fatia de produto. Com allowlist, o padrão de uma rota
 * desconhecida é NÃO cachear.
 *
 * Navegação (`request.mode === "navigate"`) é caso à parte: vai sempre à rede
 * e, quando a rede falha, responde a página `/offline` do precache. A resposta
 * de rede NUNCA é gravada — é ela que carrega o HTML com nome de paciente.
 *
 * Este arquivo é executado tal e qual por `src/app/sw.test.ts`. Manter
 * `self.__podeCachear` e `self.__NOME_CACHE` exportados: são o contrato do
 * teste. Se um dia forem removidos, o teste quebra alto — que é o desejado.
 */

const NOME_CACHE = "iris-estatico-v1";
const PAGINA_OFFLINE = "/offline";

/** Prefixos de caminho cacheáveis. Acrescentar aqui é decisão consciente. */
const PREFIXOS_PERMITIDOS = ["/_next/static/", "/fonts/", "/icons/", "/brand/"];

/** Caminhos exatos cacheáveis. */
const CAMINHOS_PERMITIDOS = ["/manifest.webmanifest", "/icon.svg"];

/**
 * @param {string} url
 * @param {string} metodo
 * @returns {boolean}
 */
function podeCachear(url, metodo) {
  if (metodo !== "GET") return false;

  let alvo;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }

  // Terceiro nunca entra: não controlamos o conteúdo nem a validade.
  if (alvo.origin !== self.location.origin) return false;

  const caminho = alvo.pathname;

  // `/_next/data/` carrega o payload de rota — inclui dado de paciente — e
  // começa com `/_next/`. Só `/_next/static/` é imutável e sem dado.
  if (CAMINHOS_PERMITIDOS.includes(caminho)) return true;
  return PREFIXOS_PERMITIDOS.some((p) => caminho.startsWith(p));
}

// Contrato exercitado por `src/app/sw.test.ts`.
self.__podeCachear = podeCachear;
self.__NOME_CACHE = NOME_CACHE;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(NOME_CACHE)
      .then((cache) => cache.addAll([PAGINA_OFFLINE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((n) => n.startsWith("iris-estatico-") && n !== NOME_CACHE)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  // Navegação: rede primeiro, `/offline` como último recurso. A resposta
  // NUNCA é gravada — é ela que carrega o HTML com dado de paciente.
  if (requisicao.mode === "navigate") {
    evento.respondWith(
      fetch(requisicao).catch(() =>
        caches
          .open(NOME_CACHE)
          .then((cache) => cache.match(PAGINA_OFFLINE))
          .then(
            (resposta) =>
              resposta ??
              new Response("Sem conexão.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              }),
          ),
      ),
    );
    return;
  }

  if (!podeCachear(requisicao.url, requisicao.method)) {
    // Sem `respondWith`: o navegador segue o caminho normal. Nada é observado,
    // nada é gravado.
    return;
  }

  evento.respondWith(
    caches.open(NOME_CACHE).then((cache) =>
      cache.match(requisicao).then((emCache) => {
        if (emCache) return emCache;
        return fetch(requisicao).then((resposta) => {
          // Só resposta completa e OK entra. Resposta parcial (206) ou opaca
          // corrompe o cache em silêncio.
          if (resposta.ok && resposta.status === 200) {
            cache.put(requisicao, resposta.clone());
          }
          return resposta;
        });
      }),
    ),
  );
});
