import { validarEMaterializarCnpj } from "./cnpj";
import { validarEMaterializarCPF } from "./cpf";

/**
 * Valida o documento da clínica aceitando CPF **ou** CNPJ: a interpretação é
 * decidida pelo comprimento em dígitos (11 = CPF, 14 = CNPJ), então a máscara
 * é irrelevante e o retorno traz só os dígitos. Usado por ATIV-02, onde a
 * titular do contrato pode ser pessoa física ou jurídica.
 *
 * O erro nomeia a interpretação que falhou — "CPF inválido (dígito verificador
 * incorreto)" é um diagnóstico diferente de comprimento fora dos dois formatos,
 * e confundir os dois custa suporte.
 */
export function validarEMaterializarCpfCnpj(
  input: string,
):
  | { valido: true; documentoLimpo: string; tipo: "cpf" | "cnpj" }
  | { valido: false; erro: string } {
  const limpo = input.replace(/\D/g, "");

  if (limpo.length === 11) {
    const resultado = validarEMaterializarCPF(limpo);
    return resultado.valido
      ? { valido: true, documentoLimpo: resultado.cpfLimpo, tipo: "cpf" }
      : { valido: false, erro: resultado.erro };
  }

  if (limpo.length === 14) {
    const resultado = validarEMaterializarCnpj(limpo);
    return resultado.valido
      ? { valido: true, documentoLimpo: resultado.cnpjLimpo, tipo: "cnpj" }
      : { valido: false, erro: resultado.erro };
  }

  return {
    valido: false,
    erro: "Documento deve ser um CPF (11 dígitos) ou um CNPJ (14 dígitos).",
  };
}
