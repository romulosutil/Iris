import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins";
import { authDb } from "@/db/client";
import { enviarEmailTransacional } from "@/lib/email/transacional";
import {
  appUser,
  authAccount,
  authSession,
  authVerification,
  twoFactor,
} from "@/db/schema";
import { assertMfaBypassSafe } from "./mfa-gate";

import {
  criarTemplateRedefinicaoSenha,
  criarTemplateVerificacaoEmail,
} from "@/lib/email/templates";

import { getAppBaseUrl } from "@/lib/app-url";

// Fase 6.2 (A5): fail-closed no boot se o bypass de MFA vazar para produção.
// Roda na 1ª importação de qualquer caminho de auth/servidor.
assertMfaBypassSafe();

/**
 * Better-Auth — auth in-app (Postgres puro, sem Supabase). A tabela `user` do
 * Better-Auth É o nosso `app_user` (todas as FKs do domínio apontam pra ele),
 * com id UUID gerado pelo banco. Papéis ficam em `user_role` (fora daqui).
 * MFA entra no hardening pré-dado-real (checklist LGPD, AGENTS.md §8).
 */
/**
 * Dispara o e-mail FORA do caminho da requisição (Fatia A, #163, Task 7 —
 * finding 2 do review).
 *
 * Por que isto é de SEGURANÇA e não só de performance: `sendOnSignUp` faz o
 * Better-Auth AGUARDAR este callback dentro de `signUpEmail`, que é chamado por
 * `provisionUser` dentro de `criarContaEClinica`. Ou seja, um round-trip de
 * rede até o Resend ficava no caminho síncrono do ramo "e-mail novo" do
 * cadastro público — e SÓ dele (o ramo "e-mail existente" não cria conta e não
 * manda e-mail). A rota de cadastro normaliza o tempo de resposta com um piso
 * justamente para não virar oráculo de enumeração; um round-trip de rede
 * variável é exatamente o tipo de coisa que estoura esse piso num dia ruim e
 * inverte o oráculo (e-mail desconhecido LENTO, e-mail conhecido rápido).
 *
 * Destacar é seguro porque `enviarEmailTransacional` tem contrato de NÃO
 * LANÇAR (degrada e loga — ver src/lib/email/transacional.ts): não existe erro
 * a propagar que o chamador pudesse tratar. O `.catch` é cinto de segurança
 * contra rejeição inesperada virar `unhandledRejection` e derrubar o processo.
 */
function dispararEmail(
  input: Parameters<typeof enviarEmailTransacional>[0],
): void {
  void enviarEmailTransacional(input).catch((err) => {
    console.error("dispararEmail: falha fora do caminho da requisição:", err);
  });
}

const appUrl = getAppBaseUrl();

if (
  process.env.NODE_ENV === "production" &&
  !process.env.BETTER_AUTH_URL &&
  !process.env.NEXT_PUBLIC_APP_URL
) {
  console.warn(
    "ALERTA PRODUÇÃO: Nem BETTER_AUTH_URL nem NEXT_PUBLIC_APP_URL foram informadas. Usando URL fallback:",
    appUrl,
  );
}

const origensPadrao = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  ...(appUrl ? [appUrl] : []),
];

const origensExtras = process.env.TRUSTED_ORIGINS
  ? process.env.TRUSTED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : [];

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl,
  trustedOrigins: Array.from(new Set([...origensPadrao, ...origensExtras])),
  emailAndPassword: {
    enabled: true,
    // Fatia A (#163): sem e-mail verificado não se entra em dado clínico.
    // A migração 0059 fez o backfill das contas pré-existentes no mesmo commit.
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const template = criarTemplateRedefinicaoSenha(url);
      dispararEmail({
        para: user.email,
        assunto: template.assunto,
        texto: template.texto,
        html: template.html,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const template = criarTemplateVerificacaoEmail(url);
      dispararEmail({
        para: user.email,
        assunto: template.assunto,
        texto: template.texto,
        html: template.html,
      });
    },
  },
  // DB gera o id (uuid default) — não deixar o Better-Auth gerar string.
  advanced: {
    database: { generateId: false },
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  // Fase 6.2b: MFA TOTP + backup codes. Enrollment exige verificação (fluxo
  // padrão: enable → verifyTotp ativa). Papéis clínicos são obrigados a cadastrar
  // (enforcement em getTenantContext).
  plugins: [twoFactorPlugin({ issuer: "Iris" })],
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema: {
      user: appUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
      twoFactor,
    },
  }),
});
