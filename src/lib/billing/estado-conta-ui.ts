import type { EstadoConta } from "./estado-conta";

/**
 * Predicados de estado de conta que a UI precisa — e que por isso NÃO podem
 * morar em `estado-conta.ts`.
 *
 * Aquele módulo abre com `import "server-only"` (ele fala com o banco), então
 * importá-lo de um client component derruba o `pnpm build` com
 * "You're importing a component that needs server-only". O `pnpm test` não
 * pega: no jsdom o `server-only` resolve normalmente. Só o build mede isto.
 *
 * Aqui não há I/O nem segredo: é decisão pura sobre um enum, segura no browser.
 */

/**
 * Se oferecer "ativar a assinatura" é a saída deste estado.
 *
 * Mora num lugar só, e não em cada tela, porque a regra tem uma exceção cara:
 * em `pagamento_em_processamento` já existe cobrança em voo, e devolver a
 * pessoa ao checkout gera uma SEGUNDA cobrança para o mesmo mês. Duas cópias
 * do predicado (formulário e página) divergiriam na primeira vez que um estado
 * novo entrasse no enum.
 */
export function ativarEhASaida(estado: EstadoConta): boolean {
  // `trial_bloqueado_fraude` NÃO entra, ainda que a copy dele mande ativar:
  // incluí-lo mudaria o comportamento do formulário, que é o oráculo desta
  // extração. Fica registrado como divergência a decidir, não corrigida de
  // carona numa tarefa de outro escopo.
  return estado === "trial_expirado" || estado === "cancelada";
}
