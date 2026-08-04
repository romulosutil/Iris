import "server-only";
import crypto from "node:crypto";
import { requireRole } from "@/auth/require-role";
import type { TenantContext } from "@/db/rls";
import { provisionUser } from "@/auth/provisioning";
import type { Papel } from "@/auth/papel-ativo";
import { comEscrita } from "@/lib/billing/guard-escrita";
import { enviarEmailTransacional } from "@/lib/email/transacional";
import {
  criarTemplateConviteNovoUsuario,
  criarTemplateConviteUsuarioExistente,
} from "@/lib/email/templates";

export type ConvidarState = {
  error?: string;
  senhaTemporaria?: string;
  emailEnviado?: boolean;
  sucesso?: boolean;
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
async function convidarUsuarioCore(
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
  const { isNewUser } = await provisionUser({
    email,
    nome,
    senha: senhaTemporaria,
    clinicId: ctx.clinicId,
    papel: papel as Papel,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const loginUrl = new URL("/login", appUrl).toString();
  const nomeEscapado = escapeHtml(nome);

  // Usuário novo: recebe a senha temporária no e-mail e na tela do coordenador.
  // Usuário pré-existente: a senha do app_user é mantida intocada; o e-mail o orienta a entrar com a senha atual.
  if (isNewUser) {
    const template = criarTemplateConviteNovoUsuario({
      nome,
      senhaTemporaria,
      loginUrl,
    });
    const emailRes = await enviarEmailTransacional({
      para: email,
      assunto: template.assunto,
      texto: template.texto,
      html: template.html,
    });
    return { sucesso: true, senhaTemporaria, emailEnviado: emailRes.enviado };
  }

  const templateExistente = criarTemplateConviteUsuarioExistente({
    nome,
    loginUrl,
  });
  const emailRes = await enviarEmailTransacional({
    para: email,
    assunto: templateExistente.assunto,
    texto: templateExistente.texto,
    html: templateExistente.html,
  });

  return { sucesso: true, emailEnviado: emailRes.enviado };
}

/**
 * Convite cria `app_user`/`user_role` (via `provisionUser`) e dispara e-mail —
 * escrita, e das caras: crescer a equipe é exatamente o que a conta em
 * somente-leitura não pode fazer. O guard fica antes de qualquer efeito para
 * não deixar e-mail enviado com provisionamento negado.
 */
export const convidarUsuario = comEscrita(convidarUsuarioCore);
