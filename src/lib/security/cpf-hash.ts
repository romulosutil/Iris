import "server-only";
import { createHmac } from "crypto";

/**
 * Hash cego (HMAC-SHA256) do CPF, usado só para o EXISTS cross-tenant
 * anti-fraude de trial (#191) — nunca para reidentificar o titular.
 *
 * Sem fallback: um salt hardcoded no repo anularia a proteção (qualquer um
 * com o código recalcularia o hash de um CPF conhecido). Ausência de
 * `CPF_HASH_SALT` é erro de configuração, não caso a degradar em silêncio.
 */
export function gerarCpfHash(cpfLimpo: string): string {
  const salt = process.env.CPF_HASH_SALT;
  if (!salt) {
    throw new Error(
      "CPF_HASH_SALT não configurado — obrigatório para o hash anti-fraude de trial (#191).",
    );
  }
  return createHmac("sha256", salt).update(cpfLimpo).digest("hex");
}
