"use client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? undefined
      : process.env.NEXT_PUBLIC_APP_URL,
  // Fase 6.2b: expõe authClient.twoFactor.{enable,verifyTotp,verifyBackupCode,...}.
  // Login com 2FASE pendente devolve { twoFactorRedirect: true } (sem sessão);
  // o handler de login manda para /mfa/verify.
  plugins: [twoFactorClient()],
});

export const { signIn, signOut, useSession } = authClient;
