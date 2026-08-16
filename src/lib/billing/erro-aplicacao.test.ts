import { describe, expect, it } from "vitest";
import { classificarFalhaDeConciliacao } from "./erro-aplicacao";

/**
 * Classificação do motivo de `erro_aplicacao` (#289).
 *
 * ## Por que os textos vão LITERAIS aqui
 *
 * Importar a constante que o código usa e comparar com ela mesma é um teste que
 * sobrevive à troca do texto — ele passaria contra qualquer valor, inclusive
 * contra o texto único e ambíguo que a #289 existe para acabar. O literal é o
 * que trava o contrato: mudar o texto do alarme obriga a mudar a consulta da
 * DoD, e esta linha é o lembrete disso.
 *
 * A régua destes casos é a regra que gera a tabela: **o texto de alarme só
 * aparece quando a falta do ciclo pode significar dinheiro recebido e não
 * conciliado.**
 */
describe("classificarFalhaDeConciliacao", () => {
  it("referência de CICLO sem ciclo correspondente é ALARME", () => {
    expect(
      classificarFalhaDeConciliacao(
        "cycle:11111111-1111-1111-1111-111111111111",
      ),
    ).toBe("cobrança de ciclo sem ciclo correspondente");
  });

  it("referência de DÉBITO consolidado também é ALARME (cobrança nossa)", () => {
    expect(
      classificarFalhaDeConciliacao(
        "debito:22222222-2222-2222-2222-222222222222",
      ),
    ).toBe("cobrança de ciclo sem ciclo correspondente");
  });

  it.each([null, undefined, "", "   "])(
    "referência ausente (%p) é o desfecho ESPERADO da ativação — nunca alarme",
    (referencia) => {
      expect(classificarFalhaDeConciliacao(referencia)).toBe(
        "cobrança fora do ciclo (ativação ou avulsa)",
      );
    },
  );

  it("referência com prefixo de terceiro não é alarme, e diz que é de terceiro", () => {
    // Cobrança criada por outra aplicação apontada para o mesmo endpoint, ou à
    // mão no painel. Não ter ciclo é o correto — mas chamar isso de "ativação
    // ou avulsa" seria afirmação falsa gravada na trilha.
    expect(classificarFalhaDeConciliacao("pedido-4711")).toBe(
      "cobrança fora do ciclo (referência externa de terceiro)",
    );
  });

  it("`clinic:` é referência de CLIENTE, não de cobrança: não é alarme", () => {
    // `clinic:<id>` é o `externalReference` do customer do Asaas. Se aparecesse
    // num `payment`, seria cobrança de outra origem — não uma cobrança nossa de
    // ciclo, e portanto não é dinheiro perdido.
    expect(
      classificarFalhaDeConciliacao(
        "clinic:33333333-3333-3333-3333-333333333333",
      ),
    ).toBe("cobrança fora do ciclo (referência externa de terceiro)");
  });

  it("prefixo nosso só casa no COMEÇO da referência", () => {
    // `startsWith`, não `includes`: uma referência de terceiro que contenha
    // "cycle:" no meio não pode virar alarme — seria o mesmo ruído que a issue
    // remove, com sinal invertido.
    expect(classificarFalhaDeConciliacao("erp-cycle:99")).toBe(
      "cobrança fora do ciclo (referência externa de terceiro)",
    );
  });
});
