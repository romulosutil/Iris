import "server-only";
import type { TenantContext } from "@/db/rls";
import { traduzirErroDeConsentimento } from "@/lib/consent/erros";
import { diagnosticarBloqueioDeConsentimentoSeguro } from "@/lib/consent/diagnostico";

/**
 * Peças comuns aos três módulos do diário de sessão (#559, F4).
 *
 * Este arquivo, `diario-captura.ts`, `diario-asr.ts` e `diario-consolidacao.ts`
 * são o que era `src/app/(app)/diario/[sessionId]/logic.ts` — 1.201 linhas
 * dentro da pasta de uma rota, com oito ações, o ditado de voz, a extração e o
 * risco no mesmo arquivo. A regra clínica passou a morar em `src/lib`, onde é
 * testável sem montar a rota; a rota ficou com `actions.ts`, que só resolve o
 * `ctx` do request e revalida caminhos.
 */

// ─── Guard de escrita por situação da conta (#163+#159) ────────────────────
// Todo o diário é escrita clínica: conta em somente-leitura (trial expirado,
// cancelada, pagamento em processamento) não grava nota, escopo, áudio nem
// consolida. O wrap fica na exportação deste core, e não no `actions.ts`,
// porque os testes de integração chamam o core direto com `ctx` — envolver na
// action deixaria a suíte inteira cega para o guard.
//
// Nada aqui é isento por segurança clínica: a isenção de `alertas-risco` e
// `clinica/emergencia` vale para a via de alerta, não para o registro de rotina.

/**
 * Traduz a recusa do banco em mensagem de consentimento, quando (e só quando)
 * o consentimento realmente a explica. Primeiro o tradutor puro (constraints e
 * RAISE EXCEPTION, que são inequívocos); depois, para a negação genérica de
 * RLS, o diagnóstico que PERGUNTA ao banco. `null` = ninguém explicou → o
 * chamador mantém o comportamento que tinha antes deste gate existir.
 */
export async function mensagemDeConsentimento(
  ctx: TenantContext,
  err: unknown,
  alvo: { sessionId?: string },
): Promise<string | null> {
  return (
    traduzirErroDeConsentimento(err) ??
    (await diagnosticarBloqueioDeConsentimentoSeguro(ctx, alvo))
  );
}
