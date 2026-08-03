import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const acceptHeader = request.headers.get("accept") || "";

  // Skip static assets, internal Next.js requests, and API routes from markdown conversion
  const isApiOrStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/.well-known") ||
    pathname.includes(".");

  // Markdown Negotiation for Agents
  if (!isApiOrStatic && acceptHeader.includes("text/markdown")) {
    let markdownContent = "";

    if (pathname === "/") {
      markdownContent = `# Iris — Dossiê Clínico & Evidências Rastreadas

> Chegue na avaliação com o dossiê pronto. Evidências clínicas rastreáveis, decisão humana.

## Visão Geral
Iris é uma plataforma de inteligência clínica projetada para triagem, compilação de dossiês e acompanhamento evolutivo em saúde mental e neurodesenvolvimento.

## Recursos Principais
- **Dossiê Automatizado**: Compilação de relatórios estruturados para psicólogos e médicos.
- **Evidências Rastreadas**: Transparência e auditoria de observações comportamentais e clínicas.
- **Rigor e Segurança (LGPD)**: Isolamento multi-tenant com segurança de dados sensíveis.

## Endpoints de Agente e Descoberta
- **Catálogo de APIs**: [/.well-known/api-catalog](/.well-known/api-catalog)
- **Documentação de Autenticação**: [/auth.md](/auth.md)
- **MCP Server Card**: [/.well-known/mcp/server-card.json](/.well-known/mcp/server-card.json)
- **Agent Skills Index**: [/.well-known/agent-skills/index.json](/.well-known/agent-skills/index.json)
- **Políticas de Crawl**: [/robots.txt](/robots.txt)
`;
    } else if (pathname === "/sobre") {
      markdownContent = `# Sobre o Iris

## Missão
Proporcionar clareza, previsibilidade e rigor analítico para equipes multidisciplinares no acompanhamento de pacientes.

## Arquitetura & Governança
- **Tomada de Decisão**: Agentes IA auxiliam na compilação, mas a decisão final é estritamente humana.
- **Privacidade & Conformidade**: Conformidade com a LGPD e diretrizes éticas de saúde.
`;
    } else {
      markdownContent = `# Iris — ${pathname}

Conteúdo da página ${pathname} em formato otimizado para agentes de IA. Consulte [/.well-known/api-catalog](/.well-known/api-catalog) para APIs estruturadas.
`;
    }

    const estimatedTokens = Math.ceil(markdownContent.length / 4);

    return new NextResponse(markdownContent, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "x-markdown-tokens": String(estimatedTokens),
        "Vary": "Accept",
      },
    });
  }

  // Normal request flow — append Link response headers for agent discovery
  const response = NextResponse.next();

  if (!isApiOrStatic) {
    const linkHeaders = [
      '</.well-known/api-catalog>; rel="api-catalog"',
      '</docs/api>; rel="service-doc"',
      '</auth.md>; rel="authorizing-agent"',
      '</.well-known/mcp/server-card.json>; rel="mcp-server-card"',
      '</.well-known/agent-skills/index.json>; rel="agent-skills"',
    ].join(", ");

    response.headers.set("Link", linkHeaders);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files (_next/static, _next/image, favicon.ico, images)
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
