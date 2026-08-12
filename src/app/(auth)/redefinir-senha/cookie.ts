import "server-only";

/**
 * Fix round 1 (finding C1 do review): o token de redefinição de senha NUNCA
 * pode ficar numa URL depois do 1º carregamento — `src/app/layout.tsx` monta
 * Google Analytics + Microsoft Clarity em TODA rota (sem opt-out por grupo de
 * rota), e qualquer um deles (ou o header `Referer` de um recurso externo
 * qualquer carregado pela página) vazaria `?token=...` para terceiros.
 *
 * Solução: `src/middleware.ts` intercepta `GET /redefinir-senha?token=...`
 * ANTES de qualquer render (analytics incluso), move o token para um cookie
 * httpOnly e redireciona para a URL limpa. Este módulo só centraliza o nome
 * do cookie e as opções — para o middleware (que grava) e para `logic.ts`
 * (que lê e depois apaga) nunca divergirem.
 *
 * `path` restringe o cookie a esta rota (não vaza para `/login`, `/cadastro`
 * etc). `sameSite: "lax"` é suficiente (não é um cookie de sessão
 * autenticada, e precisa sobreviver à navegação de topo vinda do e-mail).
 * `secure` só em produção porque o dev local roda em HTTP.
 * `maxAge` (15 min) é deliberadamente MENOR que o TTL do token no Better-Auth
 * (1h — `resetPasswordTokenExpiresIn` default, `password.mjs:64`): o cookie
 * só precisa sobreviver ao tempo de preencher o formulário logo após o
 * clique, não ao tempo todo em que o link em si continua técnicamente válido
 * caso o e-mail fique muito tempo sem ser aberto.
 */
export const NOME_COOKIE_TOKEN = "redefinir_senha_token";

export const CAMINHO_COOKIE = "/redefinir-senha";
const MAX_AGE_COOKIE_S = 15 * 60;

export function opcoesCookieToken() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: CAMINHO_COOKIE,
    maxAge: MAX_AGE_COOKIE_S,
  };
}
