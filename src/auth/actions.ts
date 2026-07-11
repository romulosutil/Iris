"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_CLINICA, COOKIE_PAPEL } from "@/auth/tenant";

/**
 * Cookies de SELEÇÃO (A1): guardam apenas a escolha do usuário. Pertencimento
 * e papel são sempre re-derivados de `user_role` em `resolveTenant` a cada
 * request — o cookie nunca é usado para autorização, então não precisa ser
 * assinado. `httpOnly` para não ser lido por JS; `secure` só em produção.
 */
const base = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function definirClinicaAtiva(clinicId: string) {
  const ck = await cookies();
  ck.set(COOKIE_CLINICA, clinicId, base);
  ck.delete(COOKIE_PAPEL); // troca de clínica reseta o papel selecionado
  redirect("/");
}

export async function definirPapelAtivo(papel: string) {
  const ck = await cookies();
  ck.set(COOKIE_PAPEL, papel, base);
  redirect("/");
}
