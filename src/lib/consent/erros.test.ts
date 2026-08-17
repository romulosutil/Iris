import { describe, expect, test } from "vitest";
import { traduzirErroDeConsentimento } from "./erros";

/** Simula o formato de erro do driver `postgres` (código SQLSTATE em `.code`). */
class ErroPostgresSimulado extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

describe("traduzirErroDeConsentimento", () => {
  // `42501` é o SQLSTATE de QUALQUER negação de RLS (multi-tenant, "terapeuta
  // não é dono da sessão", gate de consentimento...). Traduzir aqui daria
  // mensagem falsa; quem distingue é `diagnosticarBloqueioDeConsentimento`,
  // que pergunta ao banco depois da recusa.
  test("devolve null para negação genérica de RLS (42501) — não é diagnóstico desta função", () => {
    const err = new ErroPostgresSimulado(
      'new row violates row-level security policy for table "session"',
      "42501",
    );
    expect(traduzirErroDeConsentimento(err)).toBeNull();
  });

  test("devolve null para 'permission denied' genérico", () => {
    const err = new ErroPostgresSimulado(
      'permission denied for table "session"',
      "42501",
    );
    expect(traduzirErroDeConsentimento(err)).toBeNull();
  });

  test("traduz mensagem do RAISE EXCEPTION de somente-leitura (funções definer)", () => {
    const err = new ErroPostgresSimulado(
      "Prontuário em somente-leitura: consentimento revogado (LGPD Art. 8º, §5º)",
    );
    const msg = traduzirErroDeConsentimento(err);
    expect(msg).toMatch(/somente-leitura/i);
    expect(msg).toMatch(/novo consentimento/i);
  });

  test("traduz check constraint consent_responsavel_por_tipo", () => {
    const err = new ErroPostgresSimulado(
      'new row for relation "consent" violates check constraint "consent_responsavel_por_tipo"',
      "23514",
    );
    expect(traduzirErroDeConsentimento(err)).toMatch(/combinação inválida/i);
  });

  test("traduz check constraint consent_versao_termo_por_tipo", () => {
    const err = new ErroPostgresSimulado(
      'new row for relation "consent" violates check constraint "consent_versao_termo_por_tipo"',
      "23514",
    );
    expect(traduzirErroDeConsentimento(err)).toMatch(/versão de termo/i);
  });

  test("traduz FK consent_revogado_mesmo_paciente", () => {
    const err = new ErroPostgresSimulado(
      'insert or update on table "consent" violates foreign key constraint "consent_revogado_mesmo_paciente"',
      "23503",
    );
    expect(traduzirErroDeConsentimento(err)).toMatch(
      /não pertence a este paciente/i,
    );
  });

  test("traduz RAISE EXCEPTION do trigger app_consent_valida_revogacao (revogar revogação)", () => {
    const err = new ErroPostgresSimulado(
      "Não é possível revogar uma revogação (consent 123): para restabelecer o tratamento, registre uma nova concessão de consentimento",
    );
    expect(traduzirErroDeConsentimento(err)).toMatch(
      /não é possível revogar uma revogação/i,
    );
  });

  test("traduz RAISE EXCEPTION do trigger app_consent_valida_revogacao (auto-referência)", () => {
    const err = new ErroPostgresSimulado(
      "Revogação não pode apontar para si mesma (consent 123)",
    );
    expect(traduzirErroDeConsentimento(err)).toMatch(
      /não pode apontar para si mesma/i,
    );
  });

  test("devolve null para erro de constraint não relacionada a consent", () => {
    const err = new ErroPostgresSimulado(
      'new row for relation "goal" violates check constraint "goal_algo"',
      "23514",
    );
    expect(traduzirErroDeConsentimento(err)).toBeNull();
  });

  test("devolve null para erro genérico não reconhecido", () => {
    expect(
      traduzirErroDeConsentimento(new Error("conexão perdida")),
    ).toBeNull();
  });

  test("não quebra com undefined, null ou string", () => {
    expect(traduzirErroDeConsentimento(undefined)).toBeNull();
    expect(traduzirErroDeConsentimento(null)).toBeNull();
    expect(traduzirErroDeConsentimento("algum texto solto")).toBeNull();
  });
});
