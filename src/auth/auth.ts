import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import {
  appUser,
  authAccount,
  authSession,
  authVerification,
} from "@/db/schema";

/**
 * Better-Auth — auth in-app (Postgres puro, sem Supabase). A tabela `user` do
 * Better-Auth É o nosso `app_user` (todas as FKs do domínio apontam pra ele),
 * com id UUID gerado pelo banco. Papéis ficam em `user_role` (fora daqui).
 * MFA entra no hardening pré-dado-real (checklist LGPD, AGENTS.md §8).
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true },
  // DB gera o id (uuid default) — não deixar o Better-Auth gerar string.
  advanced: { database: { generateId: false } },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: appUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
});
