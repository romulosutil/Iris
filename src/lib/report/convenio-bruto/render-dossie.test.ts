import { describe, expect, test } from "vitest";
import { renderDossieTablesHtml } from "./render-dossie";
import type { PayloadConvenioBruto } from "./types";

const base: PayloadConvenioBruto = {
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

test("renderiza tabelas de sessões, presença e evidências", () => {
  const html = renderDossieTablesHtml(base);
  expect(html).toContain("Dra. Ana");
  expect(html).toContain("ABA");
  expect(html).toContain("Mando");
  expect(html).toContain("8 sessões realizadas");
  expect(html).toContain("1 falta(s) justificada(s)");
});

test("escapa texto livre (anti-injeção de markup)", () => {
  const html = renderDossieTablesHtml({
    ...base,
    sessoes: [{ ...base.sessoes[0]!, terapeuta: "<script>x</script>" }],
    evidencias: [
      { ...base.evidencias[0]!, metaOuDominio: '"><script>y</script>' },
    ],
  });
  expect(html).not.toContain("<script>x</script>");
  expect(html).not.toContain("<script>y</script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&quot;");
});

test("não interpola URL/asset remoto nem <script> próprio", () => {
  const html = renderDossieTablesHtml(base);
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/<script\b(?![^>]*\/nonce)/);
});
