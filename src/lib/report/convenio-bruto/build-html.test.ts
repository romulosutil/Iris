import { describe, expect, test } from "vitest";
import { buildConvenioBrutoHtml } from "./build-html";
import type { PayloadConvenioBruto } from "./types";

const base: PayloadConvenioBruto = {
  paciente: { nome: "Miguel S." },
  periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
  geradoEm: "2026-07-20T12:00:00.000Z",
  sessoes: [
    { numeroSequencial: 8, data: "2026-06-10", disciplina: "ABA", modalidade: "presencial",
      estado: "realizada", justificada: null, terapeuta: "Dra. Ana" },
  ],
  evidencias: [
    { data: "2026-06-10", metaOuDominio: "Mando", classificacao: '{"rotulo":"adquirido"}', autor: "Dra. Ana" },
  ],
  presenca: { sessoesRealizadas: 8, faltasJustificadas: 1, faltasNaoJustificadas: 0 },
};

test("monta HTML com dados factuais do período", () => {
  const html = buildConvenioBrutoHtml(base);
  expect(html).toContain("Miguel S.");
  expect(html).toContain("8 sessões realizadas");
  expect(html).toContain("Dra. Ana");
});

test("escapa texto livre (anti-injeção de markup)", () => {
  const html = buildConvenioBrutoHtml({ ...base, paciente: { nome: '<script>x</script>' } });
  expect(html).not.toContain("<script>x</script>");
  expect(html).toContain("&lt;script&gt;");
});

test("não interpola URL/asset remoto nem <script> próprio", () => {
  const html = buildConvenioBrutoHtml(base);
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/<script\b(?![^>]*\/nonce)/); // sem <script> executável
});
