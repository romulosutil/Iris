import crypto from "node:crypto";
import PDFDocument from "pdfkit";

export interface SecaoProntuario {
  titulo: string;
  conteudo: string;
}

export interface DadosProntuarioExport {
  patientId: string;
  nomePaciente: string;
  nomeSolicitante: string;
  cpfSolicitante: string;
  timestampEmissao: Date;
  secoes: SecaoProntuario[];
}

export interface InputComposicaoProntuario {
  planoTerapeutico?: string;
  responsavelTecnico?: { nome: string; registro: string; conselho: string };
  evolucoes?: Array<{ data: string; profissional: string; texto: string }>;
  metasResumo?: string;
}

/**
 * Constrói a lista estruturada de seções clínicas para o Prontuário Integral
 * em conformidade com as exigências de auditoria de planos de saúde.
 */
export function comporSecoesProntuarioIntegral(
  input: InputComposicaoProntuario,
): SecaoProntuario[] {
  const secoes: SecaoProntuario[] = [];

  if (input.planoTerapeutico) {
    secoes.push({
      titulo: `${secoes.length + 1}. Plano Terapêutico Singular (PTS)`,
      conteudo: input.planoTerapeutico,
    });
  }

  if (input.responsavelTecnico) {
    secoes.push({
      titulo: `${secoes.length + 1}. Responsável Técnico pelo Prontuário`,
      conteudo: `Nome: ${input.responsavelTecnico.nome} | Conselho: ${input.responsavelTecnico.conselho} | Registro: ${input.responsavelTecnico.registro}`,
    });
  }

  if (input.evolucoes && input.evolucoes.length > 0) {
    const textoEvolucoes = input.evolucoes
      .map(
        (ev, index) =>
          `[Sessão ${index + 1} - ${ev.data}] Profissional: ${ev.profissional}\nEvolução: ${ev.texto}`,
      )
      .join("\n\n");

    secoes.push({
      titulo: `${secoes.length + 1}. Histórico de Evoluções Clínicas Factuais`,
      conteudo: textoEvolucoes,
    });
  }

  if (input.metasResumo) {
    secoes.push({
      titulo: `${secoes.length + 1}. Matriz de Evolução de Metas e Marcos`,
      conteudo: input.metasResumo,
    });
  }

  return secoes;
}

/**
 * Calcula o Hash SHA-256 exato (64 caracteres hex) de um buffer de PDF.
 */
export function gerarHashPdf(pdfBuffer: Buffer): string {
  return crypto.createHash("sha256").update(pdfBuffer).digest("hex");
}

function desenharMarcaDagua(doc: PDFKit.PDFDocument, texto: string) {
  const savedY = doc.y;
  doc.save();
  doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc
    .fillColor("black")
    .opacity(0.12)
    .fontSize(11)
    .text(texto, 0, doc.page.height / 2 - 10, {
      width: doc.page.width,
      align: "center",
      lineBreak: false,
    });
  doc.restore();
  doc.y = savedY;
}

function desenharRodapeAuditavel(
  doc: PDFKit.PDFDocument,
  pagina: number,
  totalPaginas: number,
) {
  const savedY = doc.y;
  doc.save();
  doc
    .fontSize(7)
    .fillColor("black")
    .opacity(0.75)
    .text(
      `CÓPIA INTEGRAL DE PRONTUÁRIO CLÍNICO (LGPD ART. 18, II E V) — PÁGINA ${pagina}/${totalPaginas} — ASSINATURA DE INTEGRIDADE SHA-256 REGISTRADA NA TRILHA DE AUDITORIA`,
      50,
      doc.page.height - 35,
      { width: doc.page.width - 100, align: "center", lineBreak: false },
    );
  doc.restore();
  doc.y = savedY;
}

/**
 * Gera um prontuário clínico integral em formato PDF 1.4 auditável com marca d'água
 * e calcula o hash SHA-256 do arquivo resultante.
 */
export async function gerarPdfProntuario(
  dados: DadosProntuarioExport,
  options: { compress?: boolean } = {},
): Promise<{ buffer: Buffer; hash: string; paginas: number }> {
  const marcaDagua = `EMITIDO PARA: ${dados.nomeSolicitante} - CPF: ${dados.cpfSolicitante} EM ${dados.timestampEmissao.toISOString()}`;

  const doc = new PDFDocument({
    size: "A4",
    pdfVersion: "1.4",
    tagged: true,
    bufferPages: true,
    compress: options.compress ?? true,
    info: {
      Title: `Prontuário Clínico — ${dados.nomePaciente}`,
      Author: `Iris Plataforma Clínica LGPD`,
      Subject: `Cópia de Prontuário Auditável (LGPD Art. 18)`,
      CreationDate: dados.timestampEmissao,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const fim = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", (err) => reject(err));
  });

  // Página 1: Capa do Prontuário
  doc
    .fontSize(20)
    .text(`Prontuário Clínico — ${dados.nomePaciente}`, { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .fillColor("#444444")
    .text(
      `Documento emitido conforme LGPD (Lei 13.709/2018, Art. 18, II e V)`,
      { align: "center" },
    );
  doc.moveDown(1.5);

  doc.fontSize(11).fillColor("black");
  doc.text(`Solicitante: ${dados.nomeSolicitante}`);
  doc.text(`CPF do Solicitante: ${dados.cpfSolicitante}`);
  doc.text(`Data/Hora de Emissão: ${dados.timestampEmissao.toISOString()}`);
  doc.text(`ID do Paciente: ${dados.patientId}`);

  // Páginas das seções clínicas
  dados.secoes.forEach((secao) => {
    doc.addPage();
    doc.fontSize(14).fillColor("black").text(secao.titulo);
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#222222").text(secao.conteudo);
  });

  // Aplicação de marca d'água e rodapé em todas as páginas geradas
  const range = doc.bufferedPageRange();
  const totalPaginas = range.count;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    desenharMarcaDagua(doc, marcaDagua);
    desenharRodapeAuditavel(doc, i + 1, totalPaginas);
  }

  doc.end();
  await fim;

  const buffer = Buffer.concat(chunks);
  const hash = gerarHashPdf(buffer);

  return { buffer, hash, paginas: totalPaginas };
}

/**
 * Constrói o objeto de detalhe para registro na trilha imutável `audit_log` (#116),
 * garantindo a auditabilidade e não-repúdio da entrega do prontuário.
 */
export function montarDetalheAuditoriaExportacao(
  hashSha256: string,
  solicitanteId: string,
  patientId: string,
) {
  return {
    acao: "prontuario_exportado_pdf",
    hash_sha256: hashSha256,
    solicitado_por: solicitanteId,
    patient_id: patientId,
    fundamento_legal: "LGPD Art. 18, II e V",
    formato: "PDF 1.4 Auditável",
  };
}
