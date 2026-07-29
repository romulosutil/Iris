import { NextResponse } from "next/server";

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://iris.app";

  const catalog = {
    linkset: [
      {
        anchor: `${baseUrl}/api/v1`,
        "service-desc": [
          {
            href: `${baseUrl}/api/v1/openapi.json`,
            type: "application/openapi+json",
          },
        ],
        "service-doc": [
          {
            href: `${baseUrl}/auth.md`,
            type: "text/markdown",
          },
        ],
        status: [
          {
            href: `${baseUrl}/api/health`,
            type: "application/json",
          },
        ],
        "authorizing-agent": [
          {
            href: `${baseUrl}/.well-known/oauth-authorization-server`,
            type: "application/json",
          },
        ],
        "mcp-server-card": [
          {
            href: `${baseUrl}/.well-known/mcp/server-card.json`,
            type: "application/json",
          },
        ],
      },
    ],
  };

  return new NextResponse(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
