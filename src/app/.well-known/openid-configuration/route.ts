import { NextResponse } from "next/server";

/**
 * Sem OIDC real hoje (login é Better-Auth, não terceiro autenticando via
 * agente). Manifest mínimo só para não devolver 404 a quem faz discovery.
 */
export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  const oidcConfig = {
    issuer: baseUrl,
    scopes_supported: ["public:institutional-content"],
  };

  return NextResponse.json(oidcConfig, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
