import { describe, expect, it } from "vitest";
import { validarEMaterializarCnpj } from "./cnpj";

// CNPJs matematicamente válidos (Módulo 11), conferidos com o algoritmo
// oficial antes de usar:
// - 11.222.333/0001-81: CNPJ de teste clássico, DVs 8 e 1.
// - 29.811.201/0001-50: CNPJ real do operador (R Sutil Correa Ltda), usado
//   aqui como segundo caso independente — prova que o cálculo não é hardcoded.
const CNPJ_VALIDO_1 = "11222333000181";
const CNPJ_VALIDO_2 = "29811201000150";

describe("validarEMaterializarCnpj", () => {
  it("aceita CNPJ válido sem máscara e retorna os 14 dígitos como cnpjLimpo", () => {
    const resultado = validarEMaterializarCnpj(CNPJ_VALIDO_1);
    expect(resultado).toEqual({ valido: true, cnpjLimpo: CNPJ_VALIDO_1 });
  });

  it("aceita CNPJ válido com máscara e sanitiza para cnpjLimpo sem pontuação", () => {
    const resultado = validarEMaterializarCnpj("11.222.333/0001-81");
    expect(resultado).toEqual({ valido: true, cnpjLimpo: CNPJ_VALIDO_1 });
  });

  it("aceita um segundo CNPJ válido distinto (confirma que não é caso hardcoded)", () => {
    const resultado = validarEMaterializarCnpj("29.811.201/0001-50");
    expect(resultado).toEqual({ valido: true, cnpjLimpo: CNPJ_VALIDO_2 });
  });

  it("rejeita CNPJ com 1º dígito verificador incorreto", () => {
    // CNPJ_VALIDO_1 com o 13º dígito (1º verificador) alterado de 8 para 7.
    const resultado = validarEMaterializarCnpj("11222333000171");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/dígito verificador incorreto/);
    }
  });

  it("rejeita CNPJ com 2º dígito verificador incorreto", () => {
    // CNPJ_VALIDO_1 com o 14º dígito (2º verificador) alterado de 1 para 2;
    // o 1º DV continua batendo, então só a checagem do 2º falha.
    const resultado = validarEMaterializarCnpj("11222333000182");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/dígito verificador incorreto/);
    }
  });

  it("rejeita sequência de 14 dígitos repetidos", () => {
    const resultado1 = validarEMaterializarCnpj("11111111111111");
    const resultado2 = validarEMaterializarCnpj("00000000000000");
    expect(resultado1.valido).toBe(false);
    expect(resultado2.valido).toBe(false);
    if (!resultado1.valido) {
      expect(resultado1.erro).toMatch(/sequência repetida/);
    }
    if (!resultado2.valido) {
      expect(resultado2.erro).toMatch(/sequência repetida/);
    }
  });

  it("rejeita string com menos de 14 dígitos", () => {
    const resultado = validarEMaterializarCnpj("1122233300018");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/14 dígitos/);
    }
  });

  it("rejeita string com mais de 14 dígitos", () => {
    const resultado = validarEMaterializarCnpj("112223330001811");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/14 dígitos/);
    }
  });

  it("rejeita string vazia e string sem nenhum dígito", () => {
    expect(validarEMaterializarCnpj("").valido).toBe(false);
    expect(validarEMaterializarCnpj("abcdefghijklmn").valido).toBe(false);
  });
});
