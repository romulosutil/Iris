import { describe, expect, it } from "vitest";
import { cabecalhoMarcaHtml, marcaCssHtml, rodapeIrisHtml } from "./marca-html";
import { SELO_IRIS, type MarcaClinica } from "../branding/marca";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const marcaCompleta: MarcaClinica = {
  logo: PNG_1X1,
  logoMime: "image/png",
  corPrimaria: "#1f4e79",
  nomeClinica: "Clínica Vida Plena",
};

describe("cabecalhoMarcaHtml", () => {
  it("some por completo quando não há marca", () => {
    expect(cabecalhoMarcaHtml(null)).toBe("");
    expect(cabecalhoMarcaHtml(undefined)).toBe("");
    expect(
      cabecalhoMarcaHtml({
        logo: null,
        logoMime: null,
        corPrimaria: null,
        nomeClinica: "",
      }),
    ).toBe("");
  });

  it("embute o logotipo como data: URI, nunca como URL remota", () => {
    const html = cabecalhoMarcaHtml(marcaCompleta);
    expect(html).toContain(
      `src="data:image/png;base64,${PNG_1X1.toString("base64")}"`,
    );
    // O sandbox de render publica `img-src 'self' data:` — qualquer http(s)
    // seria bloqueado pelo Blink e o PDF sairia sem logotipo, em silêncio.
    expect(html).not.toMatch(/src="https?:/);
  });

  it("escapa o nome da clínica (é texto livre do cadastro)", () => {
    const html = cabecalhoMarcaHtml({
      ...marcaCompleta,
      logo: null,
      logoMime: null,
      nomeClinica: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("aplica a cor da clínica na régua do cabeçalho", () => {
    expect(marcaCssHtml(marcaCompleta)).toContain("3px solid #1f4e79");
  });

  it("cai no grafite neutro quando a clínica não escolheu cor", () => {
    expect(marcaCssHtml(null)).toContain("3px solid #1a1a1a");
  });
});

describe("rodapeIrisHtml — selo inviolável (guardrail 3 da #258)", () => {
  it("emite o selo de integridade do Iris", () => {
    expect(rodapeIrisHtml()).toContain(SELO_IRIS);
  });

  it("NÃO aceita marca por parâmetro — não há como uma clínica alterá-lo", () => {
    // A régua aqui é a ARIDADE da função: enquanto ela não receber a marca,
    // nenhuma configuração de tenant tem como alcançar este texto. Se alguém
    // acrescentar um parâmetro, este teste cai e a decisão volta à mesa.
    expect(rodapeIrisHtml.length).toBe(0);
  });
});
