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

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Fatia A (#163): sem e-mail verificado não se entra em dado clínico.
    // A migração 0059 fez o backfill das contas pré-existentes no mesmo commit.
    requireEmailVerification: true,
    // Task 9, fix round 1 (finding I1 do review): o cadastro (Task 7) exige
    // mínimo 12 / máximo 128 caracteres, mas isso vive só em
    // `cadastro/logic.ts` (`validarCadastro`) — validação DE APLICAÇÃO,
    // pré-núcleo. O Better-Auth em si nunca soube desses números: sem esta
    // config, `minPasswordLength` ficava no default da biblioteca (8) e
    // `POST /api/auth/reset-password` aceitava senha de 8 caracteres mesmo
    // com o formulário de `/redefinir-senha` exigindo 12 no navegador — a
    // troca de senha virava o caminho mais barato para furar a política que
    // o cadastro aplica no servidor. `maxPasswordLength` já coincidia com o
    // default (128), mas é fixado aqui explicitamente para não depender do
    // default da lib mudar sem que ninguém perceba (é o mesmo número que
    // `MAX_SENHA` em `cadastro/logic.ts` — ver o comentário lá sobre por que
    // o teto importa tanto quanto o piso).
    minPasswordLength: 12,
    maxPasswordLength: 128,
    // Task 9, fix round 1 (finding C2 do review): resetar a senha é
    // exatamente o controle de recuperação que uma conta comprometida usa
    // para se defender — se a sessão do atacante sobrevive à troca, o reset
    // não expulsa quem já está dentro. Confirmado lendo
    // `node_modules/better-auth/dist/api/routes/password.mjs:163`
    // (`if (...revokeSessionsOnPasswordReset) await
    // ...deleteUserSessions(userId)`): o default é `false`, e nenhum plugin
    // configurado aqui (`twoFactorPlugin`) chama `deleteUserSessions` por
    // conta própria em troca de senha — confirmado por busca em
    // `node_modules/better-auth/dist/plugins/two-factor/**`, sem ocorrência.
    // Sem este `true`, o cookie de sessão continuava válido depois do reset.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      dispararEmail({
        para: user.email,
        assunto: "Redefinir sua senha no Iris",
        texto: `Para redefinir sua senha, acesse: ${url}`,
        html: `<p>Para redefinir sua senha, <a href="${url}">clique aqui</a>.</p><p>Se não foi você, ignore este e-mail.</p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      dispararEmail({
        para: user.email,
        assunto: "Confirme seu e-mail no Iris",
        texto: `Para confirmar seu e-mail, acesse: ${url}`,
        html: `<p>Para confirmar seu e-mail e ativar sua conta, <a href="${url}">clique aqui</a>.</p>`,
      });
    },
  },
  // DB gera o id (uuid default) — não deixar o Better-Auth gerar string.
  advanced: { database: { generateId: false } },
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
