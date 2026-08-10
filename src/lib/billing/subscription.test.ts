import { describe, it, expect } from "vitest";
import { colunasDaAutorizacao, autorizacaoPersistida } from "./subscription";
import type { AutorizacaoPendente } from "./provider";

/**
 * Ida e volta da forma de autorização entre a porta e as colunas (D21 + D22).
 *
 * Estes casos existem porque a persistência é o único lugar onde a união
 * discriminada deixa de ser garantida pelo tipo: no banco ela vira três colunas
 * anuláveis, e qualquer combinação delas é representável. O que o tipo impede
 * em memória, aqui só o código impede — então é aqui que se mede.
 *
 * O caso que fecha o D22 é o do preço desconhecido: uma linha de Pix cujo
 * `valor_ativacao_centavos` é `NULL` (anterior ao backfill da `0089`, ou escrita
 * por um caminho que não passou por `colunasDaAutorizacao`). Reconstruir a
 * autorização ali obrigaria a tela a exibir um QR que debita sem dizer quanto —
 * exatamente o débito. Fail-closed é a resposta certa.
 */
describe("colunasDaAutorizacao × autorizacaoPersistida", () => {
  const brCode = "00020126330014BR.GOV.BCB.PIX0111copiaecola6304FFFF";

  it("faz round-trip do Pix preservando o valor cobrado", () => {
    const original: AutorizacaoPendente = {
      forma: "pix_copia_e_cola",
      brCode,
      valorAtivacaoCentavos: 1,
    };
    expect(autorizacaoPersistida(colunasDaAutorizacao(original))).toEqual(
      original,
    );
  });

  it("faz round-trip do redirect", () => {
    const original: AutorizacaoPendente = {
      forma: "redirect",
      url: "https://pagamento.exemplo/checkout/abc123",
    };
    expect(autorizacaoPersistida(colunasDaAutorizacao(original))).toEqual(
      original,
    );
  });

  it("grava valor `null` no redirect — e as três colunas sempre", () => {
    // `null`, não 0 e não ausente: ausente manteria o valor da tentativa
    // anterior no `onConflictDoUpdate` (a armadilha do D21, agora com preço
    // junto), e 0 afirmaria "cobrou zero" onde a verdade é "não cobrou".
    expect(
      colunasDaAutorizacao({
        forma: "redirect",
        url: "https://pagamento.exemplo/checkout/abc123",
      }),
    ).toEqual({
      checkoutUrl: "https://pagamento.exemplo/checkout/abc123",
      pixCopiaECola: null,
      valorAtivacaoCentavos: null,
    });
  });

  it("grava o valor real do Pix, limpando a URL", () => {
    expect(
      colunasDaAutorizacao({
        forma: "pix_copia_e_cola",
        brCode,
        valorAtivacaoCentavos: 1,
      }),
    ).toEqual({
      checkoutUrl: null,
      pixCopiaECola: brCode,
      valorAtivacaoCentavos: 1,
    });
  });

  it("recusa linha de Pix sem valor: `null`, não QR de preço desconhecido", () => {
    expect(
      autorizacaoPersistida({
        checkoutUrl: null,
        pixCopiaECola: brCode,
        valorAtivacaoCentavos: null,
      }),
    ).toBeNull();
  });

  it("aceita valor 0 numa linha de Pix (0 é preço, não ausência)", () => {
    // Guarda contra a correção preguiçosa do caso acima — um `if (!valor)`
    // descartaria uma ativação gratuita legítima junto com a desconhecida.
    expect(
      autorizacaoPersistida({
        checkoutUrl: null,
        pixCopiaECola: brCode,
        valorAtivacaoCentavos: 0,
      }),
    ).toEqual({ forma: "pix_copia_e_cola", brCode, valorAtivacaoCentavos: 0 });
  });

  it("devolve `null` quando a linha não guardou forma alguma", () => {
    expect(
      autorizacaoPersistida({
        checkoutUrl: null,
        pixCopiaECola: null,
        valorAtivacaoCentavos: null,
      }),
    ).toBeNull();
  });
});
