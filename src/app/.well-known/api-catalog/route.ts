import { NextResponse } from "next/server";

/**
 * Catálogo de API (RFC 9727). Só `service-doc`: não existe servidor de
 * autorização OAuth/OIDC no Iris (login é humano, via Better-Auth), então o
 * link `authorizing-agent` para `/.well-known/oauth-authorization-server`
 * saiu junto com aquele manifesto (auditoria 360, DX-03) — apontar para um
 * documento que não é conforme confundia mais que um 404 honesto.
 */
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
