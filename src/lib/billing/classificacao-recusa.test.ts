import { describe, expect, it } from "vitest";
import { classificarRecusa, type GrupoRecusa } from "./classificacao-recusa";

/**
 * #322 · D-2 — `retentavelAutomaticamente` é campo PRÓPRIO, e a varredura só
 * comanda G2.
 *
 * ## Por que este arquivo é unitário e não entra no `.int.test.ts`
 *
 * `classificacao-recusa.int.test.ts` mede DESFECHO no banco (o que a
 * conciliação escreveu em `billing_cycle`/`subscription`), e por isso roda
 * inteiro sob `describe.skipIf(!hasDb)`. O que se mede aqui é a TABELA de
 * política — função pura, sem banco. Pendurá-la lá a faria pular em silêncio em
 * toda máquina sem Postgres, que é o modo de falha catalogado
 * [vitest-int-test-coleta-zero].
 *
 * ## O oráculo é o literal, nunca a constante do código
 *
 * Os 9 códigos abaixo são escritos à mão, um por grupo, e o valor esperado é
 * `true`/`false` literal. Importar `POLITICAS` (ou derivar o esperado de
 * `valeGastarRetentativa`) reproduziria o defeito catalogado
 * [teste-verde-que-nao-testa-nada]: passaria contra qualquer tabela, inclusive
 * contra a que reusa o campo errado como gatilho.
 */

/** Um código representativo por grupo, literal. `G0` é um código inexistente. */
const CODIGO_POR_GRUPO: ReadonlyArray<readonly [GrupoRecusa, string]> = [
  ["G0", "CODIGO_QUE_O_ASAAS_AINDA_NAO_INVENTOU"],
  ["G1", "MAXIMUM_AMOUNT_EXCEEDED"],
  ["G2", "PAYMENT_OVERDUE"],
  ["G3", "INVALID_RECURRING_PAYMENT_ID"],
  ["G4", "PAYER_CPF_CNPJ_MISMATCH"],
  ["G5", "ACCOUNT_CLOSED"],
  ["G6", "EXCEEDED_MAXIMUM_RETRY_ATTEMPTS"],
  ["G7", "EXTERNAL_INSTITUTION_ERROR"],
  ["G8", "PAYMENT_ALREADY_DONE"],
];

describe("#322 · retentavelAutomaticamente", () => {
  it("percorre os 9 grupos e só G2 é retentável automaticamente", () => {
    // Uma asserção por grupo, e não um `filter(...).toEqual(["G2"])`: assim a
    // falha nomeia QUAL grupo virou `true` por engano.
    const observado = CODIGO_POR_GRUPO.map(([grupo, codigo]) => {
      const politica = classificarRecusa(codigo);
      // Guarda de sanidade: se o catálogo mudar de grupo, o caso abaixo estaria
      // medindo outra coisa sem avisar.
      expect(politica.grupo).toBe(grupo);
      return [grupo, politica.retentavelAutomaticamente] as const;
    });

    expect(observado).toEqual([
      ["G0", false],
      ["G1", false],
      ["G2", true],
      ["G3", false],
      ["G4", false],
      ["G5", false],
      ["G6", false],
      ["G7", false],
      ["G8", false],
    ]);
  });

  /**
   * O caso que mata a mutação central da D-2: trocar o corpo da varredura por
   * `valeGastarRetentativa`.
   *
   * Estes cinco grupos dizem `true` em "vale a pena algum dia" e `false` em "a
   * varredura pode agora" — porque o "algum dia" deles vem com uma condição que
   * só a clínica (G1, G4), ou só nós (G6), podemos cumprir; e G7/G0 ficaram de
   * fora do automático por decisão nomeada. Um gatilho que lesse o campo antigo
   * comandaria retentativa nos cinco e queimaria o orçamento de 3 tentativas do
   * `3R_7D` que o caso de saldo (G2) precisa.
   */
  it.each([
    ["G1", "MAXIMUM_AMOUNT_EXCEEDED"],
    ["G4", "PAYER_CPF_CNPJ_MISMATCH"],
    ["G6", "EXCEEDED_MAXIMUM_RETRY_ATTEMPTS"],
    ["G7", "EXTERNAL_INSTITUTION_ERROR"],
    ["G0", "CODIGO_QUE_O_ASAAS_AINDA_NAO_INVENTOU"],
  ])(
    "%s diverge: vale a pena algum dia, mas a varredura não comanda",
    (grupo, codigo) => {
      const politica = classificarRecusa(codigo);
      expect(politica.grupo).toBe(grupo);
      expect(politica.valeGastarRetentativa).toBe(true);
      expect(politica.retentavelAutomaticamente).toBe(false);
    },
  );

  it("em G2 os dois campos coincidem — e é o único grupo em que isso vale", () => {
    // Sem este caso, "os dois campos divergem sempre" também passaria: a
    // divergência é a regra em 5 grupos, a coincidência é a exceção em 1.
    const politica = classificarRecusa("PAYMENT_OVERDUE");
    expect(politica.grupo).toBe("G2");
    expect(politica.valeGastarRetentativa).toBe(true);
    expect(politica.retentavelAutomaticamente).toBe(true);
  });

  it("código desconhecido e null caem em G0, sem comando automático", () => {
    // O catálogo é aberto: motivo novo do gateway nunca pode virar comando
    // automático por default.
    expect(classificarRecusa(null).retentavelAutomaticamente).toBe(false);
    expect(
      classificarRecusa("MOTIVO_QUE_AINDA_NAO_EXISTE")
        .retentavelAutomaticamente,
    ).toBe(false);
  });
});
