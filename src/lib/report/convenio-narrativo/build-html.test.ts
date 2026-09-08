import { describe, expect, test } from "vitest";
import { buildConvenioNarrativoHtml } from "./build-html";
import { SELO_IRIS } from "../../branding/marca";
import type { ConvenioNarrativoDraft, PayloadConvenioNarrativo } from "./types";

const dossie: PayloadConvenioNarrativo["dossie"] = {
  paciente: { nome: "Miguel S." },
  periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
  geradoEm: "2026-07-20T12:00:00.000Z",
  sessoes: [
    {
      numeroSequencial: 8,
      data: "2026-06-10",
      disciplina: "ABA",
      modalidade: "presencial",
      estado: "realizada",
      justificada: null,
      terapeuta: "Dra. Ana",
    },
  ],
  evidencias: [
    {
      data: "2026-06-10",
      metaOuDominio: "Mando",
      classificacao: '{"rotulo":"adquirido"}',
      autor: "Dra. Ana",
    },
  ],
  presenca: {
    sessoesRealizadas: 8,
    faltasJustificadas: 1,
    faltasNaoJustificadas: 0,
  },
};

const iaOriginal: ConvenioNarrativoDraft = {
  resumoClinico: "Resumo IA original",
  evolucaoPorDominio: [
    { dominio: "Comunicação", narrativa: "Narrativa IA original" },
  ],
  justificativaContinuidade: "Justificativa IA original",
  objetivosProximoPeriodo: ["Objetivo IA 1"],
  periodoSemAvancoVisivel: false,
  notaHonestidade: null,
  status: "rascunho_para_revisao",
};

const base: PayloadConvenioNarrativo = {
  versao: 1,
  paciente: { nome: "Miguel S." },
  periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
  cabecalho: {
    operadora: "Amil",
    cid: "F84.0",
    finalidade: "Renovação de guia",
  },
  geradoEm: "2026-07-20T12:00:00.000Z",
  provider: "stub",
  dossie,
  iaOriginal,
  curado: null,
};

test("monta HTML com bloco factual e bloco narrativo (iaOriginal quando curado é null)", () => {
  const html = buildConvenioNarrativoHtml(base);
  expect(html).toContain("Miguel S.");
  expect(html).toContain("Dra. Ana");
  expect(html).toContain("8 sessões realizadas");
  expect(html).toContain("Resumo IA original");
  expect(html).toContain("Narrativa IA original");
  expect(html).toContain("Justificativa IA original");
  expect(html).toContain("Objetivo IA 1");
  expect(html).toContain("Dados extraídos em");
  expect(html).toContain(base.geradoEm);
  expect(html).toContain("conforme prescrição médica assistente");
});

test("usa curado quando presente, ignorando iaOriginal", () => {
  const curado: ConvenioNarrativoDraft = {
    resumoClinico: "Resumo curado",
    evolucaoPorDominio: [
      { dominio: "Comunicação", narrativa: "Narrativa curada" },
    ],
    justificativaContinuidade: "Justificativa curada",
    objetivosProximoPeriodo: ["Objetivo curado 1"],
    periodoSemAvancoVisivel: false,
    notaHonestidade: null,
    status: "rascunho_para_revisao",
  };
  const html = buildConvenioNarrativoHtml({ ...base, curado });
  expect(html).toContain("Resumo curado");
  expect(html).toContain("Narrativa curada");
  expect(html).not.toContain("Resumo IA original");
  expect(html).not.toContain("Narrativa IA original");
});

test("renderiza nota de honestidade quando período sem avanço visível", () => {
  const html = buildConvenioNarrativoHtml({
    ...base,
    iaOriginal: {
      ...iaOriginal,
      periodoSemAvancoVisivel: true,
      notaHonestidade: "Nota de honestidade sobre estagnação",
    },
  });
  expect(html).toContain("Nota de honestidade sobre estagnação");
});

test("escapa texto livre no cabeçalho e na narrativa (anti-injeção de markup)", () => {
  const html = buildConvenioNarrativoHtml({
    ...base,
    cabecalho: {
      operadora: "<script>x1</script>",
      cid: "F84",
      finalidade: "<script>x2</script>",
    },
    iaOriginal: {
      ...iaOriginal,
      resumoClinico: "<script>x3</script>",
      evolucaoPorDominio: [
        { dominio: "Comunicação", narrativa: "<script>x4</script>" },
      ],
      periodoSemAvancoVisivel: true,
      notaHonestidade: "<script>x5</script>",
    },
  });
  expect(html).not.toContain("<script>x1</script>");
  expect(html).not.toContain("<script>x2</script>");
  expect(html).not.toContain("<script>x3</script>");
  expect(html).not.toContain("<script>x4</script>");
  expect(html).not.toContain("<script>x5</script>");
  expect(html).toContain("&lt;script&gt;");
});

test("não contém <script> executável nem URL remota", () => {
  const html = buildConvenioNarrativoHtml(base);
  expect(html).not.toMatch(/<script\b(?![^>]*\/nonce)/);
  expect(html).not.toMatch(/https?:\/\//);
});

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

test("sem marca, não emite cabeçalho de clínica", () => {
  const html = buildConvenioNarrativoHtml(base);
  expect(html).not.toContain("data:image/png");
  expect(html).not.toContain("Clínica Vida Plena");
});

test("com marca, aplica logotipo e cor no cabeçalho do relatório", () => {
  const html = buildConvenioNarrativoHtml(base, MARCA_CONFIGURADA);
  expect(html).toContain("Clínica Vida Plena");
  expect(html).toContain(
    `src="data:image/png;base64,${PNG_1X1.toString("base64")}"`,
  );
  expect(html).toContain("3px solid #1f4e79");
});

test("o selo Iris SOBREVIVE à marca da clínica (guardrail 3 da #258)", () => {
  expect(buildConvenioNarrativoHtml(base, MARCA_CONFIGURADA)).toContain(
    SELO_IRIS,
  );
  expect(buildConvenioNarrativoHtml(base)).toContain(SELO_IRIS);
});

test("snapshot estrutural", () => {
  expect(buildConvenioNarrativoHtml(base)).toMatchSnapshot();
});
