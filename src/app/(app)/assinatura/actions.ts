"use server";

import { getTenantContext } from "@/auth/tenant";
import { iniciarAtivacaoAssinatura, type AtivacaoState } from "./logic";

/**
 * Wrapper de server action. Deriva o tenant do servidor e delega ao núcleo em
 * `logic.ts` — nenhuma função exportada daqui aceita `ctx`, senão viraria um
 * endpoint client-invocável com tenant forjável (#55).
 */
export async function ativarAssinatura(
  _prev: AtivacaoState,
  formData: FormData,
): Promise<AtivacaoState> {
  const ctx = await getTenantContext();
  return iniciarAtivacaoAssinatura(ctx, formData);
}
