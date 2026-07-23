/**
 * Fase 6.2 (R6.2.2 / achado adversarial A5) — trava de segurança do bypass de MFA.
 *
 * `BYPASS_MFA_FOR_DEV=true` desliga a exigência de MFA para agilizar o dev. Se
 * essa flag VAZAR para produção, ela desliga MFA de papel clínico sem alarme —
 * exatamente o tipo de falha silenciosa que a LGPD não perdoa. Por isso o gate é
 * **hard-fail no boot**: em `NODE_ENV=production` com o bypass ligado, o processo
 * lança e não sobe (fail-closed), em vez de default-false silencioso.
 *
 * Função pura (recebe o env) para ser testável; chamada por efeito colateral no
 * topo de `auth.ts`, que é importado por todo caminho de auth/servidor.
 */
export function assertMfaBypassSafe(env: NodeJS.ProcessEnv = process.env): void {
  const bypass = env.BYPASS_MFA_FOR_DEV === "true";
  const producao = env.NODE_ENV === "production";
  if (bypass && producao) {
    throw new Error(
      "BYPASS_MFA_FOR_DEV=true é proibido em produção (NODE_ENV=production): " +
        "desligaria o MFA de papéis clínicos sem alarme. Remova a flag do ambiente.",
    );
  }
}
