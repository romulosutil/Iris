import { NextResponse, type NextRequest } from "next/server";
import {
  NOME_COOKIE_TOKEN,
  opcoesCookieToken,
} from "@/app/(auth)/redefinir-senha/cookie";

/**
 * Proxy de navegação e middleware central do Next.js 16 (`src/proxy.ts`).
 *
 * Responsabilidades:
 * 1. Restringir respostas de interceptação a métodos de leitura (GET e HEAD).
 *    Requisições de mutação (POST, PUT, DELETE - Server Actions) passam direto sem interceptação.
 * 2. Interceptação segura de `/redefinir-senha?token=...` movendo token para cookie httpOnly.
 * 3. Injeção de cabeçalhos RFC 8288 Link para descoberta de agentes de IA usando `.append("Link", ...)`
 *    para não sobrescrever tags nativas de prefetching/preloading do Next.js.
 */
export function proxy(request: NextRequest) {
  // Apenas métodos de leitura (GET e HEAD) sofrem interceptações customizadas
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Interceptação de /redefinir-senha?token=...
  const token = request.nextUrl.searchParams.get("token");
  if (token && pathname === "/redefinir-senha") {
    const urlLimpa = request.nextUrl.clone();
    urlLimpa.searchParams.delete("token");

    const resposta = NextResponse.redirect(urlLimpa);
    resposta.cookies.set(NOME_COOKIE_TOKEN, token, opcoesCookieToken());
    return resposta;
  }

  const response = NextResponse.next();

  // Injeção de cabeçalhos Link para descoberta por agentes de IA (preservando preload headers nativos)
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
