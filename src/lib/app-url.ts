/**
 * Retorna a URL base pública da aplicação (ex: "https://irisclinica.ia.br").
 * Ordem de precedência:
 * 1. NEXT_PUBLIC_APP_URL (definida publicamente no Next.js / Vercel / Easypanel)
 * 2. BETTER_AUTH_URL (URL configurada no motor de autenticação)
 * 3. Fallback dev: "http://localhost:3000"
 *
 * Sanitiza barras no final (trailing slash) para evitar links duplicados (ex: //login).
 */
export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
