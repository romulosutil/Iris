"use server";
import { redirect } from "next/navigation";
import { type EstadoCadastro, executarCadastro } from "./logic";

export type { EstadoCadastro } from "./logic";

/**
 * ÚNICO ponto de entrada invocável pelo cliente do cadastro self-service.
 *
 * Issue #55: toda função async exportada de um módulo `"use server"` vira um
 * endpoint com argumentos controlados pelo cliente. Por isso esta função só
 * aceita `FormData` — nada de `ctx`, nada de opções — e o núcleo (`./logic`) é
 * `server-only` SEM `"use server"`, portanto não é endpoint. `versaoTermo`,
 * `ip` e `userAgent` são resolvidos lá dentro, no servidor; nenhum deles pode
 * ser injetado por aqui.
 *
 * O `redirect` acontece para TODOS os desfechos não-erro — e-mail novo,
 * retomada e e-mail existente com senha errada — porque os três produzem o
 * mesmo `{}`. Ver o bloco RESPOSTA UNIFORME em `./logic.ts`.
 */
export async function cadastrar(
  _prev: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const resultado = await executarCadastro(formData);
  if (resultado.error) return resultado;
  redirect("/cadastro/verifique-email");
}
