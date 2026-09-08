/**
 * #259 (D10 / T6) — assinatura ICP-Brasil: porta, dublê e fallback.
 *
 * Todos os testes rodam contra `FakePkiSignerProvider`. Nenhum certificado
 * real, nenhuma credencial, nenhum endpoint de provedor — não existe provedor
 * contratado (T2 fora de escopo). O que se mede aqui é o CONTRATO: o que sai
 * do Iris, o que NÃO sai, e o que acontece quando o caminho falha.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  ACAO_AUDITORIA_ASSINATURA,
  calcularDigestParaAssinatura,
  emitirPdfAssinado,
  montarDetalheAuditoriaAssinaturaIcp,
  registrarAssinaturaIcpNaTrilha,
} from "./pdf-signer";
import {
  CERTIFICADO_DUBLE,
  EmbutidorPadesFalso,
  FakePkiSignerProvider,
  MARCADOR_DUBLE,
  NOME_PROVEDOR_DUBLE,
} from "./signer/fake-provider";
import {
  ErroAssinaturaIcp,
  PERFIL_PADES,
  type EnvelopeAssinatura,
  type PkiSignerProvider,
} from "./signer/types";

const PDF = Buffer.from("%PDF-1.4 relatorio de evolucao\n%%EOF\n");
const AGORA = new Date("2026-06-15T12:00:00.000Z");
const CREDENCIAL = {
  clinicId: "11111111-1111-1111-1111-111111111111",
  credencialId: "22222222-2222-2222-2222-222222222222",
};

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function baseIcp(provider: PkiSignerProvider) {
  return {
    pdf: PDF,
    exigeIcpBrasil: true as const,
    agora: AGORA,
    credencial: CREDENCIAL,
    provider,
    embutidor: new EmbutidorPadesFalso(),
    aceitarProvedorSemValidadeJuridica: true,
  };
}

describe("fallback transparente (guardrail #4 da #259)", () => {
  it("relatório que não pede ICP-Brasil sai no modelo padrão, byte a byte igual", async () => {
    const provider = new FakePkiSignerProvider();

    const r = await emitirPdfAssinado({
      pdf: PDF,
      exigeIcpBrasil: false,
      agora: AGORA,
      credencial: CREDENCIAL,
      provider,
      embutidor: new EmbutidorPadesFalso(),
      aceitarProvedorSemValidadeJuridica: true,
    });

    expect(r.modo).toBe("padrao");
    expect(r.pdf.equals(PDF)).toBe(true);
    expect(r.hashSha256).toBe(sha256(PDF));
  });

  it("no modo padrão o provedor NÃO é acionado, mesmo estando injetado", async () => {
    // A régua do fallback não é "o resultado veio certo" — é "a chave privada
    // não foi tocada". Um `emitirPdfAssinado` que assinasse e depois jogasse
    // fora o envelope passaria no teste acima e falharia neste.
    const provider = new FakePkiSignerProvider();

    await emitirPdfAssinado({
      pdf: PDF,
      exigeIcpBrasil: false,
      agora: AGORA,
      credencial: CREDENCIAL,
      provider,
      embutidor: new EmbutidorPadesFalso(),
      aceitarProvedorSemValidadeJuridica: true,
    });

    expect(provider.chamadas).toHaveLength(0);
  });

  it("modo padrão funciona SEM credencial, provedor ou embutidor injetados", async () => {
    const r = await emitirPdfAssinado({
      pdf: PDF,
      exigeIcpBrasil: false,
      agora: AGORA,
    });

    expect(r.modo).toBe("padrao");
  });
});

describe("emitirPdfAssinado — caminho ICP-Brasil", () => {
  it("devolve PDF com o envelope embutido e hash dos bytes ASSINADOS", async () => {
    const provider = new FakePkiSignerProvider();

    const r = await emitirPdfAssinado(baseIcp(provider));

    expect(r.modo).toBe("icp_brasil");
    if (r.modo !== "icp_brasil") return;
    expect(r.pdf.equals(PDF)).toBe(false);
    expect(r.pdf.toString("latin1")).toContain(MARCADOR_DUBLE);
    // O hash auditado é o do arquivo final, não o do documento de entrada.
    expect(r.hashSha256).toBe(sha256(r.pdf));
    expect(r.hashSha256).not.toBe(sha256(PDF));
    expect(r.hashDocumentoOriginal).toBe(sha256(PDF));
    expect(r.certificado.numeroSerie).toBe(CERTIFICADO_DUBLE.numeroSerie);
    expect(r.provedor).toBe(NOME_PROVEDOR_DUBLE);
  });

  it("envia ao provedor o DIGEST, nunca os bytes do documento", async () => {
    // O ponto inteiro do desenho da porta (T1): o prontuário não sai do Iris.
    const provider = new FakePkiSignerProvider();

    await emitirPdfAssinado(baseIcp(provider));

    expect(provider.chamadas).toHaveLength(1);
    const sol = provider.chamadas[0]!;
    expect(sol.digest.algoritmo).toBe("SHA-256");
    expect(sol.digest.valorHex).toBe(sha256(PDF));
    expect(sol.perfil).toBe(PERFIL_PADES);
    expect(sol.assinadoEm).toBe(AGORA);
    // Nenhum campo da solicitação carrega binário do documento.
    const serializada = JSON.stringify(sol);
    expect(serializada).not.toContain(PDF.toString("latin1"));
    expect(Object.values(sol).some((v) => Buffer.isBuffer(v))).toBe(false);
  });

  it("é determinístico: duas emissões da mesma entrada dão os mesmos bytes", async () => {
    const a = await emitirPdfAssinado(baseIcp(new FakePkiSignerProvider()));
    const b = await emitirPdfAssinado(baseIcp(new FakePkiSignerProvider()));

    expect(a.pdf.equals(b.pdf)).toBe(true);
    expect(a.hashSha256).toBe(b.hashSha256);
  });

  it("marca `juridicamenteValido: false` quando o artefato veio do dublê", async () => {
    const r = await emitirPdfAssinado(baseIcp(new FakePkiSignerProvider()));

    expect(r.modo).toBe("icp_brasil");
    if (r.modo !== "icp_brasil") return;
    expect(r.juridicamenteValido).toBe(false);
  });
});

describe("emitirPdfAssinado — falha fechada, nunca degrada em silêncio", () => {
  it("sem credencial vigente: estoura `credencial_ausente` em vez de cair no modo padrão", async () => {
    const provider = new FakePkiSignerProvider();

    const erro = await emitirPdfAssinado({
      ...baseIcp(provider),
      credencial: undefined,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroAssinaturaIcp);
    expect((erro as ErroAssinaturaIcp).codigo).toBe("credencial_ausente");
    expect((erro as ErroAssinaturaIcp).retentavel).toBe(false);
    expect(provider.chamadas).toHaveLength(0);
  });

  it("certificado fora da validade: recusa ANTES de chamar o provedor", async () => {
    const provider = new FakePkiSignerProvider({
      certificado: {
        ...CERTIFICADO_DUBLE,
        validoDe: new Date("2020-01-01T00:00:00.000Z"),
        validoAte: new Date("2021-01-01T00:00:00.000Z"),
      },
    });

    const erro = await emitirPdfAssinado(baseIcp(provider)).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ErroAssinaturaIcp);
    expect((erro as ErroAssinaturaIcp).codigo).toBe("certificado_expirado");
    // A régua: nenhuma ida à rede para descobrir o que o Iris já sabia.
    expect(provider.chamadas).toHaveLength(0);
  });

  it("dublê sem declaração explícita do chamador é recusado", async () => {
    const provider = new FakePkiSignerProvider();

    const erro = await emitirPdfAssinado({
      ...baseIcp(provider),
      aceitarProvedorSemValidadeJuridica: false,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroAssinaturaIcp);
    expect((erro as ErroAssinaturaIcp).codigo).toBe(
      "provedor_sem_validade_juridica",
    );
    expect(provider.chamadas).toHaveLength(0);
  });

  it("provedor fora do ar propaga o erro marcado como RETENTÁVEL", async () => {
    const provider = new FakePkiSignerProvider({
      falharCom: "provedor_indisponivel",
    });

    const erro = await emitirPdfAssinado(baseIcp(provider)).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ErroAssinaturaIcp);
    expect((erro as ErroAssinaturaIcp).codigo).toBe("provedor_indisponivel");
    expect((erro as ErroAssinaturaIcp).retentavel).toBe(true);
  });

  it("senha recusada pelo custodiante NÃO é retentável", async () => {
    const provider = new FakePkiSignerProvider({ falharCom: "senha_invalida" });

    const erro = await emitirPdfAssinado(baseIcp(provider)).catch(
      (e: unknown) => e,
    );

    expect((erro as ErroAssinaturaIcp).retentavel).toBe(false);
    // A mensagem não pode ecoar o segredo que foi recusado.
    expect((erro as ErroAssinaturaIcp).message).not.toContain("senha=");
  });

  it("envelope sem OCSP/CRL é recusado: seria B-T, não B-LT", async () => {
    // Provedor artesanal: devolve envelope estruturalmente válido, mas sem o
    // material de validação de longo prazo.
    const envelopeSemLtv = (base: EnvelopeAssinatura): EnvelopeAssinatura => ({
      ...base,
      validacaoLongoPrazo: { ocspBase64: [], crlBase64: [] },
    });
    const interno = new FakePkiSignerProvider();
    const provider: PkiSignerProvider = {
      nome: "duble_sem_ltv",
      produzAssinaturaJuridicamenteValida: false,
      descreverCertificado: (c) => interno.descreverCertificado(c),
      assinarDigest: async (s) =>
        envelopeSemLtv(await interno.assinarDigest(s)),
    };

    const erro = await emitirPdfAssinado(baseIcp(provider)).catch(
      (e: unknown) => e,
    );

    expect((erro as ErroAssinaturaIcp).codigo).toBe(
      "validacao_longo_prazo_incompleta",
    );
  });

  it("envelope sem carimbo de tempo é recusado", async () => {
    const interno = new FakePkiSignerProvider();
    const provider: PkiSignerProvider = {
      nome: "duble_sem_carimbo",
      produzAssinaturaJuridicamenteValida: false,
      descreverCertificado: (c) => interno.descreverCertificado(c),
      assinarDigest: async (s) => {
        const env = await interno.assinarDigest(s);
        return { ...env, carimbo: { ...env.carimbo, tokenBase64: "" } };
      },
    };

    const erro = await emitirPdfAssinado(baseIcp(provider)).catch(
      (e: unknown) => e,
    );

    expect((erro as ErroAssinaturaIcp).codigo).toBe("carimbo_recusado");
  });

  it("wiring incompleto é bug, não erro de domínio", async () => {
    const erro = await emitirPdfAssinado({
      pdf: PDF,
      exigeIcpBrasil: true,
      agora: AGORA,
      credencial: CREDENCIAL,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(ErroAssinaturaIcp);
  });
});

describe("calcularDigestParaAssinatura", () => {
  it("devolve SHA-256 hex de 64 caracteres do buffer", () => {
    const d = calcularDigestParaAssinatura(PDF);
    expect(d.algoritmo).toBe("SHA-256");
    expect(d.valorHex).toMatch(/^[a-f0-9]{64}$/);
    expect(d.valorHex).toBe(sha256(PDF));
  });
});

describe("trilha de auditoria (guardrail #3 da #259)", () => {
  it("o detalhe carrega hash do PDF assinado e número de série do certificado", async () => {
    const r = await emitirPdfAssinado(baseIcp(new FakePkiSignerProvider()));
    expect(r.modo).toBe("icp_brasil");
    if (r.modo !== "icp_brasil") return;

    const detalhe = montarDetalheAuditoriaAssinaturaIcp({
      hashPdfAssinado: r.hashSha256,
      hashDocumentoOriginal: r.hashDocumentoOriginal,
      numeroSerieCertificado: r.certificado.numeroSerie,
      provedor: r.provedor,
      carimboEm: r.carimbo.emitidoEm,
      juridicamenteValido: r.juridicamenteValido,
    });

    expect(detalhe.acao).toBe("relatorio_assinado_icp");
    expect(detalhe.hash_sha256).toBe(sha256(r.pdf));
    expect(detalhe.hash_documento_original).toBe(sha256(PDF));
    expect(detalhe.certificado_numero_serie).toBe(
      CERTIFICADO_DUBLE.numeroSerie,
    );
    expect(detalhe.perfil).toBe(PERFIL_PADES);
    expect(detalhe.juridicamente_valido).toBe(false);
  });

  it("grava por INSERT em audit_log, com os valores como parâmetros ligados", async () => {
    // `audit_log` é imutável para `app_role` (REVOKE UPDATE, DELETE na 0039),
    // mas INSERT é o caminho sancionado — o mesmo de `report/export.ts`.
    // Nenhuma função SECURITY DEFINER no meio: definer é para MUTAR a trilha.
    const capturadas: SQL[] = [];
    const txFalso = {
      execute: async (query: SQL) => {
        capturadas.push(query);
        return undefined as never;
      },
    } as unknown as Parameters<typeof registrarAssinaturaIcpNaTrilha>[0];

    await registrarAssinaturaIcpNaTrilha(txFalso, {
      clinicId: CREDENCIAL.clinicId,
      atorId: "33333333-3333-3333-3333-333333333333",
      reportId: "44444444-4444-4444-4444-444444444444",
      patientId: "55555555-5555-5555-5555-555555555555",
      detalhe: montarDetalheAuditoriaAssinaturaIcp({
        hashPdfAssinado: "a".repeat(64),
        hashDocumentoOriginal: "b".repeat(64),
        numeroSerieCertificado: CERTIFICADO_DUBLE.numeroSerie,
        provedor: NOME_PROVEDOR_DUBLE,
        carimboEm: AGORA,
        juridicamenteValido: false,
      }),
    });

    expect(capturadas).toHaveLength(1);
    const { sql: texto, params } = new PgDialect().sqlToQuery(capturadas[0]!);

    expect(texto).toContain("INSERT INTO audit_log");
    expect(texto).not.toContain("UPDATE audit_log");
    // Nada de interpolação: os ids e o JSON chegam como parâmetros ligados.
    expect(texto).not.toContain(CREDENCIAL.clinicId);
    expect(params).toContain(ACAO_AUDITORIA_ASSINATURA);
    expect(params).toContain(CREDENCIAL.clinicId);
    expect(
      params.some(
        (p) =>
          typeof p === "string" && p.includes(CERTIFICADO_DUBLE.numeroSerie),
      ),
    ).toBe(true);
  });
});
