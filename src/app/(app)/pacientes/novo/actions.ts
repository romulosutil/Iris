"use server";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/auth/tenant";
import { criarPacienteEConsent, type CadastroAdminState } from "./logic";

export type { CadastroAdminState } from "./logic";

/**
 * Wrapper de request para `useActionState`: deriva o tenant do servidor (nunca
 * do cliente), chama o núcleo em `./logic` e redireciona ao cadastro clínico.
 *
 * Este é o ÚNICO ponto de entrada invocável pelo cliente. O núcleo
 * `criarPacienteEConsent` (que recebe `ctx`) vive em `./logic` (`server-only`,
 * sem `"use server"`) e não pode ser chamado direto pelo cliente — fecha a
 * brecha de `ctx` forjável (cross-tenant / integridade do consent LGPD).
 */
export async function cadastrarPacienteAdministrativo(
  _prev: CadastroAdminState,
  formData: FormData,
): Promise<CadastroAdminState> {
  const ctx = await getTenantContext();
  const resultado = await criarPacienteEConsent(ctx, formData);
  // `bloqueioBilling` precisa atravessar até o formulário: é ele que decide
  // entre "corrija o campo" e "ative a assinatura". Devolver só `error`
  // apagaria o motivo e a UI teria de adivinhar pelo texto (#36).
  if (resultado.error || resultado.bloqueioBilling) {
    return {
      error: resultado.error,
      bloqueioBilling: resultado.bloqueioBilling,
    };
  }
  redirect(`/pacientes/${resultado.id}/cadastro-clinico`);
}
