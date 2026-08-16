import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_URL_FAKE, ProvedorFake } from "./provedor-fake";

/**
 * O dublê de gateway não pode ser mais PERMISSIVO que a produção.
 *
 * É a direção de erro que apaga defeito: um dublê frouxo devolve `pagavel`
 * onde o adapter real devolve `morta`, e o ramo que o chamador tem para o caso
 * real fica sem exercício nenhum — verde por construção. O caso medido aqui é
 * o valor ausente, que o `AsaasProvider` classifica como
 * `morta/valor_indeterminado` (cobrança viva e pagável, mas sem valor legível:
 * apresentar um copia-e-cola ao lado de "R$ 0,00" é a mesma mentira do QR
 * vazio).
 */
function responderCom(corpo: Record<string, unknown>) {
  vi.stubGlobal("fetch", async (entrada: unknown) => {
    const url = String(entrada);
    if (!url.startsWith(`${BASE_URL_FAKE}/cobrancas/`)) {
      throw new Error(`fetch inesperado para ${url}`);
    }
    return Response.json(corpo);
  });
}

describe("ProvedorFake · consultarCobrancaParaReuso", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cobrança pagável COM valor devolve o valor do wire", async () => {
    responderCom({ estado: "PENDENTE", centavos: 2000 });

    const estado = await new ProvedorFake().consultarCobrancaParaReuso(
      "cob_fake_1",
    );

    expect(estado).toEqual({
      reuso: "pagavel",
      valorCentavos: 2000,
      pagamento: {
        forma: "pix_copia_e_cola",
        brCode: "00020126-fake-debito-cob_fake_1",
      },
    });
  });

  it("cobrança pagável SEM valor legível é morta, não pagável de R$ 0,00", async () => {
    // O `?? 0` de antes transformava "o gateway não disse quanto" em "custa
    // zero" — e o chamador seguia para a tela com um QR sem preço.
    responderCom({ estado: "VENCIDA" });

    const estado = await new ProvedorFake().consultarCobrancaParaReuso(
      "cob_fake_2",
    );

    expect(estado).toEqual({ reuso: "morta", motivo: "valor_indeterminado" });
  });

  it("valor não numérico também é valor indeterminado", async () => {
    // O wire é JSON de um gateway: `"20,00"` é exatamente o tipo de resposta
    // que `Number()` transformava silenciosamente em `NaN` e depois em tela.
    responderCom({ estado: "PENDENTE", centavos: "20,00" });

    const estado = await new ProvedorFake().consultarCobrancaParaReuso(
      "cob_fake_3",
    );

    expect(estado).toEqual({ reuso: "morta", motivo: "valor_indeterminado" });
  });
});
