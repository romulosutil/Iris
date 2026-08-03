import { NextResponse } from "next/server";

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://iris.app";

  const protectedResourceMetadata = {
    resource: `${baseUrl}/api/v1`,
    authorization_servers: [baseUrl],
    scopes_supported: [
      "read:patients",
      "write:evaluations",
      "read:reports",
      "agent:interact",
    ],
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
