import type { NextConfig } from "next";

/**
 * CSP em modo REPORT-ONLY (S-06, #530): medir antes de bloquear. A política
 * abaixo é o alvo mínimo de uma futura CSP de bloqueio — não a versão que
 * "passa em tudo". O que ela precisa deixar passar hoje:
 *
 * - GA e Clarity, que S-01 mantém SÓ nas rotas públicas (`(publico)/layout`):
 *   `googletagmanager.com`, `*.google-analytics.com`, `*.analytics.google.com`,
 *   `*.clarity.ms`.
 * - GlitchTip (browser SDK do Sentry) em `logs.irisclinica.ia.br`.
 * - `'unsafe-inline'` em script/style: o Next injeta scripts inline sem nonce
 *   e o GA usa `<Script>` inline; `'unsafe-eval'` só fora de produção (React
 *   Refresh). Tirar os dois é o trabalho de quem ligar a versão de bloqueio.
 * - `blob:` em media/worker: o ditado do diário grava áudio local
 *   (`use-gravador.ts`) e o service worker do PWA.
 *
 * Sem `report-uri`: não existe endpoint de coleta (pendência registrada na
 * PR). Enquanto isso, as violações aparecem no console do navegador.
 */
function cspReportOnly(): string {
  const dev = process.env.NODE_ENV === "development";
  const diretivas = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms",
    "font-src 'self' data:",
    "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://logs.irisclinica.ia.br",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  return diretivas.join("; ");
}

/**
 * Cabeçalhos de segurança globais (S-06, #530). Aplicados a TODA rota via
 * `source: "/(.*)"` — o Next soma as entradas que casam, então a de `/auth.md`
 * continua valendo.
 *
 * - `X-Frame-Options: DENY` + `frame-ancestors 'none'`: nenhuma tela clínica
 *   em iframe de terceiro (clickjacking). Nada no produto se enquadra.
 * - `Referrer-Policy: strict-origin-when-cross-origin`: link externo clicado
 *   de `/pacientes/<uuid>` leva só a origem, não o UUID.
 * - `Permissions-Policy`: microfone SÓ na própria origem — o ditado do diário
 *   usa `getUserMedia({audio})`; fechar tudo quebraria a gravação com CI
 *   verde. Câmera, geolocalização e pagamento fechados.
 * - HSTS de 1 ano SEM `includeSubDomains` (revisão da PR #545): a diretiva
 *   valeria por 1 ano para TODO subdomínio de `irisclinica.ia.br` — hosts de
 *   infra (painel, logs, storage) ainda sem HTTPS válido ficariam
 *   inacessíveis e o servidor não consegue desfazer o cache do navegador.
 *   Não há medição de que todos servem HTTPS válido. Ligar `includeSubDomains`
 *   só depois de medir os subdomínios (pendência registrada na PR). Browsers
 *   ignoram o cabeçalho em `http://`, então o dev local não é afetado.
 */
function cabecalhosDeSeguranca(): { key: string; value: string }[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    },
    { key: "Content-Security-Policy-Report-Only", value: cspReportOnly() },
  ];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg-boss"],
  // Imagem Docker enxuta para deploy no Easypanel (VPS). Desligado no build
  // local do Windows: o copy de symlinks do standalone falha com EPERM (o
  // Windows exige privilégio p/ symlink). CI (Linux) e o deploy mantêm o
  // standalone; só o build local de dev no Windows é afetado.
  output: process.platform === "win32" ? undefined : "standalone",
  // Trace do standalone a partir da raiz do projeto (evita inferir um pai
  // errado quando há outros lockfiles no sistema).
  outputFileTracingRoot: import.meta.dirname,
  // `/termos` e `/privacidade` leem o markdown de `docs/legal/` como fonte
  // única de verdade. Elas são `force-static`, então a leitura acontece no
  // build — mas o estágio `runner` da imagem (`infra/Dockerfile`) copia só
  // `.next/standalone`, `.next/static` e `public`: `docs/` não chega lá. Se
  // alguma dessas rotas deixar de ser estática, o `readFile` daria 500 em
  // produção passando verde em todo teste local. Declarar o include aqui é o
  // cinto que impede isso.
  outputFileTracingIncludes: {
    "/termos": ["./docs/legal/termos-de-uso.md"],
    "/privacidade": ["./docs/legal/politica-privacidade.md"],
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: cabecalhosDeSeguranca(),
      },
      {
        source: "/auth.md",
        headers: [
          { key: "Content-Type", value: "text/markdown; charset=utf-8" },
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
