import { NextResponse } from "next/server";

export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://irisclinica.ia.br";

  const protectedResourceMetadata = {
    resource: `${baseUrl}/api/v1`,
    authorization_servers: [baseUrl],
    // Nenhum escopo de dado clínico até existir consentimento de agente e
    // o débito D57 (parecer jurídico sobre acesso de terceiro a dado de
    // paciente) estar fechado. Hoje só há login humano via Better-Auth.
    scopes_supported: ["public:institutional-content"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/auth.md`,
  };

  return NextResponse.json(protectedResourceMetadata, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
