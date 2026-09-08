import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_AA,
  FUNDO_PDF,
  logoComoDataUri,
  normalizarCorHex,
  razaoDeContraste,
  TAMANHO_MAX_LOGO_BYTES,
  validarCorMarca,
  validarLogoPng,
  type MarcaClinica,
} from "./marca";

/** PNG 1×1 transparente, mínimo válido (assinatura + IHDR + IDAT + IEND). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Monta um PNG sintético só com cabeçalho, para exercitar o IHDR. */
function pngComDimensoes(largura: number, altura: number): Buffer {
  const buf = Buffer.from(PNG_1X1);
  buf.writeUInt32BE(largura, 16);
  buf.writeUInt32BE(altura, 20);
  return buf;
}

describe("normalizarCorHex", () => {
  it("expande a forma curta e normaliza para minúsculas com #", () => {
    expect(normalizarCorHex("#ABC")).toBe("#aabbcc");
    expect(normalizarCorHex("1F4E79")).toBe("#1f4e79");
    expect(normalizarCorHex("  #1F4E79  ")).toBe("#1f4e79");
  });

  it("rejeita o que não é hexadecimal de 3 ou 6 dígitos", () => {
    expect(normalizarCorHex("#12345")).toBeNull();
    expect(normalizarCorHex("rgb(0,0,0)")).toBeNull();
    expect(normalizarCorHex("azul")).toBeNull();
  });
});

describe("razaoDeContraste (WCAG 2.1)", () => {
  it("dá 21:1 entre preto e branco e 1:1 entre iguais", () => {
    expect(razaoDeContraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(razaoDeContraste("#1f4e79", "#1f4e79")).toBeCloseTo(1, 5);
  });

  it("é simétrica na ordem dos argumentos", () => {
    expect(razaoDeContraste("#1f4e79", FUNDO_PDF)).toBeCloseTo(
      razaoDeContraste(FUNDO_PDF, "#1f4e79"),
      10,
    );
  });
});

describe("validarCorMarca", () => {
  it("aceita cor escura o bastante sobre o papel branco do PDF", () => {
    const r = validarCorMarca("#1F4E79");
    expect(r).toEqual({ ok: true, valor: "#1f4e79" });
  });

  it("aceita vazio como 'sem cor configurada'", () => {
    expect(validarCorMarca("")).toEqual({ ok: true, valor: null });
    expect(validarCorMarca(null)).toEqual({ ok: true, valor: null });
  });

  it("RECUSA cor que não alcança 4.5:1 sobre o branco — e diz o número", () => {
    // #f2b705 é o ouro da própria marca do Iris: sobre branco dá ~1.8:1. A
    // regra vale inclusive para a cor do produto, senão não é regra.
    const r = validarCorMarca("#f2b705");
    expect("erro" in r).toBe(true);
    expect(razaoDeContraste("#f2b705", FUNDO_PDF)).toBeLessThan(
      CONTRASTE_MINIMO_AA,
    );
    if ("erro" in r) {
      expect(r.erro).toMatch(/4\.5:1/);
      expect(r.erro).toMatch(/#f2b705/);
    }
  });

  it("recusa formato inválido antes de tentar medir contraste", () => {
    const r = validarCorMarca("não é cor");
    expect("erro" in r && r.erro).toMatch(/hexadecimal/i);
  });
});

describe("validarLogoPng (magic bytes, não extensão)", () => {
  it("aceita PNG válido e devolve as dimensões lidas do IHDR", () => {
    expect(validarLogoPng(PNG_1X1)).toEqual({
      ok: true,
      valor: { largura: 1, altura: 1 },
    });
    expect(validarLogoPng(pngComDimensoes(512, 128))).toEqual({
      ok: true,
      valor: { largura: 512, altura: 128 },
    });
  });

  it("RECUSA SVG mesmo que o conteúdo pareça uma imagem", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("//x")</script></svg>',
    );
    expect("erro" in validarLogoPng(svg)).toBe(true);
  });

  it("RECUSA arquivo que só troca a extensão (magic bytes de JPEG)", () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(40),
    ]);
    expect("erro" in validarLogoPng(jpeg)).toBe(true);
  });

  it("recusa acima de 2 MB", () => {
    const grande = Buffer.concat([
      PNG_1X1,
      Buffer.alloc(TAMANHO_MAX_LOGO_BYTES),
    ]);
    const r = validarLogoPng(grande);
    expect("erro" in r && r.erro).toMatch(/2 MB/);
  });

  it("recusa PNG com dimensão absurda (bomba de descompressão)", () => {
    const r = validarLogoPng(pngComDimensoes(20000, 20000));
    expect("erro" in r && r.erro).toMatch(/20000×20000/);
  });

  it("recusa arquivo vazio e cabeçalho truncado", () => {
    expect("erro" in validarLogoPng(Buffer.alloc(0))).toBe(true);
    expect("erro" in validarLogoPng(PNG_1X1.subarray(0, 20))).toBe(true);
  });
});

describe("logoComoDataUri", () => {
  const base: MarcaClinica = {
    logo: null,
    logoMime: null,
    corPrimaria: null,
    nomeClinica: "Clínica Vida Plena",
  };

  it("devolve null quando não há logotipo", () => {
    expect(logoComoDataUri(base)).toBeNull();
  });

  it("monta data: URI base64 — único esquema que passa pelo CSP do render", () => {
    const uri = logoComoDataUri({
      ...base,
      logo: PNG_1X1,
      logoMime: "image/png",
    });
    expect(uri).toBe(`data:image/png;base64,${PNG_1X1.toString("base64")}`);
  });
});
