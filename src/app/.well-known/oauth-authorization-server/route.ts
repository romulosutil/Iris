import { NextResponse } from "next/server";

/**
 * Só descreve login humano real (Better-Auth). Sem `authorization_endpoint`,
 * `registration_endpoint` nem escopo de dado clínico — não existe fluxo de
 * agente autônomo nem base legal (D57) para oferecer isso hoje.
 */
export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  const oauthConfig = {
    issuer: baseUrl,
    scopes_supported: ["public:institutional-content"],
    service_documentation: `${baseUrl}/auth.md`,
  };

  return NextResponse.json(oauthConfig, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
