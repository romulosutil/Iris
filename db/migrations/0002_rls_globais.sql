-- Fase 1b — RLS das tabelas globais + role de auth (iris_auth).
-- Fecha o item diferido das 4 rodadas Jules: clinic/app_user/user_role/auth_*
-- tinham GRANT ALL a app_role SEM RLS. iris_auth é NOBYPASSRLS (least-privilege,
-- não fura o gargalo withTenant). Ver docs/superpowers/specs/2026-07-10-fase-1b-*.

-- iris_auth: role de PRIVILÉGIO (NOLOGIN). O usuário que conecta é criado por
-- ambiente (LOGIN ... IN ROLE iris_auth), fora das migrations. Ver infra/README.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'iris_auth') THEN
    CREATE ROLE iris_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO iris_auth;
--> statement-breakpoint

-- auth_* : só iris_auth toca. Revoga de app_role (maior brecha: app_role
-- escrevendo/lendo tabela de sessão e credencial).
REVOKE ALL ON auth_session, auth_account, auth_verification FROM app_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_session, auth_account, auth_verification TO iris_auth;
--> statement-breakpoint
-- Globais de identidade: iris_auth lê (bootstrap) e escreve (seed/provisioning).
GRANT SELECT, INSERT, UPDATE, DELETE ON app_user, clinic, user_role TO iris_auth;
--> statement-breakpoint

-- ─── app_user (identidade global; app_role vê só quem é da clínica ativa) ─────
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_user_auth_all ON app_user FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY app_user_read ON app_user FOR SELECT TO app_role USING (
  EXISTS (
    SELECT 1 FROM user_role r
    WHERE r.user_id = app_user.id
      AND r.clinic_id = current_setting('app.clinic_id')::uuid
  )
);
--> statement-breakpoint

-- ─── clinic ──────────────────────────────────────────────────────────────────
ALTER TABLE clinic ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clinic FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY clinic_auth_all ON clinic FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY clinic_read ON clinic FOR SELECT TO app_role
  USING (id = current_setting('app.clinic_id')::uuid);
--> statement-breakpoint

-- ─── user_role ───────────────────────────────────────────────────────────────
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_role FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_role_auth_all ON user_role FOR ALL TO iris_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Escrita de user_role por app_role (convite) entra na Fase 1c; na 1b só
-- iris_auth escreve (seed/provisioning). app_role só lê a própria clínica.
CREATE POLICY user_role_read ON user_role FOR SELECT TO app_role
  USING (clinic_id = current_setting('app.clinic_id')::uuid);
