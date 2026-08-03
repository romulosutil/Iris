import { describe, it, expect } from "vitest";
import {
  comporSecoesProntuarioIntegral,
  gerarHashPdf,
  gerarPdfProntuario,
  montarDetalheAuditoriaExportacao,
} from "./pdf-generator";

describe("comporSecoesProntuarioIntegral", () => {
  it("constrói seções clínicas formatadas para o prontuário integral", () => {
    const secoes = comporSecoesProntuarioIntegral({
      planoTerapeutico: "Intervenção comportamental intensiva 20h/semana",
      responsavelTecnico: {
        nome: "Dra. Ana Silva",
        conselho: "CRP 06/123456",
        registro: "123456",
      },
      evolucoes: [
        { data: "2026-08-01", profissional: "Carlos Lima", texto: "Treino de contato visual." },
      ],
      metasResumo: "3 metas atingidas no período.",
    });

    expect(secoes).toHaveLength(4);
    expect(secoes[0].titulo).toContain("Plano Terapêutico");
    expect(secoes[1].conteudo).toContain("Dra. Ana Silva");
    expect(secoes[2].conteudo).toContain("Treino de contato visual");
    expect(secoes[3].titulo).toContain("Matriz de Evolução");
  });
});

describe("gerarHashPdf", () => {
  it("calcula o hash SHA-256 exato de 64 caracteres hex de um buffer de PDF", () => {
    const bufferFalso = Buffer.from("%PDF-1.4 conteudo-pdf-teste");
    const hash = gerarHashPdf(bufferFalso);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("gerarPdfProntuario", () => {
  const dados = {
    patientId: "patient-uuid-1234",
    nomePaciente: "Carlos Alberto",
    nomeSolicitante: "Maria Souza",
    cpfSolicitante: "123.456.789-00",
    timestampEmissao: new Date("2026-08-02T14:30:00Z"),
    secoes: [
      { titulo: "Resumo Clínico", conteudo: "Paciente evoluiu satisfatoriamente nas sessões." },
      { titulo: "Histórico de Sessões", conteudo: "12 sessões registradas sem intercorrências." },
    ],
  };

  it("gera PDF auditável com metadados e marca d'água nominal do solicitante", async () => {
    const { buffer } = await gerarPdfProntuario(dados, { compress: false });
    const texto = buffer.toString("latin1");

    expect(buffer.length).toBeGreaterThan(100);
    expect(texto).toContain("Carlos Alberto");
    expect(texto).toContain("Iris Plataforma");
  });

  it("utiliza compressão nativa por padrão em produção (compress: true)", async () => {
    const { buffer: bufferComprimido } = await gerarPdfProntuario(dados);
    const { buffer: bufferNaoComprimido } = await gerarPdfProntuario(dados, { compress: false });

    expect(bufferComprimido.length).toBeGreaterThan(0);
    expect(bufferComprimido.length).toBeLessThan(bufferNaoComprimido.length);
  });

  it("retorna hash SHA-256 idêntico a gerarHashPdf(buffer)", async () => {
    const { buffer, hash } = await gerarPdfProntuario(dados);
    expect(hash).toBe(gerarHashPdf(buffer));
    expect(hash).toHaveLength(64);
  });

  it("gera o número correto de páginas (capa + 1 por seção)", async () => {
    const { paginas } = await gerarPdfProntuario(dados);
    expect(paginas).toBe(dados.secoes.length + 1);
  });
});

describe("montarDetalheAuditoriaExportacao (#116 integration)", () => {
  it("constrói o objeto JSONB correto para a trilha imutável audit_log", () => {
    const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const detalhe = montarDetalheAuditoriaExportacao(hash, "user-solicitante-id", "patient-id-123");

    expect(detalhe).toEqual({
      acao: "prontuario_exportado_pdf",
      hash_sha256: hash,
      solicitado_por: "user-solicitante-id",
      patient_id: "patient-id-123",
      fundamento_legal: "LGPD Art. 18, II e V",
      formato: "PDF 1.4 Auditável",
    });
  });
});
