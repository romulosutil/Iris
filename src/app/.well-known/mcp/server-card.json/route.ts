import { NextResponse } from "next/server";

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://iris.app";

  const serverCard = {
    $schema: "https://modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    serverInfo: {
      name: "Iris Clinical AI Server",
      version: "1.0.0",
      description:
        "Iris Model Context Protocol server exposing clinical dossier compilation, evidence lookup, and triage capabilities.",
    },
    transports: [
      {
        type: "sse",
        endpoint: `${baseUrl}/api/mcp/sse`,
      },
      {
        type: "streamable-http",
        endpoint: `${baseUrl}/api/mcp/messages`,
      },
    ],
    capabilities: {
      tools: {
        listChanged: false,
      },
      prompts: {
        listChanged: false,
      },
      resources: {
        subscribe: false,
        listChanged: false,
      },
    },
    tools: [
      {
        name: "search_clinical_evidence",
        description:
          "Search evidence base for behavioral markers, clinical criteria, and assessment parameters.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search term or clinical condition",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_patient_dossier_summary",
        description:
          "Retrieve an aggregated summary of patient clinical dossier (requires authorization token).",
        inputSchema: {
          type: "object",
          properties: {
            patientId: {
              type: "string",
              description: "Unique patient identifier",
            },
          },
          required: ["patientId"],
        },
      },
    ],
  };

  return NextResponse.json(serverCard, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
