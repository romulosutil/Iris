/**
 * Trava do `subscription.provider` sem default (débito D29, issue #36).
 *
 * A coluna nasceu `NOT NULL DEFAULT 'mercado_pago'`. O default parecia
 * inofensivo — "toda assinatura tem um provedor" — mas fazia TODA linha nova
 * nascer apontando para um gateway que a clínica nunca escolheu, inclusive as
 * `free_tier`, que não têm vínculo de cobrança nenhum. Medido em produção
 * (10/08/2026): as duas únicas linhas da tabela diziam `mercado_pago` sem que
 * ninguém jamais tivesse ativado nada.
 *
 * Por que um guard de texto e não um teste de banco: o estrago do default é
 * silencioso e só aparece meses depois, numa cobrança emitida pelo gateway
 * errado. Um `.default(...)` reintroduzido passaria por typecheck, por lint e
 * pela suíte inteira — e o CHECK do banco (`status = 'free_tier' OR provider
 * IS NOT NULL`) NÃO pegaria, porque um default satisfaz o CHECK. O único
 * momento em que dá para barrar é na declaração.
 *
 * Cheque de mutação (feito à mão ao escrever o teste): reintroduzir
 * `.default("mercado_pago")` na declaração derruba este arquivo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const schemaFonte = readFileSync(
  path.join(process.cwd(), "src/db/schema.ts"),
  "utf8",
);

describe("#36 · subscription.provider não pode reganhar default", () => {
  it('a declaração é `text("provider")` e nada mais', () => {
    // Captura tudo que estiver encadeado depois de `text("provider")` até a
    // vírgula que fecha a declaração da coluna.
    const match = schemaFonte.match(/provider:\s*text\("provider"\)([^,\n]*),/);

    expect(
      match,
      'não achei a declaração de `provider: text("provider")` em src/db/schema.ts — ' +
        "se a coluna foi renomeada, atualize este guard em vez de removê-lo",
    ).not.toBeNull();

    expect(
      match![1],
      "`subscription.provider` ganhou encadeamento na declaração. " +
        "`.default(...)` é o que o D29 removeu: ele faz linha nova nascer " +
        "vinculada a um gateway que a clínica não escolheu, e o CHECK do banco " +
        "não pega isso porque um default satisfaz o CHECK. `.notNull()` também " +
        "não pode voltar: 'sem vínculo de cobrança' precisa ser representável.",
    ).toBe("");
  });

  it("nenhum default de provedor sobrou no schema", () => {
    expect(
      /default\(\s*"mercado_pago"\s*\)/.test(schemaFonte),
      'sobrou um `.default("mercado_pago")` em src/db/schema.ts',
    ).toBe(false);
  });
});
