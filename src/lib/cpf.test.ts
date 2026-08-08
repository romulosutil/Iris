import { describe, expect, it } from "vitest";
import { validarEMaterializarCPF } from "./cpf";

// CPFs matematicamente válidos (Módulo 11), conferidos à mão antes de usar:
// - 529.982.247-25: soma ponderada dos 9 primeiros dígitos (5,2,9,9,8,2,2,4,7)
//   com pesos 10..2 = 295; (295*10)%11 = 2 => 1º dígito = 2 (bate).
//   Repetindo com d1..d10 e pesos 11..2 = 347; (347*10)%11 = 5 => 2º dígito = 5 (bate).
// - 111.444.777-35: análogo, resultando em 3 e 5 — CPF de teste clássico.
const CPF_VALIDO_1 = "52998224725";
const CPF_VALIDO_2 = "11144477735";

describe("validarEMaterializarCPF", () => {
  it("aceita CPF válido sem máscara e retorna os 11 dígitos como cpfLimpo", () => {
    const resultado = validarEMaterializarCPF(CPF_VALIDO_1);
    expect(resultado).toEqual({ valido: true, cpfLimpo: CPF_VALIDO_1 });
  });

  it("aceita CPF válido com máscara e sanitiza para cpfLimpo sem pontuação", () => {
    const resultado = validarEMaterializarCPF("529.982.247-25");
    expect(resultado).toEqual({ valido: true, cpfLimpo: CPF_VALIDO_1 });
  });

  it("aceita um segundo CPF válido distinto (confirma que não é caso hardcoded)", () => {
    const resultado = validarEMaterializarCPF("111.444.777-35");
    expect(resultado).toEqual({ valido: true, cpfLimpo: CPF_VALIDO_2 });
  });

  it("rejeita string com menos de 11 dígitos", () => {
    const resultado = validarEMaterializarCPF("1234567890");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/11 dígitos/);
    }
  });

  it("rejeita string com mais de 11 dígitos", () => {
    const resultado = validarEMaterializarCPF("123456789012");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/11 dígitos/);
    }
  });

  it("rejeita sequência repetida (todos os dígitos iguais)", () => {
    const resultado1 = validarEMaterializarCPF("11111111111");
    const resultado2 = validarEMaterializarCPF("00000000000");
    expect(resultado1.valido).toBe(false);
    expect(resultado2.valido).toBe(false);
    if (!resultado1.valido) {
      expect(resultado1.erro).toMatch(/sequência repetida/);
    }
    if (!resultado2.valido) {
      expect(resultado2.erro).toMatch(/sequência repetida/);
    }
  });

  it("rejeita CPF com 1º dígito verificador incorreto", () => {
    // CPF_VALIDO_1 com o 10º dígito (1º verificador) alterado de 2 para 3;
    // o restante da string permanece igual, então só o cálculo do 1º dígito falha.
    const resultado = validarEMaterializarCPF("52998224735");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/dígito verificador incorreto/);
    }
  });

  it("rejeita CPF com 2º dígito verificador incorreto", () => {
    // CPF_VALIDO_1 com o 11º dígito (2º verificador) alterado de 5 para 6;
    // o 1º dígito continua batendo (não depende do 11º), só o 2º falha —
    // isso prova que a checagem do 2º dígito é exercitada de fato.
    const resultado = validarEMaterializarCPF("52998224726");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/dígito verificador incorreto/);
    }
  });

  it("rejeita string vazia", () => {
    const resultado = validarEMaterializarCPF("");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/11 dígitos/);
    }
  });

  it("rejeita string só com letras (sem nenhum dígito)", () => {
    const resultado = validarEMaterializarCPF("abcdefghijk");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erro).toMatch(/11 dígitos/);
    }
  });
});
