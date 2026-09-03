import { afterEach, describe, expect, test } from "vitest";
import {
  FLAGS,
  asrHabilitado,
  extracaoLlmHabilitada,
  relatorioConvenioLlmHabilitado,
  relatorioFamiliaLlmHabilitado,
} from "./flags";

const TODAS = Object.keys(FLAGS) as Array<keyof typeof FLAGS>;

describe("flags.ts — inventário de flags (A-04)", () => {
  afterEach(() => {
    for (const env of TODAS) delete process.env[env];
  });

  test("o inventário lista exatamente as quatro flags do produto", () => {
    // Lista LITERAL, não derivada do módulo: uma flag nova precisa aparecer
    // aqui de propósito, para que o revisor veja o gate entrar no inventário.
    expect(TODAS.sort()).toEqual(
      [
        "CONVENIO_REPORT_LLM_ENABLED",
        "EXTRACTION_LLM_ENABLED",
        "FAMILY_REPORT_LLM_ENABLED",
        "FEATURE_FLAG_ASR_ENABLED",
      ].sort(),
    );
  });

  test("cada leitor está ligado à variável de ambiente que o inventário diz", () => {
    for (const env of TODAS) {
      for (const outra of TODAS) delete process.env[outra];
      process.env[env] = "true";
      expect(FLAGS[env](), env).toBe(true);
      // Só a variável própria liga: as outras continuam desligadas.
      for (const outra of TODAS) {
        if (outra !== env)
          expect(FLAGS[outra](), `${outra} com ${env}`).toBe(false);
      }
    }
  });

  describe.each(TODAS)("%s — default fail-closed", (env) => {
    const ler = () => FLAGS[env]();

    test("variável ausente → false", () => {
      delete process.env[env];
      expect(ler()).toBe(false);
    });

    test.each(["", "false", "1", "yes", "TRUE", " true"])(
      "valor %j → false",
      (valor) => {
        process.env[env] = valor;
        expect(ler()).toBe(false);
      },
    );

    test('valor "true" → true', () => {
      process.env[env] = "true";
      expect(ler()).toBe(true);
    });
  });
});

describe("flags.ts — leitores nomeados", () => {
  afterEach(() => {
    for (const env of TODAS) delete process.env[env];
  });

  test("asrHabilitado lê FEATURE_FLAG_ASR_ENABLED (T13, #72)", () => {
    process.env.FEATURE_FLAG_ASR_ENABLED = "true";
    expect(asrHabilitado()).toBe(true);
  });

  test("extracaoLlmHabilitada lê EXTRACTION_LLM_ENABLED (D57)", () => {
    process.env.EXTRACTION_LLM_ENABLED = "true";
    expect(extracaoLlmHabilitada()).toBe(true);
  });

  test("relatorioFamiliaLlmHabilitado lê FAMILY_REPORT_LLM_ENABLED", () => {
    process.env.FAMILY_REPORT_LLM_ENABLED = "true";
    expect(relatorioFamiliaLlmHabilitado()).toBe(true);
  });

  test("relatorioConvenioLlmHabilitado lê CONVENIO_REPORT_LLM_ENABLED", () => {
    process.env.CONVENIO_REPORT_LLM_ENABLED = "true";
    expect(relatorioConvenioLlmHabilitado()).toBe(true);
  });
});
