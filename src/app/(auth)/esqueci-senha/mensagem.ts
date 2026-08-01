/**
 * Mensagem uniforme da recuperação de senha (#163, Task 9).
 *
 * NÃO é `"use server"` de propósito (resolução de controlador da Task 9):
 * o Next.js 16 exige que todo export de um módulo `"use server"` seja uma
 * função async, e a issue #55 (ver o comentário no topo de
 * `../cadastro/actions.ts`) trata todo export desses módulos como endpoint
 * invocável pelo cliente. `mensagemUniforme` é síncrona e é a MESMA string
 * para qualquer desfecho — vive num módulo comum, sem diretiva, para que o
 * teste (`actions.test.ts`) possa importá-la direto e para que `logic.ts`
 * (server-only) e `actions.ts` (`"use server"`, espelhando o padrão de
 * `../cadastro/actions.ts`/`../cadastro/logic.ts`) consumam a mesma fonte.
 *
 * A INVARIANTE (ver AGENTS.md / task-9-brief.md): esta string é devolvida
 * para e-mail existente, e-mail inexistente, falha do provedor de e-mail,
 * falha de banco e throttle acionado — sempre a mesma, sempre no mesmo
 * formato, para que ninguém aprenda pela resposta se um e-mail tem conta
 * aqui.
 */
export function mensagemUniforme(): string {
  return "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.";
}
