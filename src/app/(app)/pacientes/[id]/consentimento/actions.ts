"use server";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/auth/tenant";
import type { EventoConsentimento, EventoConsentimentoState } from "./logic";
import { registrarEventoConsentimento } from "./logic";

// Só TIPO é reexportado daqui. Reexportar `registrarEventoConsentimento` (que
// aceita `ctx`) de um módulo `"use server"` publicaria o núcleo como endpoint
// invocável pelo cliente, com `ctx` forjado — bypass de RLS e de tenant. Foi
// exatamente a falha da #55. Não adicione um `export { registrarEvento... }`
// aqui, por conveniência de teste ou qualquer outro motivo: teste importa de
// `./logic`, que é `server-only` e não é um módulo de Server Actions.
export type { EventoConsentimento, EventoConsentimentoState } from "./logic";

/**
 * Único ponto de entrada invocável pelo cliente para registrar revogação
 * (#133), renovação por maioridade (#135) ou representação/emancipação (#134).
 * Deriva o tenant no servidor — nunca do cliente — e delega ao núcleo em
 * `./logic`.
 */
export async function registrarEventoConsentimentoAction(
  patientId: string,
  input: EventoConsentimento,
): Promise<EventoConsentimentoState> {
  const ctx = await getTenantContext();
  const resultado = await registrarEventoConsentimento(ctx, patientId, input);
  if (resultado.error) return { error: resultado.error };
  // A vigência do consentimento muda o que a ficha do paciente pode fazer.
  revalidatePath(`/pacientes/${patientId}`);
  return {};
}
