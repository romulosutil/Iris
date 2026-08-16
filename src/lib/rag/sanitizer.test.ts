import { describe, it, expect } from "vitest";
import {
  sanitizarTextoClinico,
  sanitizarDocumentoClinico,
  criarMapeamentoAnonimizacao,
} from "./sanitizer";
import type { ClinicalDocument } from "./types";

describe("Sanitizador LGPD de Dados Clínicos", () => {
  it("remove CPFs em diversos formatos (com ou sem pontuação)", () => {
    const texto =
      "Paciente filho de João, portador do CPF 123.456.789-00 e responsável CPF 98765432100.";
    const resultado = sanitizarTextoClinico(texto);
    expect(resultado).not.toContain("123.456.789-00");
    expect(resultado).not.toContain("98765432100");
    expect(resultado).toContain("[CPF_REMOVIDO]");
  });

  it("remove e-mails e números de telefone/celular brasileiros", () => {
    const texto =
      "Contato da mãe: maria.souza@gmail.com ou tel (11) 98765-4321 / +55 21 91234-5678.";
    const resultado = sanitizarTextoClinico(texto);
    expect(resultado).not.toContain("maria.souza@gmail.com");
    expect(resultado).not.toContain("98765-4321");
    expect(resultado).not.toContain("91234-5678");
    expect(resultado).toContain("[EMAIL_REMOVIDO]");
    expect(resultado).toContain("[TELEFONE_REMOVIDO]");
  });

  it("substitui nomes explícitos fornecidos no mapeamento determinístico por pseudônimos", () => {
    const mapeamento = criarMapeamentoAnonimizacao({
      nomePaciente: "Arthur Pereira Santos",
      nomeResponsavel: "Carla Pereira",
      nomeProfissional: "Dra. Beatriz Oliveira",
    });

    const texto =
      "Arthur Pereira Santos demonstrou melhora. Carla Pereira relatou que Dra. Beatriz Oliveira orientou a rotina.";
    const resultado = sanitizarTextoClinico(texto, mapeamento);

    expect(resultado).not.toContain("Arthur Pereira Santos");
    expect(resultado).not.toContain("Carla Pereira");
    expect(resultado).not.toContain("Beatriz Oliveira");
    expect(resultado).toContain("[PACIENTE]");
    expect(resultado).toContain("[RESPONSAVEL]");
    expect(resultado).toContain("[PROFISSIONAL]");
  });

  it("preserva rigorosamente termos clínicos, protocolos, domínios e idades em meses", () => {
    const textoClinico =
      "Paciente com 42 meses realizou treino de mando vocal independente no protocolo VB-MAPP (domínio tato nível 2). Apresentou episódio de esquiva com dica_gestual.";
    const resultado = sanitizarTextoClinico(textoClinico);

    expect(resultado).toContain("42 meses");
    expect(resultado).toContain("mando vocal");
    expect(resultado).toContain("independente");
    expect(resultado).toContain("VB-MAPP");
    expect(resultado).toContain("tato nível 2");
    expect(resultado).toContain("esquiva");
    expect(resultado).toContain("dica_gestual");
  });

  it("sanitiza um ClinicalDocument completo mantendo a estrutura de seções", () => {
    const doc: ClinicalDocument = {
      id: "doc-123",
      clinicId: "clinic-abc",
      patientId: "patient-xyz",
      nomePacienteOriginal: "Lucas Gabriel Silva",
      cpfPacienteOriginal: "111.222.333-44",
      timestamp: new Date("2026-08-10T10:00:00Z"),
      modality: "aba",
      disciplina: "psicologia",
      secoes: [
        {
          tipo: "capa_identificacao",
          titulo: "1. Capa",
          conteudo:
            "Paciente: Lucas Gabriel Silva, CPF 111.222.333-44. Responsável: Ana Silva.",
        },
        {
          tipo: "evolucao_sessao",
          titulo: "2. Evolução da Sessão",
          conteudo:
            "Lucas Gabriel Silva respondeu a estímulos intraverbais com dica_verbal.",
          dominios: ["intraverbal"],
          metas: ["meta-1"],
        },
      ],
    };

    const docSanitizado = sanitizarDocumentoClinico(doc);

    expect(docSanitizado.nomePacienteOriginal).toBeUndefined();
    expect(docSanitizado.cpfPacienteOriginal).toBeUndefined();
    expect(docSanitizado.secoes[0]!.conteudo).not.toContain(
      "Lucas Gabriel Silva",
    );
    expect(docSanitizado.secoes[0]!.conteudo).not.toContain("111.222.333-44");
    expect(docSanitizado.secoes[0]!.conteudo).toContain("[PACIENTE]");
    expect(docSanitizado.secoes[1]!.conteudo).toContain("dica_verbal");
    expect(docSanitizado.secoes[1]!.dominios).toEqual(["intraverbal"]);
  });
});
