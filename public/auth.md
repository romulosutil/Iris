# Iris Agent Authentication & Registration Guide (auth.md)

This document provides specification details for AI agents, autonomous systems, and API clients seeking to interact programmatically with the **Iris Platform**.

---

## 1. Authentication Architecture

Iris supports OAuth 2.0 and OpenID Connect (OIDC) authentication flows tailored for autonomous agents:

- **Client Credentials Flow**: Recommended for machine-to-machine (M2M) server agents.
- **Authorization Code with PKCE**: Recommended for user-delegated browser agents.
- **Bearer Token Authorization**: All API requests require a valid Bearer JWT token in the HTTP `Authorization` header:
  ```http
  Authorization: Bearer <your_access_token>
  ```

---

## 2. Discovery Endpoints

- **OAuth Authorization Server**: [/.well-known/oauth-authorization-server](/.well-known/oauth-authorization-server)
- **OpenID Configuration**: [/.well-known/openid-configuration](/.well-known/openid-configuration)
- **OAuth Protected Resource Metadata**: [/.well-known/oauth-protected-resource](/.well-known/oauth-protected-resource)
- **API Catalog**: [/.well-known/api-catalog](/.well-known/api-catalog)

---

## 3. Agent Registration

To register an AI agent or service account programmatically:

1. Send a `POST` request to `/api/auth/register/agent` with your agent profile:
   ```json
   {
     "agent_name": "MyClinicalAssistantBot",
     "identity_type": "ai_agent",
     "developer_contact": "agent-admin@example.com",
     "requested_scopes": ["read:patients", "write:evaluations"]
   }
   ```
2. Receive your `client_id` and `client_secret`.
3. Request access tokens from `/api/auth/token` using grant type `client_credentials`.

---

## 4. Supported Scopes

| Scope               | Description                                         | Access Level |
| :------------------ | :-------------------------------------------------- | :----------- |
| `read:patients`     | Read anonymized patient dossier summaries           | Restricted   |
| `write:evaluations` | Submit pre-evaluation observations & questionnaires | Write        |
| `read:reports`      | Fetch generated clinical reports                    | Restricted   |
| `agent:interact`    | Interact via WebMCP browser API or MCP Server       | Interactive  |

---

## 5. Security & LGPD Compliance

- Patient identifiable data (PII) is strictly restricted under LGPD guardrails.
- All agent operations are logged in audit trails.
- Revocation endpoint: `/api/auth/revoke`.
