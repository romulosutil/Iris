import { describe, it, expect } from "vitest";
import {
  comporSecoesProntuarioIntegral,
  gerarHashPdf,
  gerarPdfProntuario,
  montarDetalheAuditoriaExportacao,
} from "./pdf-generator";
import { SELO_IRIS, type MarcaClinica } from "../branding/marca";

/**
 * O pdfkit escreve o texto do conteúdo como runs hexadecimais dentro de
 * arrays `TJ`, quebrados pelo kerning (`[<436c…> 50 <5669…>] TJ`) — por isso
 * `buffer.toString()` NÃO contém as frases do documento, só os metadados do
 * `/Info`. Este helper reconstrói o texto visível concatenando os runs na
 * ordem em que aparecem; é o único jeito de asseverar sobre o que sai
 * impresso, e não sobre o que foi passado para a função.
 */
function textoVisivelDoPdf(buffer: Buffer): string {
  return [...buffer.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1]!, "hex").toString("latin1"))
    .join("");
}

/** PNG 1×1 transparente válido (assinatura + IHDR + IDAT + IEND). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const MARCA_CONFIGURADA: MarcaClinica = {
  logo: PNG_1X1,
  logoMime: "image/png",
  corPrimaria: "#1f4e79",
  nomeClinica: "Clinica Vida Plena",
};

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
        {
          data: "2026-08-01",
          profissional: "Carlos Lima",
          texto: "Treino de contato visual.",
        },
      ],
      metasResumo: "3 metas atingidas no período.",
    });

    expect(secoes).toHaveLength(4);
    expect(secoes[0]?.titulo).toContain("Plano Terapêutico");
    expect(secoes[1]?.conteudo).toContain("Dra. Ana Silva");
    expect(secoes[2]?.conteudo).toContain("Treino de contato visual");
    expect(secoes[3]?.titulo).toContain("Matriz de Evolução");
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
      {
        titulo: "Resumo Clínico",
        conteudo: "Paciente evoluiu satisfatoriamente nas sessões.",
      },
      {
        titulo: "Histórico de Sessões",
        conteudo: "12 sessões registradas sem intercorrências.",
      },
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
    const { buffer: bufferNaoComprimido } = await gerarPdfProntuario(dados, {
      compress: false,
    });

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

describe("marca institucional white-label (#258 / D9)", () => {
  const dados = {
    patientId: "patient-uuid-1234",
    nomePaciente: "Carlos Alberto",
    nomeSolicitante: "Maria Souza",
    cpfSolicitante: "123.456.789-00",
    timestampEmissao: new Date("2026-08-02T14:30:00Z"),
    secoes: [{ titulo: "Resumo Clínico", conteudo: "Evolução satisfatória." }],
  };

  it("sem marca configurada, o prontuário sai com o cabeçalho neutro", async () => {
    const { buffer } = await gerarPdfProntuario(dados, { compress: false });
    const visivel = textoVisivelDoPdf(buffer);

    expect(visivel).not.toContain("Clinica Vida Plena");
    // Nenhum XObject de imagem: sem logotipo, nada é embutido.
    expect(buffer.toString("latin1")).not.toContain("/Subtype /Image");
  });

  it("com marca configurada, o cabeçalho traz nome, logotipo e a cor da clínica", async () => {
    const { buffer } = await gerarPdfProntuario(
      { ...dados, marca: MARCA_CONFIGURADA },
      { compress: false },
    );

    expect(textoVisivelDoPdf(buffer)).toContain("Clinica Vida Plena");

    const cru = buffer.toString("latin1");
    expect(cru).toContain("/Subtype /Image");
    // Régua do cabeçalho no tom da clínica: #1f4e79 → operador de traço.
    const [r, g, b] = [0x1f / 255, 0x4e / 255, 0x79 / 255];
    expect(cru).toContain(`${r} ${g} ${b} SCN`);
  });

  it("o selo Iris e a marca d'água do solicitante SOBREVIVEM à marca da clínica", async () => {
    // Guardrail 3 da #258: é este teste que trava a feature inteira. Uma
    // clínica com logotipo, cor e nome configurados não consegue apagar nem a
    // identificação da plataforma nem a marca d'água nominal — as duas coisas
    // que distinguem um documento emitido pelo Iris de um PDF montado à mão.
    const { buffer } = await gerarPdfProntuario(
      { ...dados, marca: MARCA_CONFIGURADA },
      { compress: false },
    );
    const visivel = textoVisivelDoPdf(buffer);

    expect(visivel).toContain(SELO_IRIS);
    expect(visivel).toContain("Gerado via Iris SaaS");
    expect(visivel).toContain("EMITIDO PARA: Maria Souza");
    expect(visivel).toContain("CPF: 123.456.789-00");
    expect(visivel).toContain("LGPD ART. 18, II E V");
  });

  it("o selo Iris aparece em TODAS as páginas, não só na capa", async () => {
    const varias = {
      ...dados,
      marca: MARCA_CONFIGURADA,
      secoes: [
        { titulo: "A", conteudo: "a" },
        { titulo: "B", conteudo: "b" },
        { titulo: "C", conteudo: "c" },
      ],
    };
    const { buffer, paginas } = await gerarPdfProntuario(varias, {
      compress: false,
    });
    const visivel = textoVisivelDoPdf(buffer);

    expect(paginas).toBe(4);
    expect(visivel.split("Gerado via Iris SaaS").length - 1).toBe(4);
  });

  it("logotipo corrompido não impede a entrega do prontuário (LGPD Art. 18)", async () => {
    const { buffer, paginas } = await gerarPdfProntuario(
      {
        ...dados,
        marca: {
          ...MARCA_CONFIGURADA,
          logo: Buffer.from("isto não é um PNG decodificável"),
        },
      },
      { compress: false },
    );
    const visivel = textoVisivelDoPdf(buffer);

    expect(paginas).toBe(2);
    expect(visivel).toContain("Clinica Vida Plena");
    expect(visivel).toContain(SELO_IRIS);
  });
});

describe("montarDetalheAuditoriaExportacao (#116 integration)", () => {
  it("constrói o objeto JSONB correto para a trilha imutável audit_log", () => {
    const hash =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const detalhe = montarDetalheAuditoriaExportacao(
      hash,
      "user-solicitante-id",
      "patient-id-123",
    );

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
