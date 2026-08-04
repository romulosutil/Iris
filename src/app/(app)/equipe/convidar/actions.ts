"use server";
import { getTenantContext } from "@/auth/tenant";
import { convidarUsuario } from "./logic";

export type ConvidarState = {
  error?: string;
  senhaTemporaria?: string;
  emailEnviado?: boolean;
  sucesso?: boolean;
};

/** Wrapper de request — deriva o tenant do servidor (ctx nunca vem do cliente). */
export async function convidarUsuarioAction(
  _prev: ConvidarState,
  formData: FormData,
): Promise<ConvidarState> {
  const ctx = await getTenantContext();
  return convidarUsuario(ctx, formData);
}
