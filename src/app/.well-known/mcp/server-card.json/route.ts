import { NextResponse } from "next/server";

/**
 * Sem servidor MCP real hoje. A única ferramenta client-side que resta no
 * `WebMCPProvider` (só na landing) é `get_iris_overview`, uma descrição
 * institucional estática — a antiga `search_clinical_evidence` (evidência
 * fabricada) foi removida em S-08/#530. Não republicar nada aqui como se
 * fosse endpoint de servidor com dado de paciente por trás.
 */
export function GET() {
  const serverCard = {
    $schema: "https://modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
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
