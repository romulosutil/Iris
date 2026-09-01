import { NextResponse } from "next/server";

/**
 * Sem servidor MCP real hoje. `search_clinical_evidence` existe só como
 * ferramenta client-side estática do WebMCPProvider (dado mockado, sem
 * acesso a dossiê real) — não republicar aqui como se fosse endpoint de
 * servidor com dado de paciente por trás.
 */
export function GET() {
  const serverCard = {
    $schema:
      "https://modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    serverInfo: {
      name: "Iris",
      version: "0.0.0",
      description: "Nenhum servidor MCP publicado no momento.",
    },
    transports: [],
    capabilities: {},
    tools: [],
  };

  return NextResponse.json(serverCard, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
