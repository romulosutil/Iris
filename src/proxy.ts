import { NextResponse, type NextRequest } from "next/server";
import {
  NOME_COOKIE_TOKEN,
  opcoesCookieToken,
} from "@/app/(auth)/redefinir-senha/cookie";
import {
  CABECALHO_REQUEST_ID,
  normalizarRequestId,
} from "@/lib/observabilidade/logger";

/**
 * Proxy de navegação e middleware central do Next.js 16 (`src/proxy.ts`).
 *
 * Responsabilidades:
 * 1. Restringir respostas de interceptação a métodos de leitura (GET e HEAD).
 *    Requisições de mutação (POST, PUT, DELETE - Server Actions) passam direto sem interceptação.
 * 2. Interceptação segura de `/redefinir-senha?token=...` movendo token para cookie httpOnly.
 * 3. Injeção de cabeçalhos RFC 8288 Link para descoberta de agentes de IA usando `.append("Link", ...)`
 *    para não sobrescrever tags nativas de prefetching/preloading do Next.js.
 * 4. Id de correlação por request (#560, achado `DA-04`): decide o `requestId`
 *    de TODA request — inclusive as de mutação, que saem antes das demais
 *    interceptações — repassa no cabeçalho `x-request-id` para o servidor e
 *    ecoa na resposta, para o operador casar o que o usuário viu com a linha
 *    do log. O valor vindo de fora é adotado só depois de podado por
 *    `normalizarRequestId`: cabeçalho é entrada de terceiro.
 *
 * O proxy roda no runtime edge, então importa apenas o núcleo puro do logger
 * (`logger.ts`), nunca o transporte `pino` (`logger-node.ts`).
 */
export function proxy(request: NextRequest) {
  const requestId = normalizarRequestId(
    request.headers.get(CABECALHO_REQUEST_ID),
  );

  /** Repassa o id adiante e ecoa na resposta. Todo caminho de saída passa aqui. */
  const comRequestId = (resposta: NextResponse): NextResponse => {
    resposta.headers.set(CABECALHO_REQUEST_ID, requestId);
    return resposta;
  };

  /** `NextResponse.next` que injeta o id nos headers vistos pelo servidor. */
  const seguir = (): NextResponse => {
    const headers = new Headers(request.headers);
    headers.set(CABECALHO_REQUEST_ID, requestId);
    return NextResponse.next({ request: { headers } });
  };

  // Apenas métodos de leitura (GET e HEAD) sofrem interceptações customizadas
  if (request.method !== "GET" && request.method !== "HEAD") {
    return comRequestId(seguir());
  }

  const { pathname } = request.nextUrl;

  // Interceptação de /redefinir-senha?token=...
  const token = request.nextUrl.searchParams.get("token");
  if (token && pathname === "/redefinir-senha") {
    const urlLimpa = request.nextUrl.clone();
    urlLimpa.searchParams.delete("token");

    const resposta = NextResponse.redirect(urlLimpa);
    resposta.cookies.set(NOME_COOKIE_TOKEN, token, opcoesCookieToken());
    return comRequestId(resposta);
  }

  const response = comRequestId(seguir());

  // Injeção de cabeçalhos Link para descoberta por agentes de IA (preservando preload headers nativos)
  // `/.well-known` sempre tem "." no path (ex.: "/.well-known/..."), então o
  // `includes(".")` abaixo já cobriria essa checagem sozinho — mantida por
  // clareza de intenção, mas nenhum teste pode cobri-la isoladamente (W2).
  const isApiOrStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/.well-known") ||
    pathname.includes(".");

  if (!isApiOrStatic) {
    const linkHeaders = [
      '</.well-known/api-catalog>; rel="api-catalog"',
      '</docs/api>; rel="service-doc"',
      '</auth.md>; rel="authorizing-agent"',
      '</.well-known/mcp/server-card.json>; rel="mcp-server-card"',
      '</.well-known/agent-skills/index.json>; rel="agent-skills"',
    ].join(", ");

    response.headers.append("Link", linkHeaders);
  }

  return response;
}

export const config = {
  matcher: [
    "/redefinir-senha",
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
