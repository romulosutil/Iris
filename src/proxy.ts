import { NextResponse, type NextRequest } from "next/server";
import {
  NOME_COOKIE_TOKEN,
  opcoesCookieToken,
} from "@/app/(auth)/redefinir-senha/cookie";

/**
 * Fix round 1, Task 9 (finding C1 do review). Único trabalho deste proxy
 * (nome atual do Next.js 16 para o que antes se chamava "middleware" — ver
 * https://nextjs.org/docs/messages/middleware-to-proxy; arquivo precisa se
 * chamar `proxy.ts` e exportar uma função `proxy`, não `middleware`, senão o
 * build falha com "Proxy is missing expected function export name"):
 * interceptar `GET /redefinir-senha?token=...` ANTES de qualquer render de
 * página (e portanto antes de Google Analytics/Clarity em
 * `src/app/layout.tsx`, que montam em toda rota sem opt-out), mover o token
 * para um cookie httpOnly, e redirecionar para a URL limpa — o token nunca
 * chega a existir num `document.location`/`Referer` observável por
 * terceiro.
 *
 * NÃO server component: um Server Component não pode gravar cookie (só
 * Server Actions e Route Handlers podem — restrição do próprio Next.js).
 * Este proxy é o único lugar que roda cedo o bastante E pode setar cookie +
 * redirecionar no mesmo request.
 *
 * Sem `token` na query (recarregamento da página já limpa, ou navegação
 * direta): passa adiante sem tocar em nada — a página decide sozinha, pela
 * PRESENÇA do cookie (não da query), se mostra formulário ou aviso.
 */
export function proxy(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.next();

  const urlLimpa = request.nextUrl.clone();
  urlLimpa.searchParams.delete("token");

  const resposta = NextResponse.redirect(urlLimpa);
  resposta.cookies.set(NOME_COOKIE_TOKEN, token, opcoesCookieToken());
  return resposta;
}

export const config = {
  matcher: "/redefinir-senha",
};
