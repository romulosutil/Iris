import "server-only";
import crypto from "node:crypto";
import { requireRole } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import { provisionUser } from "@/auth/provisioning";
import type { Papel } from "@/auth/papel-ativo";

export type ConvidarState = { error?: string; senhaTemporaria?: string };

// Coordenador não se convida nem convida outro coordenador por esta tela —
// promoção a coordenador é ato separado (fora do escopo 1c).
const PAPEIS_CONVITE = ["terapeuta", "admin_recepcao"] as const;

/**
 * Convida um profissional para a clínica ativa. Só coordenador. Reusa
 * provisionUser (authDb/iris_auth já tem grant em user_role) — autorização é
 * de app (requireRole), não de RLS. Sem provedor de e-mail no escopo 1c: gera
 * senha temporária e devolve para a página exibir UMA vez ao coordenador.
 *
 * Núcleo `ctx`-accepting — vive em módulo `server-only` (NÃO `"use server"`),
 * então nunca vira endpoint invocável pelo cliente. `ctx` é sempre derivado no
 * servidor pelo wrapper `*Action` em `./actions`.
 */
export async function convidarUsuario(
  ctx: TenantContext,
  formData: FormData,
): Promise<ConvidarState> {
  requireRole(ctx, "coordenador");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Nome é obrigatório." };
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "E-mail inválido." };
  }
  const papel = String(formData.get("papel") ?? "").trim();
  if (!PAPEIS_CONVITE.includes(papel as (typeof PAPEIS_CONVITE)[number])) {
    return { error: "Só é possível convidar terapeuta ou recepção por aqui." };
  }

  const senhaTemporaria = crypto.randomBytes(12).toString("base64url");
  await provisionUser({
    email,
    nome,
    senha: senhaTemporaria,
    clinicId: ctx.clinicId,
    papel: papel as Papel,
  });
  return { senhaTemporaria };
}
