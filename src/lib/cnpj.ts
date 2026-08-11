/**
 * Sanitiza e valida um CNPJ pelo algoritmo oficial (Módulo 11). Usado pela
 * ativação de billing (ATIV-02) para exigir o documento da clínica quando a
 * titular é pessoa jurídica.
 *
 * Limitação conhecida desta fase: a Receita passou a emitir CNPJ
 * **alfanumérico** a partir de jul/2026, cujo DV usa o valor ASCII dos
 * caracteres. Aqui só o formato numérico de 14 dígitos é aceito — e **não foi
 * verificado** se o Asaas já aceita o formato alfanumérico. Reavaliar antes de
 * onboardar clínica com inscrição nova.
 */
export function validarEMaterializarCnpj(
  input: string,
): { valido: true; cnpjLimpo: string } | { valido: false; erro: string } {
  const limpo = input.replace(/\D/g, "");

  if (limpo.length !== 14) {
    return {
      valido: false,
      erro: "CNPJ deve conter exatamente 14 dígitos numéricos.",
    };
  }
  if (/^(\d)\1{13}$/.test(limpo)) {
    return { valido: false, erro: "CNPJ inválido (sequência repetida)." };
  }

  // Pesos oficiais: 5..2 seguido de 9..2 para o 1º DV; 6..2 seguido de 9..2
  // para o 2º DV (que já inclui o 1º DV no cálculo).
  const PESOS_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const PESOS_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  // Itera sobre os pesos (e não sobre um range numérico) para que o índice
  // nunca escape do array sob `noUncheckedIndexedAccess`.
  let soma = PESOS_PRIMEIRO.reduce(
    (acc, peso, i) => acc + parseInt(limpo.charAt(i), 10) * peso,
    0,
  );
  let resto = soma % 11;
  let digito = resto < 2 ? 0 : 11 - resto;
  if (digito !== parseInt(limpo.charAt(12), 10)) {
    return {
      valido: false,
      erro: "CNPJ inválido (dígito verificador incorreto).",
    };
  }

  soma = PESOS_SEGUNDO.reduce(
    (acc, peso, i) => acc + parseInt(limpo.charAt(i), 10) * peso,
    0,
  );
  resto = soma % 11;
  digito = resto < 2 ? 0 : 11 - resto;
  if (digito !== parseInt(limpo.charAt(13), 10)) {
    return {
      valido: false,
      erro: "CNPJ inválido (dígito verificador incorreto).",
    };
  }

  return { valido: true, cnpjLimpo: limpo };
}
