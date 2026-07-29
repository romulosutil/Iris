import { NextResponse } from "next/server";

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://iris.app";

  const oidcConfig = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/auth/authorize`,
    token_endpoint: `${baseUrl}/api/auth/token`,
    jwks_uri: `${baseUrl}/api/auth/jwks`,
    userinfo_endpoint: `${baseUrl}/api/auth/userinfo`,
    revocation_endpoint: `${baseUrl}/api/auth/revoke`,
    registration_endpoint: `${baseUrl}/api/auth/register`,
    scopes_supported: [
      "openid",
      "profile",
      "email",
      "read:patients",
      "write:evaluations",
      "read:reports",
    ],
    response_types_supported: ["code", "token", "id_token"],
    grant_types_supported: [
      "authorization_code",
      "client_credentials",
      "refresh_token",
    ],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
  };

  return NextResponse.json(oidcConfig, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
