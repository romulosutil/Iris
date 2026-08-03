"use server";
import { type EstadoEsqueciSenha, executarEsqueciSenha } from "./logic";

export type { EstadoEsqueciSenha } from "./logic";

/**
 * ÚNICO ponto de entrada invocável pelo cliente da recuperação de senha
 * (mesmo desenho de `../cadastro/actions.ts`, issue #55): só aceita
 * `FormData`, nada de `ctx`/opções, e o núcleo (`./logic`) é `server-only`
 * SEM `"use server"` — não é endpoint.
 *
 * NUNCA redireciona e NUNCA lança: todo desfecho (e-mail existente,
 * inexistente, throttle, falha de e-mail/banco) volta como
 * `{ mensagem: mensagemUniforme() }` — a mesma tela permanece montada e
 * mostra a mesma mensagem, ver `./logic.ts`.
 */
export async function esqueciSenha(
  _prev: EstadoEsqueciSenha,
  formData: FormData,
): Promise<EstadoEsqueciSenha> {
  return executarEsqueciSenha(formData);
}
