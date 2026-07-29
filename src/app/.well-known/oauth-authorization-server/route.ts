import { NextResponse } from "next/server";

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://iris.app";

  const oauthConfig = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/auth/authorize`,
    token_endpoint: `${baseUrl}/api/auth/token`,
    registration_endpoint: `${baseUrl}/api/auth/register`,
    jwks_uri: `${baseUrl}/api/auth/jwks`,
    scopes_supported: [
      "read:patients",
      "write:evaluations",
      "read:reports",
      "agent:interact",
    ],
    response_types_supported: ["code", "token"],
    grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    service_documentation: `${baseUrl}/auth.md`,
    
    // Auth.md draft extension for AI Agent Registration
    agent_auth: {
      documentation_uri: `${baseUrl}/auth.md`,
      register_uri: `${baseUrl}/api/auth/register/agent`,
      supported_identity_types: ["ai_agent", "autonomous_system", "service_account"],
      supported_credential_types: ["bearer_token", "mTLS", "jwt_assertion"],
      scopes_supported: ["read:patients", "write:evaluations", "read:reports", "agent:interact"],
    },
  };

  return NextResponse.json(oauthConfig, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
