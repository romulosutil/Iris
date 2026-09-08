import { describe, it, expect } from "vitest";
import { buildFamiliaHtml } from "./build-html";
import { SELO_IRIS } from "../../branding/marca";
import type { FamilyReportDraft, PayloadFamilia } from "./types";

function draft(over: Partial<FamilyReportDraft> = {}): FamilyReportDraft {
  return {
    conquistaDestaque: "Théo avançou em pedir o que quer.",
    trabalhandoAgora: ["Pedir o que quer", "Esperar a vez"],
    comoApoiarEmCasa: ["Espere alguns segundos antes de oferecer."],
    periodoSemAvancoVisivel: false,
    notaHonestidade: null,
    anexoDados: { evidenciasPorMeta: [], avaliacoesFormaisPeriodo: [] },
    status: "rascunho_para_revisao",
    ...over,
  };
}

function payload(over: Partial<PayloadFamilia> = {}): PayloadFamilia {
  return {
    versao: 1,
    crianca: { nome: "Théo" },
    periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
    geradoEm: "2026-07-01T12:00:00.000Z",
    provider: "stub",
    iaOriginal: draft(),
    curado: null,
    ...over,
  };
}

// ── #258 (D9) — marca institucional white-label ─────────────────────────────
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const MARCA_CONFIGURADA = {
  logo: PNG_1X1,
  logoMime: "image/png",
  corPrimaria: "#1f4e79",
  nomeClinica: "Clínica Vida Plena",
};

describe("buildFamiliaHtml", () => {
  it("escapa injeção em todo texto livre", () => {
    const html = buildFamiliaHtml(
      payload({
        crianca: { nome: `Théo "<b>` },
        iaOriginal: draft({
          conquistaDestaque: "<script>alert(1)</script>",
        }),
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('Théo "<b>');
  });

  it("renderiza o draft curado quando presente (ignora iaOriginal)", () => {
    const html = buildFamiliaHtml(
      payload({
        iaOriginal: draft({ conquistaDestaque: "TEXTO_IA" }),
        curado: draft({ conquistaDestaque: "TEXTO_CURADO" }),
      }),
    );
    expect(html).toContain("TEXTO_CURADO");
    expect(html).not.toContain("TEXTO_IA");
  });

  it("renderiza iaOriginal quando curado é null", () => {
    const html = buildFamiliaHtml(
      payload({
        iaOriginal: draft({ conquistaDestaque: "SO_IA" }),
        curado: null,
      }),
    );
    expect(html).toContain("SO_IA");
  });

  it("omite o anexo de dados quando vazio; mostra quando há dados", () => {
    expect(buildFamiliaHtml(payload())).not.toContain("números");
    const comDados = buildFamiliaHtml(
      payload({
        iaOriginal: draft({
          anexoDados: {
            evidenciasPorMeta: [
              { meta: "Pedir o que quer", contagemPeriodo: 4 },
            ],
            avaliacoesFormaisPeriodo: [],
          },
        }),
      }),
    );
    expect(comDados).toContain("números");
    expect(comDados).toContain("Pedir o que quer");
    expect(comDados).toContain("4");
  });

  it("mostra a nota de honestidade em platô (F6)", () => {
    const html = buildFamiliaHtml(
      payload({
        iaOriginal: draft({
          periodoSemAvancoVisivel: true,
          notaHonestidade: "Período de consolidação, sem retrocesso.",
        }),
      }),
    );
    expect(html).toContain("Período de consolidação, sem retrocesso.");
  });

  it("nunca emite <script> nem asset remoto", () => {
    const html = buildFamiliaHtml(payload());
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("url(");
  });

  it("contém as seções-chave", () => {
    const html = buildFamiliaHtml(payload());
    expect(html).toContain("Relatório de acompanhamento");
    expect(html).toContain("A conquista deste período");
    expect(html).toContain("O que estamos trabalhando agora");
    expect(html).toContain("Como apoiar em casa");
    expect(html).toContain("não substitui orientação clínica");
  });

  // ── #258 (D9) — marca institucional white-label ───────────────────────────
  it("sem marca, não emite cabeçalho de clínica", () => {
    const html = buildFamiliaHtml(payload());
    expect(html).not.toContain('marca-clinica"');
    expect(html).not.toContain("data:image/png");
  });

  it("com marca, aplica logotipo e cor no cabeçalho", () => {
    const html = buildFamiliaHtml(payload(), MARCA_CONFIGURADA);
    expect(html).toContain("Clínica Vida Plena");
    expect(html).toContain(
      `src="data:image/png;base64,${PNG_1X1.toString("base64")}"`,
    );
    expect(html).toContain("3px solid #1f4e79");
  });

  it("o selo Iris SOBREVIVE à marca da clínica (guardrail 3 da #258)", () => {
    expect(buildFamiliaHtml(payload(), MARCA_CONFIGURADA)).toContain(SELO_IRIS);
    // E também existe sem marca nenhuma: o selo não depende do white-label.
    expect(buildFamiliaHtml(payload())).toContain(SELO_IRIS);
  });
});
