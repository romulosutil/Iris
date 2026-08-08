/**
 * Sanitiza e valida um CPF pelo algoritmo oficial (Módulo 11). Usado por
 * #191 para exigir CPF do paciente adulto ou do responsável legal do menor.
 */
export function validarEMaterializarCPF(
  input: string,
): { valido: true; cpfLimpo: string } | { valido: false; erro: string } {
  const limpo = input.replace(/\D/g, "");

  if (limpo.length !== 11) {
    return {
      valido: false,
      erro: "CPF deve conter exatamente 11 dígitos numéricos.",
    };
  }
  if (/^(\d)\1{10}$/.test(limpo)) {
    return { valido: false, erro: "CPF inválido (sequência repetida)." };
  }

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(limpo.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(9), 10)) {
    return {
      valido: false,
      erro: "CPF inválido (dígito verificador incorreto).",
    };
  }

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(limpo.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.charAt(10), 10)) {
    return {
      valido: false,
      erro: "CPF inválido (dígito verificador incorreto).",
    };
  }

  return { valido: true, cpfLimpo: limpo };
}
