import "server-only";
import crypto from "node:crypto";
import { requireRole } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import { provisionUser } from "@/auth/provisioning";
import type { Papel } from "@/auth/papel-ativo";
import { enviarEmailTransacional } from "@/lib/email/transacional";

export type ConvidarState = {
  error?: string;
  senhaTemporaria?: string;
  emailEnviado?: boolean;
};

// Coordenador não se convida nem convida outro coordenador por esta tela —
// promoção a coordenador é ato separado (fora do escopo 1c).
const PAPEIS_CONVITE = ["terapeuta", "admin_recepcao"] as const;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convida um profissional para a clínica ativa. Só coordenador. Reusa
 * provisionUser (authDb/iris_auth já tem grant em user_role) — autorização é
 * de app (requireRole), não de RLS.
 *
 * Envia e-mail de convite transacional com a senha temporária via
 * `enviarEmailTransacional` (#155). Se o provedor de e-mail estiver
 * indisponível, a senha temporária continua sendo devolvida ao coordenador
 * para ser copiada manualmente.
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const loginUrl = new URL("/login", appUrl).toString();
  const nomeEscapado = escapeHtml(nome);

  const emailRes = await enviarEmailTransacional({
    para: email,
    assunto: "Convite para integrar a equipe no Iris",
    texto: `Olá, ${nome}!\n\nVocê foi convidado(a) para se juntar à equipe da clínica no Iris.\nSua senha temporária de acesso é: ${senhaTemporaria}\n\nAcesse ${loginUrl} para realizar seu primeiro acesso.`,
    html: `<p>Olá, <strong>${nomeEscapado}</strong>!</p><p>Você foi convidado(a) para se juntar à equipe da clínica no Iris.</p><p>Sua senha temporária de acesso é: <code>${senhaTemporaria}</code></p><p><a href="${loginUrl}">Clique aqui para acessar a plataforma</a></p>`,
  });

  return { senhaTemporaria, emailEnviado: emailRes.enviado };
}
