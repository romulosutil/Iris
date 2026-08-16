// Iris PWA Service Worker — Cache Exclusivo de Assets Estáticos
// CONTRATO LGPD: NUNCA CACHEAR APIS (/api/*), DADOS DE SAÚDE OU DIÁRIOS DE PACIENTES.

const CACHE_NAME = "iris-static-v1";
const STATIC_ASSETS = [
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/brand/iris-logo.svg",
];

const NEVER_CACHE_PATTERNS = [
  /\/api\//,
  /\/pacientes/,
  /\/diario/,
  /\/agenda/,
  /\/validacao/,
  /\/relatorios/,
  /\/clinica/,
  /\/excecoes/,
  /\/supervisao/,
  /\/alertas-risco/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Guardrail LGPD: Se a requisição for API ou rota dinâmica/autenticada, buscar direto da rede
  if (
    event.request.method !== "GET" ||
    NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))
  ) {
    return;
  }

  // Apenas cachear assets estáticos (JS, CSS, Imagens estáticas, Fontes)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff2?|css|js)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200 && response.type === "basic") {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      }),
    );
  }
});
