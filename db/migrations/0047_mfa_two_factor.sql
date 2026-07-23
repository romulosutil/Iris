-- Fase 6.2b — MFA (TOTP + backup codes) via plugin twoFactor do Better-Auth.
-- Duas mudanças de schema que o plugin exige (contrato v1.6.23):
--   (a) coluna `two_factor_enabled` em app_user (flag de enrollment);
--   (b) tabela `two_factor` (secret + backup_codes CIFRADOS pelo Better-Auth).
-- Segredo TOTP é credencial: mesmo tratamento de auth_account (0002) — só
-- iris_auth toca, app_role (papel de tenant) NUNCA.
--> statement-breakpoint
ALTER TABLE app_user ADD COLUMN two_factor_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE two_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE cascade,
  secret text NOT NULL,                 -- segredo TOTP (cifrado pelo Better-Auth)
  backup_codes text NOT NULL,           -- códigos de backup (cifrados, blob único)
  verified boolean NOT NULL DEFAULT true,
  failed_verification_count integer NOT NULL DEFAULT 0,  -- account lockout (1.6.23)
  locked_until timestamptz
);
--> statement-breakpoint
CREATE INDEX idx_two_factor_user ON two_factor(user_id);
--> statement-breakpoint
-- Credencial: revoga do papel de tenant, concede só ao iris_auth (espelha auth_account).
REVOKE ALL ON two_factor FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON two_factor TO iris_auth;
--> statement-breakpoint
ALTER TABLE two_factor ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE two_factor FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY two_factor_auth_all ON two_factor FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
