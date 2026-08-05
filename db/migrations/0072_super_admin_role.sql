-- Adiciona o flag `is_super_admin` à tabela `app_user` para o RBAC de plataforma do Iris (#184).
-- Padrão: false. Apenas administradores globais da plataforma têm este valor como true.

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Grant explícito de leitura para as roles do Postgres (conforme regra 4 de migrações no CLAUDE.md)
GRANT SELECT(is_super_admin) ON app_user TO iris_auth;
GRANT SELECT(is_super_admin) ON app_user TO app_role;

-- Grants para consultas agregadas do Super Admin (plano de plataforma / iris_auth)
GRANT SELECT(id, clinic_id, arquivado_em) ON patient TO iris_auth;
GRANT SELECT(id, clinic_id, severidade, criado_em) ON alerta_risco_clinico TO iris_auth;

-- RLS Policy para a role iris_auth realizar contagem de plataforma de pacientes e alertas de risco (sem dados sensíveis)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient' AND policyname = 'patient_auth_select'
  ) THEN
    CREATE POLICY patient_auth_select ON patient FOR SELECT TO iris_auth USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'alerta_risco_clinico' AND policyname = 'alerta_risco_auth_select'
  ) THEN
    CREATE POLICY alerta_risco_auth_select ON alerta_risco_clinico FOR SELECT TO iris_auth USING (true);
  END IF;
END $$;
