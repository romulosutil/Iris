import { describe, expect, it } from "vitest";
import { validarEMaterializarCpfCnpj } from "./documento";

const CPF_VALIDO = "52998224725";
const CNPJ_VALIDO = "11222333000181";

describe("validarEMaterializarCpfCnpj", () => {
  it("interpreta 11 dígitos como CPF e devolve tipo cpf", () => {
    const resultado = validarEMaterializarCpfCnpj(CPF_VALIDO);
    expect(resultado).toEqual({
      valido: true,
      documentoLimpo: CPF_VALIDO,
      tipo: "cpf",
    });
  });

  it("interpreta 14 dígitos como CNPJ e devolve tipo cnpj", () => {
    const resultado = validarEMaterializarCpfCnpj(CNPJ_VALIDO);
    expect(resultado).toEqual({
      valido: true,
      documentoLimpo: CNPJ_VALIDO,
      tipo: "cnpj",
    });
  });

  it("aceita máscara em ambos os formatos e devolve só dígitos", () => {
    expect(validarEMaterializarCpfCnpj("529.982.247-25")).toEqual({
      valido: true,
      documentoLimpo: CPF_VALIDO,
      tipo: "cpf",
    });
    expect(validarEMaterializarCpfCnpj("11.222.333/0001-81")).toEqual({
      valido: true,
      documentoLimpo: CNPJ_VALIDO,
      tipo: "cnpj",
    });
  });

  it("propaga o erro de DV do CPF (nomeia a interpretação que falhou)", () => {
    const resultado = validarEMaterializarCpfCnpj("52998224735");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/^CPF inválido/);
      expect(resultado.erro).toMatch(/dígito verificador incorreto/);
    }
  });

  it("propaga o erro de DV do CNPJ (nomeia a interpretação que falhou)", () => {
    const resultado = validarEMaterializarCpfCnpj("11222333000182");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/^CNPJ inválido/);
      expect(resultado.erro).toMatch(/dígito verificador incorreto/);
    }
  });

  it("rejeita comprimento fora dos dois formatos citando ambos", () => {
    for (const entrada of ["", "123456789012", "112223330001811"]) {
      const resultado = validarEMaterializarCpfCnpj(entrada);
      expect(resultado.valido).toBe(false);
      if (!resultado.valido) {
        expect(resultado.erro).toMatch(/CPF \(11 dígitos\)/);
        expect(resultado.erro).toMatch(/CNPJ \(14 dígitos\)/);
      }
    }
  });
});
