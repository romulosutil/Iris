import { NextResponse } from "next/server";

export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  const catalog = {
    linkset: [
      {
        anchor: baseUrl,
        "service-doc": [
          {
            href: `${baseUrl}/auth.md`,
            type: "text/markdown",
          },
        ],
        "authorizing-agent": [
          {
            href: `${baseUrl}/.well-known/oauth-authorization-server`,
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
